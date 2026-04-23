import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

interface Props {
  onScan: (code: string) => void
  placeholder?: string
}

export default function BarcodeScanner({ onScan, placeholder = 'Σκανάρισμα...' }: Props) {
  const [mode, setMode] = useState<'input' | 'camera'>('input')
  const [inputVal, setInputVal] = useState('')
  const [cameraError, setCameraError] = useState('')
  const [scanning, setScanning] = useState(false)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const regionId = 'qr-region'

  useEffect(() => {
    if (mode === 'input') {
      stopCamera()
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [mode])

  useEffect(() => {
    return () => { stopCamera() }
  }, [])

  const stopCamera = () => {
    if (scannerRef.current && scanning) {
      scannerRef.current.stop().catch(() => {})
      setScanning(false)
    }
  }

  const startCamera = async () => {
    setCameraError('')
    try {
      const scanner = new Html5Qrcode(regionId)
      scannerRef.current = scanner
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 260, height: 160 } },
        (decodedText) => {
          // Επιτυχές scan
          navigator.vibrate?.(100)
          stopCamera()
          setMode('input')
          onScan(decodedText)
        },
        () => {} // αγνοούμε τα intermediate errors
      )
      setScanning(true)
    } catch (err) {
      setCameraError('Δεν είναι δυνατή η πρόσβαση στην κάμερα. Δώσε άδεια ή χρησιμοποίησε χειροκίνητη εισαγωγή.')
      setMode('input')
    }
  }

  const handleModeSwitch = () => {
    if (mode === 'input') {
      setMode('camera')
      setTimeout(() => startCamera(), 200)
    } else {
      stopCamera()
      setMode('input')
    }
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputVal.trim()) return
    onScan(inputVal.trim())
    setInputVal('')
  }

  return (
    <div className="barcode-scanner">
      {mode === 'input' ? (
        <form onSubmit={handleManualSubmit} className="scanner-input-row">
          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            className="scan-input"
          />
          <button type="submit" className="btn-primary btn-scan-submit">OK</button>
          <button type="button" className="btn-camera" onClick={handleModeSwitch} title="Χρήση κάμερας">
            📷
          </button>
        </form>
      ) : (
        <div className="camera-mode">
          <div id={regionId} className="camera-region" />
          <button type="button" className="btn-secondary btn-cancel-camera" onClick={handleModeSwitch}>
            ✕ Κλείσιμο κάμερας
          </button>
        </div>
      )}
      {cameraError && <p className="camera-error">{cameraError}</p>}
    </div>
  )
}
