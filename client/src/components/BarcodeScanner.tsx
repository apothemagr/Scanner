import { useEffect, useRef, useState } from 'react'

interface Props {
  onScan: (code: string) => void
  placeholder?: string
}

declare const BarcodeDetector: {
  new(opts: { formats: string[] }): { detect(src: HTMLVideoElement): Promise<{ rawValue: string }[]> }
  getSupportedFormats(): Promise<string[]>
}

const STORAGE_KEY = 'scanner_mode'

export default function BarcodeScanner({ onScan, placeholder = 'Σκανάρισμα...' }: Props) {
  const [mode, setMode] = useState<'input' | 'camera'>(
    () => (localStorage.getItem(STORAGE_KEY) as 'input' | 'camera') ?? 'camera'
  )
  const [inputVal, setInputVal] = useState('')
  const [cameraError, setCameraError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const animRef = useRef<number>(0)
  const activeRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

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

    // Έλεγξε αν υποστηρίζεται BarcodeDetector
    if (!('BarcodeDetector' in window)) {
      setCameraError('Ο browser δεν υποστηρίζει αυτόματο scanner. Χρησιμοποίησε χειροκίνητη εισαγωγή.')
      setMode('input')
      return
    }

    try {
      // Ξεκίνα κάμερα με zoom x3 κατευθείαν
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

      const detector = new BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'qr_code', 'code_128', 'code_39', 'itf', 'upc_a', 'upc_e']
      })

      const scan = async () => {
        if (!activeRef.current || !videoRef.current) return
        try {
          const results = await detector.detect(videoRef.current)
          if (results.length > 0) {
            navigator.vibrate?.(100)
            stopCamera()
            onScan(results[0].rawValue)
            setTimeout(() => startCamera(), 600)
            return
          }
        } catch { /* frame not ready */ }
        animRef.current = requestAnimationFrame(scan)
      }
      animRef.current = requestAnimationFrame(scan)

    } catch {
      setCameraError('Δεν επιτράπηκε πρόσβαση στην κάμερα. Χρησιμοποίησε χειροκίνητη εισαγωγή.')
      setMode('input')
    }
  }

  useEffect(() => {
    startCamera()
    return () => stopCamera()
  }, [])

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
    if (!inputVal.trim()) return
    onScan(inputVal.trim())
    setInputVal('')
    // Επιστροφή focus για τον επόμενο handheld scan
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  return (
    <div className="barcode-scanner">
      {mode === 'camera' ? (
        <div className="camera-mode">
          <video
            ref={videoRef}
            className="camera-video"
            playsInline
            muted
          />
          <div className="scan-overlay">
            <div className="scan-line" />
          </div>
          <button type="button" className="btn-secondary btn-cancel-camera" onClick={switchToInput}>
            ⌨️ Χειροκίνητη εισαγωγή
          </button>
        </div>
      ) : (
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
          <button type="button" className="btn-camera" onClick={switchToCamera}>
            📷 Κάμερα
          </button>
        </form>
      )}
      {cameraError && <p className="camera-error">{cameraError}</p>}
    </div>
  )
}
