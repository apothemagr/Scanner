import { useEffect, useRef, useState, useCallback } from 'react'
import { API, authFetch } from '../api'

export interface SearchScopeItem {
  sku: string
  name: string
  supplier_sku?: string | null
  total_stock?: number
  required_qty?: number
  picked_qty?: number
}

interface Props {
  onScan: (code: string) => void
  onStop?: () => void
  placeholder?: string
  paused?: boolean
  autoStart?: boolean
  type?: 'product' | 'location'
  cameraOnly?: boolean
  searchScope?: SearchScopeItem[]
  searchInPopup?: boolean
}


declare const BarcodeDetector: {
  new(opts: { formats: string[] }): { detect(src: HTMLVideoElement): Promise<{ rawValue: string }[]> }
  getSupportedFormats(): Promise<string[]>
}

const STORAGE_KEY = 'scanner_mode'

export default function BarcodeScanner({ onScan, onStop, placeholder = 'Σκανάρισμα...', paused = false, autoStart = false, type = 'product', cameraOnly = false, searchScope, searchInPopup = false }: Props) {
  const [showSearchPopup, setShowSearchPopup] = useState(false)
  const [mode, setMode] = useState<'input' | 'camera'>(
    () => cameraOnly ? 'camera' : (localStorage.getItem(STORAGE_KEY) as 'input' | 'camera') ?? 'camera'
  )
  const [inputVal, setInputVal] = useState('')
  const [nameVal, setNameVal] = useState('')
  const [skuVal, setSkuVal] = useState('')
  const [supSkuVal, setSupSkuVal] = useState('')
  const [activeField, setActiveField] = useState<'name' | 'sku' | 'supplier_sku' | null>(null)
  const [suggestions, setSuggestions] = useState<{ sku: string; name: string; supplier_sku?: string | null; total_stock?: number; required_qty?: number; picked_qty?: number }[]>([])
  const [locations, setLocations] = useState<{ id: number; code: string }[]>([])
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [cameraError, setCameraError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animRef = useRef<number>(0)
  const activeRef = useRef(false)
  const [scanning, setScanning] = useState(autoStart)
  const scanLoopRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const detectorRef = useRef<InstanceType<typeof BarcodeDetector> | null>(null)

  const stopCamera = () => {
    activeRef.current = false
    cancelAnimationFrame(animRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }

  const startCamera = async () => {
    if (activeRef.current) return
    setCameraError('')

    if (!('BarcodeDetector' in window)) {
      setCameraError('Ο browser δεν υποστηρίζει αυτόματο scanner. Χρησιμοποίησε χειροκίνητη εισαγωγή.')
      setMode('input')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          advanced: [{ zoom: 3 } as MediaTrackConstraintSet],
        }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      activeRef.current = true
      detectorRef.current = new BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'qr_code', 'code_128', 'code_39', 'itf', 'upc_a', 'upc_e']
      })
    } catch {
      setCameraError('Δεν επιτράπηκε πρόσβαση στην κάμερα. Χρησιμοποίησε χειροκίνητη εισαγωγή.')
      setMode('input')
    }
  }

  const stopScanLoop = () => {
    scanLoopRef.current = false
    setScanning(false)
  }

  const startScanLoop = async () => {
    if (!activeRef.current || !videoRef.current || !detectorRef.current) return
    scanLoopRef.current = true
    setScanning(true)

    while (scanLoopRef.current) {
      try {
        const results = await detectorRef.current.detect(videoRef.current)
        if (results.length > 0) {
          navigator.vibrate?.(100)
          onScan(results[0].rawValue.trim())
          // Μικρή παύση μετά από επιτυχές scan
          await new Promise(r => setTimeout(r, 1200))
        } else {
          await new Promise(r => setTimeout(r, 150))
        }
      } catch {
        await new Promise(r => setTimeout(r, 150))
      }
    }
  }

  const handleToggleScan = () => {
    if (scanning) {
      stopScanLoop()
      onStop?.()
    } else {
      startScanLoop()
    }
  }

  useEffect(() => {
    startCamera().then(() => { if (autoStart) startScanLoop() })
    return () => { scanLoopRef.current = false; stopCamera() }
  }, [])

  useEffect(() => {
    if (paused) stopScanLoop()
  }, [paused])

  useEffect(() => {
    if (type === 'location') {
      authFetch(`${API}/locations`)
        .then(r => r.ok ? r.json() : [])
        .then((data: { id: number; code: string }[]) => setLocations(data))
        .catch(() => {})
    }
  }, [type])

  const switchToInput = () => {
    stopCamera()
    localStorage.setItem(STORAGE_KEY, 'input')
    setMode('input')
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const switchToCamera = () => {
    localStorage.setItem(STORAGE_KEY, 'camera')
    setMode('camera')
    setTimeout(() => startCamera(), 100)
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputVal.trim()) {
      onScan(inputVal.trim())
      setInputVal('')
      setTimeout(() => inputRef.current?.focus(), 100)
    } else if (suggestions.length > 0) {
      handleSelectSuggestion(suggestions[0].sku)
    }
  }

  const handleSearchChange = useCallback((val: string, field: 'name' | 'sku' | 'supplier_sku') => {
    if (field === 'name') setNameVal(val)
    else if (field === 'sku') setSkuVal(val)
    else setSupSkuVal(val)
    setActiveField(field)
    setSuggestions([])
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (val.trim().length < 2) return

    // Local search: φιλτράρισμα μόνο μέσα στα items της παραγγελίας
    if (searchScope) {
      const v = val.trim().toLowerCase()
      const matches = searchScope
        .filter(s => {
          if (field === 'sku') return String(s.sku).toLowerCase().includes(v)
          if (field === 'supplier_sku') return String(s.supplier_sku || '').toLowerCase().includes(v)
          return String(s.name).toLowerCase().includes(v)
        })
        .slice(0, 10)
        .map(m => ({
          sku: m.sku, name: m.name,
          supplier_sku: m.supplier_sku, total_stock: m.total_stock,
          required_qty: m.required_qty, picked_qty: m.picked_qty,
        }))
      setSuggestions(matches)
      return
    }

    searchTimer.current = setTimeout(async () => {
      const res = await authFetch(`${API}/products/search?q=${encodeURIComponent(val.trim())}&field=${field}`)
      if (res.ok) setSuggestions(await res.json())
    }, 300)
  }, [searchScope])

  const handleSelectSuggestion = (sku: string) => {
    setSuggestions([])
    setNameVal('')
    setSkuVal('')
    setSupSkuVal('')
    setActiveField(null)
    onScan(sku)
  }

  const scrollFieldToTop = (e: React.FocusEvent<HTMLInputElement>) => {
    const input = e.currentTarget
    setTimeout(() => input.scrollIntoView({ block: 'start', behavior: 'smooth' }), 300)
  }

  return (
    <div className="barcode-scanner">
      {(mode === 'camera' || cameraOnly) ? (
        <div className="camera-mode">
          <video ref={videoRef} className="camera-video" playsInline muted />
          <button
            type="button"
            className={`btn-tap-scan ${scanning ? 'scanning' : ''}`}
            onClick={handleToggleScan}
          >
            {scanning ? '⏹ ΤΕΛΟΣ' : '📷 ΠΑΤΑ ΓΙΑ SCAN'}
          </button>
          {!cameraOnly && (
            <button type="button" className="btn-secondary btn-cancel-camera" onClick={switchToInput}>
              ⌨️ Χειροκίνητη εισαγωγή
            </button>
          )}
        </div>
      ) : type === 'location' ? (
        <form onSubmit={handleManualSubmit} className="manual-mode">
          <button type="button" className="btn-cancel-camera" onClick={switchToCamera}>
            📷 Κάμερα
          </button>
          <div className="name-search-wrap">
            <input
              ref={inputRef}
              type="text"
              value={inputVal}
              onChange={e => setInputVal(e.target.value.toUpperCase())}
              onFocus={scrollFieldToTop}
              placeholder={placeholder || 'Θέση (π.χ. R-A1-02)...'}
              autoComplete="off"
              autoCapitalize="characters"
              className="scan-input"
            />
            {inputVal.trim().length >= 1 && (() => {
              const matches = locations
                .filter(l => l.code.includes(inputVal.trim().toUpperCase()))
                .slice(0, 8)
              return matches.length > 0 ? (
                <div className="suggestions">
                  {matches.map(l => (
                    <div
                      key={l.id}
                      className="suggestion-row"
                      onClick={() => { onScan(l.code); setInputVal('') }}
                    >
                      <span className="suggestion-name">{l.code}</span>
                    </div>
                  ))}
                </div>
              ) : null
            })()}
          </div>
          <button type="submit" className="btn-primary" style={{ width: '100%' }}>OK</button>
        </form>
      ) : (
        <form onSubmit={handleManualSubmit} className="manual-mode">
          <button type="button" className="btn-cancel-camera" onClick={switchToCamera}>
            📷 Κάμερα
          </button>
          {!searchInPopup && (
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              placeholder="Barcode..."
              autoComplete="off"
              className="scan-input"
            />
          )}
          {searchInPopup ? (
            <button type="button" className="btn-secondary" style={{ width: '100%' }} onClick={() => setShowSearchPopup(true)}>
              🔍 Χειροκίνητη εισαγωγή
            </button>
          ) : (<>
          <div className="name-search-wrap">
            <input
              type="text"
              value={nameVal}
              onChange={e => handleSearchChange(e.target.value, 'name')}
              onFocus={scrollFieldToTop}
              placeholder="Αναζήτηση με τίτλο..."
              autoComplete="off"
              className="scan-input"
            />
            {activeField === 'name' && suggestions.length > 0 && (
              <div className="suggestions">
                {suggestions.map(s => (
                  <div key={s.sku} className="suggestion-row" onClick={() => handleSelectSuggestion(s.sku)}>
                    <span className="suggestion-name">{s.name}</span>
                    <span className="suggestion-sku">
                      {s.sku}{s.supplier_sku ? ` · ${s.supplier_sku}` : ''}
                      {typeof s.total_stock === 'number' && (
                        <span style={{ marginLeft: 8, color: s.total_stock > 0 ? '#28a745' : '#dc3545', fontWeight: 700 }}>
                          {s.total_stock > 0 ? `${s.total_stock} stock` : '⚠ 0 stock'}
                        </span>
                      )}
                      {typeof s.picked_qty === 'number' && typeof s.required_qty === 'number' && (
                        <span style={{ marginLeft: 8, color: '#666' }}>
                          {Math.round(s.picked_qty)}/{Math.round(s.required_qty)}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="scanner-input-row">
            <div className="name-search-wrap" style={{ flex: 1 }}>
              <input
                type="text"
                inputMode="numeric"
                value={skuVal}
                onChange={e => handleSearchChange(e.target.value, 'sku')}
                onFocus={scrollFieldToTop}
                placeholder="SKU..."
                autoComplete="off"
                className="scan-input"
              />
              {activeField === 'sku' && suggestions.length > 0 && (
                <div className="suggestions">
                  {suggestions.map(s => (
                    <div key={s.sku} className="suggestion-row" onClick={() => handleSelectSuggestion(s.sku)}>
                      <span className="suggestion-name">{s.name}</span>
                      <span className="suggestion-sku">
                        {s.sku}{s.supplier_sku ? ` · ${s.supplier_sku}` : ''}
                        {typeof s.total_stock === 'number' && (
                          <span style={{ marginLeft: 8, color: s.total_stock > 0 ? '#28a745' : '#dc3545', fontWeight: 700 }}>
                            {s.total_stock > 0 ? `${s.total_stock} stock` : '⚠ 0 stock'}
                          </span>
                        )}
                        {typeof s.picked_qty === 'number' && typeof s.required_qty === 'number' && (
                          <span style={{ marginLeft: 8, color: '#666' }}>
                            {Math.round(s.picked_qty)}/{Math.round(s.required_qty)}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="name-search-wrap" style={{ flex: 1 }}>
              <input
                type="text"
                value={supSkuVal}
                onChange={e => handleSearchChange(e.target.value, 'supplier_sku')}
                onFocus={scrollFieldToTop}
                placeholder="Supplier SKU..."
                autoComplete="off"
                className="scan-input"
              />
              {activeField === 'supplier_sku' && suggestions.length > 0 && (
                <div className="suggestions">
                  {suggestions.map(s => (
                    <div key={s.sku} className="suggestion-row" onClick={() => handleSelectSuggestion(s.sku)}>
                      <span className="suggestion-name">{s.name}</span>
                      <span className="suggestion-sku">
                        {s.sku}{s.supplier_sku ? ` · ${s.supplier_sku}` : ''}
                        {typeof s.total_stock === 'number' && (
                          <span style={{ marginLeft: 8, color: s.total_stock > 0 ? '#28a745' : '#dc3545', fontWeight: 700 }}>
                            {s.total_stock > 0 ? `${s.total_stock} stock` : '⚠ 0 stock'}
                          </span>
                        )}
                        {typeof s.picked_qty === 'number' && typeof s.required_qty === 'number' && (
                          <span style={{ marginLeft: 8, color: '#666' }}>
                            {Math.round(s.picked_qty)}/{Math.round(s.required_qty)}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          </>)}
          {!searchInPopup && <button type="submit" className="btn-primary" style={{ width: '100%' }}>OK</button>}
        </form>
      )}
      {searchInPopup && showSearchPopup && (
        <div
          onClick={() => setShowSearchPopup(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '40px 16px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 8, width: '100%', maxWidth: 520,
              padding: 16, boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>Χειροκίνητη εισαγωγή</h3>
              <button type="button" onClick={() => setShowSearchPopup(false)}
                style={{ border: 'none', background: 'transparent', fontSize: 22, cursor: 'pointer', color: '#666' }}>×</button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); if (inputVal.trim()) { onScan(inputVal.trim()); setInputVal(''); setShowSearchPopup(false) } }}>
            <input
              type="text"
              inputMode="numeric"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              placeholder="Barcode..."
              autoComplete="off"
              className="scan-input"
              style={{ marginBottom: 8 }}
            />
            <div className="name-search-wrap" style={{ marginBottom: 8 }}>
              <input
                type="text"
                value={nameVal}
                onChange={e => handleSearchChange(e.target.value, 'name')}
                placeholder="Αναζήτηση με τίτλο..."
                autoComplete="off"
                className="scan-input"
                autoFocus
              />
              {activeField === 'name' && suggestions.length > 0 && (
                <div className="suggestions">
                  {suggestions.map(s => (
                    <div key={s.sku} className="suggestion-row" onClick={() => { handleSelectSuggestion(s.sku); setShowSearchPopup(false) }}>
                      <span className="suggestion-name">{s.name}</span>
                      <span className="suggestion-sku">
                        {s.sku}{s.supplier_sku ? ` · ${s.supplier_sku}` : ''}
                        {typeof s.total_stock === 'number' && (
                          <span style={{ marginLeft: 8, color: s.total_stock > 0 ? '#28a745' : '#dc3545', fontWeight: 700 }}>
                            {s.total_stock > 0 ? `${s.total_stock} stock` : '⚠ 0 stock'}
                          </span>
                        )}
                        {typeof s.picked_qty === 'number' && typeof s.required_qty === 'number' && (
                          <span style={{ marginLeft: 8, color: '#666' }}>
                            {Math.round(s.picked_qty)}/{Math.round(s.required_qty)}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="name-search-wrap" style={{ flex: 1 }}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={skuVal}
                  onChange={e => handleSearchChange(e.target.value, 'sku')}
                  placeholder="SKU..."
                  autoComplete="off"
                  className="scan-input"
                />
                {activeField === 'sku' && suggestions.length > 0 && (
                  <div className="suggestions">
                    {suggestions.map(s => (
                      <div key={s.sku} className="suggestion-row" onClick={() => { handleSelectSuggestion(s.sku); setShowSearchPopup(false) }}>
                        <span className="suggestion-name">{s.name}</span>
                        <span className="suggestion-sku">
                          {s.sku}{s.supplier_sku ? ` · ${s.supplier_sku}` : ''}
                          {typeof s.total_stock === 'number' && (
                            <span style={{ marginLeft: 8, color: s.total_stock > 0 ? '#28a745' : '#dc3545', fontWeight: 700 }}>
                              {s.total_stock > 0 ? `${s.total_stock} stock` : '⚠ 0 stock'}
                            </span>
                          )}
                          {typeof s.picked_qty === 'number' && typeof s.required_qty === 'number' && (
                            <span style={{ marginLeft: 8, color: '#666' }}>
                              {Math.round(s.picked_qty)}/{Math.round(s.required_qty)}
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="name-search-wrap" style={{ flex: 1 }}>
                <input
                  type="text"
                  value={supSkuVal}
                  onChange={e => handleSearchChange(e.target.value, 'supplier_sku')}
                  placeholder="Supplier SKU..."
                  autoComplete="off"
                  className="scan-input"
                />
                {activeField === 'supplier_sku' && suggestions.length > 0 && (
                  <div className="suggestions">
                    {suggestions.map(s => (
                      <div key={s.sku} className="suggestion-row" onClick={() => { handleSelectSuggestion(s.sku); setShowSearchPopup(false) }}>
                        <span className="suggestion-name">{s.name}</span>
                        <span className="suggestion-sku">
                          {s.sku}{s.supplier_sku ? ` · ${s.supplier_sku}` : ''}
                          {typeof s.total_stock === 'number' && (
                            <span style={{ marginLeft: 8, color: s.total_stock > 0 ? '#28a745' : '#dc3545', fontWeight: 700 }}>
                              {s.total_stock > 0 ? `${s.total_stock} stock` : '⚠ 0 stock'}
                            </span>
                          )}
                          {typeof s.picked_qty === 'number' && typeof s.required_qty === 'number' && (
                            <span style={{ marginLeft: 8, color: '#666' }}>
                              {Math.round(s.picked_qty)}/{Math.round(s.required_qty)}
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: 12 }}>OK</button>
            </form>
          </div>
        </div>
      )}
      {cameraError && <p className="camera-error">{cameraError}</p>}
    </div>
  )
}
