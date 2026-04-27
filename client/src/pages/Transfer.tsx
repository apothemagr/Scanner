import { useState } from 'react'
import { createPortal } from 'react-dom'
import { API, authFetch } from '../api'
import BarcodeScanner from '../components/BarcodeScanner'

type Step = 'source' | 'product' | 'destination'

interface ProductInfo {
  sku: string
  name: string
  unit: string
  available: number
  qty: number
}

export default function Transfer() {
  const [step, setStep] = useState<Step>('source')
  const [sourceCode, setSourceCode] = useState<string>('')
  const [product, setProduct] = useState<ProductInfo | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [askingQty, setAskingQty] = useState(false)

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 2500)
  }

  const reset = () => {
    setStep('source')
    setSourceCode('')
    setProduct(null)
    setAskingQty(false)
  }

  const handleSourceScan = async (code: string) => {
    try {
      const r = await authFetch(`${API}/transfers/location/${encodeURIComponent(code.toUpperCase())}`)
      const d = await r.json()
      if (!r.ok) { showMessage(d.error || 'Σφάλμα', 'error'); return }
      setSourceCode(d.code)
      setStep('product')
      showMessage(`📍 Πηγή: ${d.code}`, 'success')
    } catch { showMessage('Σφάλμα σύνδεσης', 'error') }
  }

  const handleProductScan = async (code: string) => {
    try {
      const r = await authFetch(`${API}/transfers/scan-product`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode_or_sku: code, source_code: sourceCode }),
      })
      const d = await r.json()
      if (!r.ok) { showMessage(d.error || 'Σφάλμα', 'error'); return }
      setProduct({ sku: d.sku, name: d.name, unit: d.unit, available: d.available, qty: d.available })
      setAskingQty(true)
    } catch { showMessage('Σφάλμα σύνδεσης', 'error') }
  }

  const confirmQty = () => {
    if (!product || product.qty < 1 || product.qty > product.available) return
    setAskingQty(false)
    setStep('destination')
  }

  const handleDestinationScan = async (code: string) => {
    if (!product) return
    try {
      const r = await authFetch(`${API}/transfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: product.sku,
          source_code: sourceCode,
          destination_code: code.toUpperCase(),
          quantity: product.qty,
        }),
      })
      const d = await r.json()
      if (!r.ok) { showMessage(d.error || 'Σφάλμα', 'error'); return }
      showMessage(`✓ ${product.qty} ${product.unit} ${d.source} → ${d.destination}`, 'success')
      reset()
    } catch { showMessage('Σφάλμα σύνδεσης', 'error') }
  }

  return (
    <div className="page">
      {message && <div className={`message ${message.type}`}>{message.text}</div>}

      <div className="page-header">
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: '1rem' }}>
          🔁 Μετακίνηση
        </div>
        {(step !== 'source' || sourceCode) && (
          <button className="btn-back" onClick={reset}>✕ Άκυρο</button>
        )}
      </div>

      {step === 'source' && (
        <>
          <p style={{ textAlign: 'center', color: '#666', marginTop: 16 }}>
            Σκάναρε ή πληκτρολόγησε <strong>θέση πηγής</strong>
          </p>
          <BarcodeScanner
            type="location"
            onScan={handleSourceScan}
            placeholder="Θέση πηγής (π.χ. R-A1-02)..."
          />
        </>
      )}

      {step === 'product' && (
        <>
          <div style={{
            background: '#e7f3ff', border: '1px solid #b3d9ff',
            padding: 12, borderRadius: 6, marginBottom: 12, textAlign: 'center',
          }}>
            <div style={{ fontSize: '0.85rem', color: '#666' }}>Από θέση</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{sourceCode}</div>
          </div>
          <p style={{ textAlign: 'center', color: '#666', marginBottom: 8 }}>
            Σκάναρε <strong>προϊόν</strong> από αυτή τη θέση
          </p>
          <BarcodeScanner
            type="product"
            onScan={handleProductScan}
            placeholder="Barcode / SKU προϊόντος..."
            paused={askingQty}
          />
        </>
      )}

      {step === 'destination' && product && (
        <>
          <div style={{
            background: '#e7f3ff', border: '1px solid #b3d9ff',
            padding: 12, borderRadius: 6, marginBottom: 12, textAlign: 'center',
          }}>
            <div style={{ fontSize: '0.85rem', color: '#666' }}>Από {sourceCode}</div>
            <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: 4 }}>{product.name}</div>
            <div style={{ fontSize: '0.85rem', color: '#444', marginTop: 4 }}>
              {product.qty} {product.unit} (από {product.available} διαθέσιμα)
            </div>
          </div>
          <p style={{ textAlign: 'center', color: '#666', marginBottom: 8 }}>
            Σκάναρε <strong>θέση προορισμού</strong>
          </p>
          <BarcodeScanner
            type="location"
            onScan={handleDestinationScan}
            placeholder="Θέση προορισμού..."
          />
        </>
      )}

      {askingQty && product && createPortal(
        <>
          <div className="popup-overlay" onClick={() => { setAskingQty(false); setProduct(null); setStep('product') }} />
          <div className="popup" style={{ gap: 12 }}>
            <button className="popup-close" onClick={() => { setAskingQty(false); setProduct(null); setStep('product') }}>✕</button>
            <div className="popup-name">{product.name}</div>
            <div style={{ fontSize: '0.9rem', color: '#666', textAlign: 'center' }}>
              Διαθέσιμα στη θέση <strong>{sourceCode}</strong>: <strong>{product.available} {product.unit}</strong>
            </div>
            <div className="popup-qty-row">
              <button
                type="button"
                className="qty-btn"
                onClick={() => setProduct(p => p ? { ...p, qty: Math.max(1, p.qty - 1) } : p)}
              >−</button>
              <span className="popup-qty">{product.qty}</span>
              <button
                type="button"
                className="qty-btn"
                onClick={() => setProduct(p => p ? { ...p, qty: Math.min(p.available, p.qty + 1) } : p)}
              >+</button>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={confirmQty}
              disabled={product.qty < 1 || product.qty > product.available}
            >
              Συνέχεια →
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
