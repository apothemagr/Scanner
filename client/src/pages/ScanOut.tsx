import { useState, useRef, useEffect } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

interface PickingItem {
  product_id: number
  sku: string
  name: string
  barcode: string
  required_qty: number
  picked_qty: number
  location_code: string
  scanned_at: string | null
}

interface Picking {
  id: number
  entersoft_so_id: string
  customer_name: string
  status: string
  items: PickingItem[]
}

export default function ScanOut() {
  const [pickings, setPickings] = useState<Picking[]>([])
  const [selected, setSelected] = useState<Picking | null>(null)
  const [scanInput, setScanInput] = useState('')
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const scanRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadPickings() }, [])
  useEffect(() => { if (selected) scanRef.current?.focus() }, [selected])

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 4000)
  }

  const loadPickings = async () => {
    try {
      const res = await fetch(`${API}/scan-out/pickings`)
      setPickings(await res.json())
    } catch { /* server not ready */ }
  }

  const openPicking = async (id: number) => {
    const res = await fetch(`${API}/scan-out/pickings/${id}`)
    setSelected(await res.json())
  }

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scanInput.trim() || !selected) return

    try {
      const res = await fetch(`${API}/scan-out/pickings/${selected.id}/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode_or_sku: scanInput, quantity: 1 }),
      })
      const data = await res.json()
      if (!res.ok) {
        showMessage(data.error, 'error')
      } else {
        if (data.order_complete) {
          showMessage('Παραγγελία ΟΛΟΚΛΗΡΩΘΗΚΕ!', 'success')
          setSelected(null)
          loadPickings()
        } else {
          showMessage(`✓ ${data.product} (${data.picked}/${data.required})`, 'success')
          openPicking(selected.id)
        }
      }
    } catch {
      showMessage('Σφάλμα σύνδεσης', 'error')
    }
    setScanInput('')
  }

  if (selected) {
    const pending = selected.items?.filter(i => i.picked_qty < i.required_qty) || []
    const done = selected.items?.filter(i => i.picked_qty >= i.required_qty) || []

    return (
      <div className="page">
        <div className="page-header">
          <button className="btn-back" onClick={() => setSelected(null)}>← Πίσω</button>
          <h2>{selected.customer_name}</h2>
          <span className="order-id">{selected.entersoft_so_id}</span>
        </div>

        {message && <div className={`message ${message.type}`}>{message.text}</div>}

        <form onSubmit={handleScan} className="scan-form">
          <input
            ref={scanRef}
            type="text"
            value={scanInput}
            onChange={e => setScanInput(e.target.value)}
            placeholder="Σκανάρισμα προϊόντος..."
            autoComplete="off"
            className="scan-input"
          />
          <button type="submit" className="btn-primary">Scan</button>
        </form>

        {pending.length > 0 && (
          <div className="items-list">
            <h3>Εκκρεμή ({pending.length})</h3>
            {pending.map(item => (
              <div key={item.product_id} className="item-row pending">
                <div className="item-info">
                  <span className="item-name">{item.name}</span>
                  <span className="item-location">{item.location_code || '—'}</span>
                </div>
                <span className="item-qty">{item.picked_qty}/{item.required_qty}</span>
              </div>
            ))}
          </div>
        )}

        {done.length > 0 && (
          <div className="items-list done">
            <h3>Ολοκληρωμένα ({done.length})</h3>
            {done.map(item => (
              <div key={item.product_id} className="item-row completed">
                <span className="item-name">{item.name}</span>
                <span className="item-qty">✓</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="page">
      <h2>Picking Παραγγελιών</h2>
      {message && <div className={`message ${message.type}`}>{message.text}</div>}

      {pickings.length === 0 ? (
        <p className="empty">Δεν υπάρχουν ανοιχτές παραγγελίες</p>
      ) : (
        <div className="items-list">
          {pickings.map(p => (
            <button key={p.id} className="picking-card" onClick={() => openPicking(p.id)}>
              <div className="picking-customer">{p.customer_name}</div>
              <div className="picking-meta">{p.entersoft_so_id}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
