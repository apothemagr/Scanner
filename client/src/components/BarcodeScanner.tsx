import { useEffect, useRef, useState, useCallback } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

interface Props {
  onScan: (code: string) => void
  placeholder?: string
  paused?: boolean
  autoStart?: boolean
  type?: 'product' | 'location'
}


declare const BarcodeDetector: {
  new(opts: { formats: string[] }): { detect(src: HTMLVideoElement): Promise<{ rawValue: string }[]> }
  getSupportedFormats(): Promise<string[]>
}

const STORAGE_KEY = 'scanner_mode'

export default function BarcodeScanner({ onScan, placeholder = 'Σκανάρισμα...', paused = false, autoStart = false, type = 'product' }: Props) {
  const [mode, setMode] = useState<'input' | 'camera'>(
    () => (localStorage.getItem(STORAGE_KEY) as 'input' | 'camera') ?? 'camera'
  )
  const [inputVal, setInputVal] = useState('')
  const [nameVal, setNameVal] = useState('')
  const [suggestions, setSuggestions] = useState<{ id: number; sku: string; name: string }[]>([])
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
      fetch(`${API}/locations`)
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

  const handleNameChange = useCallback((val: string) => {
    setNameVal(val)
    setSuggestions([])
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (val.trim().length < 2) return
    searchTimer.current = setTimeout(async () => {
      const res = await fetch(`${API}/products/search?q=${encodeURIComponent(val.trim())}`)
      if (res.ok) setSuggestions(await res.json())
    }, 300)
  }, [])

  const handleSelectSuggestion = (sku: string) => {
    setSuggestions([])
    setNameVal('')
    onScan(sku)
  }

  return (
    <div className="barcode-scanner">
      {mode === 'camera' ? (
        <div className="camera-mode">
          <video ref={videoRef} className="camera-video" playsInline muted />
          <button
            type="button"
            className={`btn-tap-scan ${scanning ? 'scanning' : ''}`}
            onClick={handleToggleScan}
          >
            {scanning ? '⏹ ΤΕΛΟΣ' : '📷 ΠΑΤΑ ΓΙΑ SCAN'}
          </button>
          <button type="button" className="btn-secondary btn-cancel-camera" onClick={switchToInput}>
            ⌨️ Χειροκίνητη εισαγωγή
          </button>
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
          <div className="name-search-wrap">
            <input
              type="text"
              value={nameVal}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="Αναζήτηση με τίτλο..."
              autoComplete="off"
              className="scan-input"
            />
            {suggestions.length > 0 && (
              <div className="suggestions">
                {suggestions.map(s => (
                  <div key={s.id} className="suggestion-row" onClick={() => handleSelectSuggestion(s.sku)}>
                    <span className="suggestion-name">{s.name}</span>
                    <span className="suggestion-sku">{s.sku}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button type="submit" className="btn-primary" style={{ width: '100%' }}>OK</button>
        </form>
      )}
      {cameraError && <p className="camera-error">{cameraError}</p>}
    </div>
  )
}
