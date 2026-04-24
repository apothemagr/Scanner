import { useState } from 'react'
import BarcodeScanner from '../components/BarcodeScanner'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

interface ScannedItem {
  product_id: number
  sku: string
  name: string
  quantity: number
}

type Step = 'scan_products' | 'scan_location'

export default function ScanIn() {
  const [step, setStep] = useState<Step>('scan_products')
  const [items, setItems] = useState<ScannedItem[]>([])
  const [popup, setPopup] = useState<ScannedItem | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 3000)
  }

  const handleProductScan = async (code: string) => {
    try {
      const res = await fetch(`${API}/products/lookup?code=${encodeURIComponent(code)}`)
      if (!res.ok) { showMessage('Προϊόν δεν βρέθηκε: ' + code, 'error'); return }
      const product = await res.json()

      setItems(prev => {
        const existing = prev.find(i => i.product_id === product.id)
        if (existing) {
          const updated = prev.map(i => i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i)
          setPopup(updated.find(i => i.product_id === product.id)!)
          return updated
        }
        const newItem = { product_id: product.id, sku: product.sku, name: product.name, quantity: 1 }
        setPopup(newItem)
        return [...prev, newItem]
      })
    } catch {
      showMessage('Σφάλμα σύνδεσης με server', 'error')
    }
  }

  const updateQty = (product_id: number, delta: number) => {
    setItems(prev => {
      const updated = prev
        .map(i => i.product_id === product_id ? { ...i, quantity: i.quantity + delta } : i)
        .filter(i => i.quantity > 0)
      const item = updated.find(i => i.product_id === product_id)
      setPopup(item ?? null)
      return updated
    })
  }

  const handleLocationScan = async (locationCode: string) => {
    const locRes = await fetch(`${API}/locations`)
    const locations = await locRes.json()
    const loc = locations.find((l: { code: string; id: number }) => l.code === locationCode.toUpperCase())
    if (!loc) { showMessage('Θέση δεν βρέθηκε: ' + locationCode, 'error'); return }

    let errors = 0
    for (const item of items) {
      const res = await fetch(`${API}/scan-in/receipts/quick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: item.product_id, location_id: loc.id, quantity: item.quantity })
      })
      if (!res.ok) errors++
    }

    if (errors === 0) {
      showMessage(`✓ ${items.length} προϊόντα → ${locationCode.toUpperCase()}`, 'success')
      setItems([])
      setPopup(null)
      setStep('scan_products')
    } else {
      showMessage(`Σφάλμα σε ${errors} προϊόντα`, 'error')
    }
  }

  return (
    <div className="page">
      {message && <div className={`message ${message.type}`}>{message.text}</div>}

      {step === 'scan_products' ? (
        <>
          <BarcodeScanner onScan={handleProductScan} placeholder="Σκανάρισμα προϊόντος..." paused={!!popup} />

          {items.length > 0 && (
            <div className="items-list">
              <div className="list-header">
                <span>Σκαναρισμένα ({items.length})</span>
                <button className="btn-clear" onClick={() => { setItems([]); setPopup(null) }}>Καθαρισμός</button>
              </div>
              {items.map(item => (
                <div key={item.product_id} className="item-row">
                  <span className="item-name">{item.name}</span>
                  <div className="qty-controls">
                    <button className="qty-btn" onClick={() => updateQty(item.product_id, -1)}>−</button>
                    <span className="item-qty">{item.quantity}</span>
                    <button className="qty-btn" onClick={() => updateQty(item.product_id, +1)}>+</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="step-header">
            <button className="btn-back" onClick={() => setStep('scan_products')}>← Πίσω</button>
            <span className="step-title">Σκανάρισε τη Θέση</span>
          </div>

          <div className="location-summary">
            {items.map(i => (
              <div key={i.product_id} className="summary-row">
                <span>{i.name}</span>
                <span className="summary-qty">x{i.quantity}</span>
              </div>
            ))}
          </div>

          <BarcodeScanner onScan={handleLocationScan} placeholder="Σκανάρισμα θέσης..." autoStart type="location" />
        </>
      )}

      {/* Popup */}
      {popup && step === 'scan_products' && (
        <>
          <div className="popup-overlay" onClick={() => setPopup(null)} />
          <div className="popup">
            <button className="popup-close" onClick={() => setPopup(null)}>✕</button>
            <div className="popup-name">{popup.name}</div>
            <div className="popup-sku">{popup.sku}</div>
            <div className="popup-qty-row">
              <button className="qty-btn" onClick={() => updateQty(popup.product_id, -1)}>−</button>
              <span className="popup-qty">{popup.quantity}</span>
              <button className="qty-btn" onClick={() => updateQty(popup.product_id, +1)}>+</button>
            </div>
            <button className="btn-place" onClick={() => { setPopup(null); setStep('scan_location') }}>
              📍 Τοποθέτηση στο Ράφι
            </button>
          </div>
        </>
      )}
    </div>
  )
}
