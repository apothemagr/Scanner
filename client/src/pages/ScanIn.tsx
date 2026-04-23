import { useState, useRef, useEffect } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

interface ScannedItem {
  sku: string
  name: string
  quantity: number
  location: string
}

export default function ScanIn() {
  const [items, setItems] = useState<ScannedItem[]>([])
  const [scanInput, setScanInput] = useState('')
  const [locationInput, setLocationInput] = useState('')
  const [pendingProduct, setPendingProduct] = useState<{ id: number; sku: string; name: string } | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const scanRef = useRef<HTMLInputElement>(null)

  useEffect(() => { scanRef.current?.focus() }, [])

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 3000)
  }

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scanInput.trim()) return

    try {
      const res = await fetch(`${API}/products/lookup?code=${encodeURIComponent(scanInput)}`)
      if (!res.ok) { showMessage('Προϊόν δεν βρέθηκε: ' + scanInput, 'error'); setScanInput(''); return }
      const product = await res.json()
      setPendingProduct({ id: product.id, sku: product.sku, name: product.name })
      setScanInput('')
    } catch {
      showMessage('Σφάλμα σύνδεσης με server', 'error')
    }
  }

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault()
    if (!pendingProduct || !locationInput.trim()) return

    setItems(prev => {
      const existing = prev.find(i => i.sku === pendingProduct.sku && i.location === locationInput)
      if (existing) {
        return prev.map(i => i.sku === pendingProduct.sku && i.location === locationInput
          ? { ...i, quantity: i.quantity + 1 } : i)
      }
      return [...prev, { sku: pendingProduct.sku, name: pendingProduct.name, quantity: 1, location: locationInput }]
    })

    showMessage(`✓ ${pendingProduct.name} → ${locationInput}`, 'success')
    setPendingProduct(null)
    setLocationInput('')
    setTimeout(() => scanRef.current?.focus(), 100)
  }

  return (
    <div className="page">
      <h2>Παραλαβή Προϊόντων</h2>

      {message && <div className={`message ${message.type}`}>{message.text}</div>}

      {!pendingProduct ? (
        <form onSubmit={handleScan} className="scan-form">
          <label>Scan Barcode / SKU</label>
          <input
            ref={scanRef}
            type="text"
            value={scanInput}
            onChange={e => setScanInput(e.target.value)}
            placeholder="Σκανάρισμα ή πληκτρολόγηση..."
            autoComplete="off"
            className="scan-input"
          />
          <button type="submit" className="btn-primary">Αναζήτηση</button>
        </form>
      ) : (
        <form onSubmit={handleConfirm} className="scan-form">
          <div className="product-found">
            <strong>{pendingProduct.name}</strong>
            <span className="sku">{pendingProduct.sku}</span>
          </div>
          <label>Θέση Αποθήκης</label>
          <input
            type="text"
            value={locationInput}
            onChange={e => setLocationInput(e.target.value.toUpperCase())}
            placeholder="π.χ. R-A1-02"
            autoFocus
            className="scan-input"
          />
          <div className="btn-row">
            <button type="submit" className="btn-primary">Επιβεβαίωση</button>
            <button type="button" className="btn-secondary" onClick={() => setPendingProduct(null)}>Ακύρωση</button>
          </div>
        </form>
      )}

      {items.length > 0 && (
        <div className="items-list">
          <h3>Σκαναρισμένα ({items.length})</h3>
          {items.map((item, i) => (
            <div key={i} className="item-row">
              <span className="item-name">{item.name}</span>
              <span className="item-location">{item.location}</span>
              <span className="item-qty">x{item.quantity}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
