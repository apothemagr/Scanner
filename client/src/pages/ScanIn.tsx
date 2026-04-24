import { useState, useEffect } from 'react'
import BarcodeScanner from '../components/BarcodeScanner'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

type ReceiptStatus = 'open' | 'closed' | 'completed'
type StatusFilter = 'all' | ReceiptStatus

const STATUS_LABEL: Record<ReceiptStatus, string> = {
  open: 'Καταχώρηση',
  closed: 'Εναπόθεση',
  completed: 'Ολοκληρωμένη',
}
const STATUS_COLOR: Record<ReceiptStatus, string> = {
  open: '#e67e00',
  closed: '#1a6fa8',
  completed: '#28a745',
}

interface Receipt {
  id: number
  entersoft_po_id: string | null
  supplier_name: string | null
  status: ReceiptStatus
  created_at: string
  completed_at: string | null
  item_count: number
  placed_count: number
}

interface ReceiptItem {
  product_id: number
  sku: string
  name: string
  unit: string
  received_qty: number
  location_id: number | null
  location_code: string | null
  placement_added: boolean
}

interface ReceiptDetail extends Receipt {
  items: ReceiptItem[]
}

interface Popup {
  product_id: number
  name: string
  sku: string
  unit: string
  qty: number
  is_new?: boolean
  already_placed?: boolean
}

type Step = 'list' | 'receipt' | 'place_location'

function formatDate(d: string) {
  const dt = new Date(d)
  return dt.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit' }) + ' ' +
    String(dt.getUTCHours()).padStart(2, '0') + ':' + String(dt.getUTCMinutes()).padStart(2, '0')
}

export default function ScanIn() {
  const [step, setStep] = useState<Step>('list')
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [selected, setSelected] = useState<ReceiptDetail | null>(null)
  const [popup, setPopup] = useState<Popup | null>(null)
  const [pendingPlace, setPendingPlace] = useState<Popup | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [loading, setLoading] = useState(true)
  const [showNewForm, setShowNewForm] = useState(false)
  const [newDoc, setNewDoc] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [showScanner, setShowScanner] = useState(false)

  useEffect(() => { loadReceipts(statusFilter) }, [statusFilter])

  useEffect(() => {
    const onPopState = () => {
      if (step === 'place_location') { setPendingPlace(null); setStep('receipt') }
      else if (step === 'receipt') { setSelected(null); setStep('list') }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [step])

  useEffect(() => {
    if (step === 'receipt' || step === 'place_location') window.history.pushState({ step }, '')
  }, [step])

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 3500)
  }

  const loadReceipts = async (sf?: StatusFilter) => {
    setLoading(true)
    const s = sf ?? statusFilter
    try {
      const params = s !== 'all' ? `?status=${s}` : ''
      setReceipts(await (await fetch(`${API}/scan-in/receipts${params}`)).json())
    } catch { /* skip */ }
    setLoading(false)
  }

  const openReceipt = async (id: number) => {
    const data = await (await fetch(`${API}/scan-in/receipts/${id}`)).json()
    setSelected(data)
    setStep('receipt')
  }

  const createReceipt = async () => {
    const r = await fetch(`${API}/scan-in/receipts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entersoft_po_id: newDoc.trim() || null }),
    })
    const data = await r.json()
    setNewDoc(''); setShowNewForm(false)
    await openReceipt(data.id)
  }

  // ── Φάση 1: Scan προϊόντων ─────────────────────────────────────
  const handleProductScan = async (code: string) => {
    if (!selected) return
    try {
      const r = await fetch(`${API}/scan-in/receipts/${selected.id}/scan-product`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode_or_sku: code }),
      })
      const data = await r.json()
      if (!r.ok) { showMessage(data.error, 'error'); return }
      setPopup({ product_id: data.product_id, name: data.name, sku: data.sku, unit: data.unit, qty: data.received_qty })
      setSelected(prev => {
        if (!prev) return prev
        const exists = prev.items.find(i => i.product_id === data.product_id)
        if (exists) return { ...prev, items: prev.items.map(i => i.product_id === data.product_id ? { ...i, received_qty: data.received_qty } : i) }
        return { ...prev, items: [{ product_id: data.product_id, sku: data.sku, name: data.name, unit: data.unit, received_qty: 1, location_id: null, location_code: null, placement_added: false }, ...prev.items] }
      })
    } catch { showMessage('Σφάλμα σύνδεσης', 'error') }
  }

  const closeReceipt = async () => {
    if (!selected || selected.items.length === 0) return
    await fetch(`${API}/scan-in/receipts/${selected.id}/close`, { method: 'POST' })
    setSelected(prev => prev ? { ...prev, status: 'closed' } : prev)
    showMessage('Παραστατικό κλείστηκε — ξεκίνα εναπόθεση', 'success')
  }

  // ── Φάση 2: Εναπόθεση ─────────────────────────────────────────
  const handlePlaceProductScan = async (code: string) => {
    if (!selected) return
    try {
      const r = await fetch(`${API}/scan-in/receipts/${selected.id}/place-product`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode_or_sku: code }),
      })
      const data = await r.json()
      if (!r.ok) { showMessage(data.error, 'error'); return }
      setPopup({
        product_id: data.product_id, name: data.name, sku: data.sku,
        unit: data.unit, qty: data.received_qty,
        is_new: data.is_new, already_placed: data.already_placed,
      })
    } catch { showMessage('Σφάλμα σύνδεσης', 'error') }
  }

  const handlePlaceLocationScan = async (code: string) => {
    if (!selected || !pendingPlace) return
    try {
      const r = await fetch(`${API}/scan-in/receipts/${selected.id}/place-location`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: pendingPlace.product_id, location_code: code, quantity: pendingPlace.qty }),
      })
      const data = await r.json()
      if (!r.ok) { showMessage(data.error, 'error'); return }
      showMessage(`✓ ${data.product} → ${data.location}`, 'success')
      setSelected(prev => {
        if (!prev) return prev
        const updated = prev.items.map(i => i.product_id === pendingPlace.product_id
          ? { ...i, location_code: data.location, location_id: 1 } : i)
        const allPlaced = updated.every(i => i.location_id != null)
        return { ...prev, items: updated, status: allPlaced ? 'completed' : prev.status }
      })
      setPendingPlace(null)
      setStep('receipt')
      if ((await (await fetch(`${API}/scan-in/receipts/${selected.id}`)).json()).status === 'completed') {
        showMessage('Παραλαβή ΟΛΟΚΛΗΡΩΘΗΚΕ ✓', 'success')
        setTimeout(() => { setStep('list'); setSelected(null); loadReceipts() }, 1500)
      }
    } catch { showMessage('Σφάλμα σύνδεσης', 'error') }
  }

  const isPlacementPhase = selected?.status === 'closed'
  const isReadOnly = selected?.status === 'completed'
  const pending = selected?.items.filter(i => !i.location_id) ?? []
  const placed = selected?.items.filter(i => i.location_id) ?? []

  // ── Place location step ────────────────────────────────────────
  if (step === 'place_location' && pendingPlace) {
    return (
      <div className="page">
        {message && <div className={`message ${message.type}`}>{message.text}</div>}
        <div className="step-header">
          <button className="btn-back" onClick={() => { setPendingPlace(null); setStep('receipt') }}>← Πίσω</button>
          <span className="step-title">Σκανάρισε τη Θέση</span>
        </div>
        <div className="location-summary">
          <div className="summary-row">
            <span>{pendingPlace.name}</span>
            <span className="summary-qty">x{pendingPlace.qty} {pendingPlace.unit}</span>
          </div>
          {pendingPlace.is_new && (
            <div className="summary-row" style={{ fontSize: '0.82rem', color: '#e67e00' }}>
              ⚠ Δεν ήταν στο παραστατικό — θα συγχρονιστεί με Ecom
            </div>
          )}
        </div>
        <BarcodeScanner onScan={handlePlaceLocationScan} placeholder="Θέση (π.χ. R-A03-3)..." autoStart type="location" />
      </div>
    )
  }

  // ── Receipt detail ─────────────────────────────────────────────
  if (step === 'receipt' && selected) {
    return (
      <div className="page">
        {message && <div className={`message ${message.type}`}>{message.text}</div>}

        <div className="page-header">
          <button className="btn-back" onClick={() => { setSelected(null); setStep('list') }}>← Πίσω</button>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '1rem' }}>{selected.entersoft_po_id || 'Χωρίς παραστατικό'}</h2>
            <span className="order-id" style={{ color: STATUS_COLOR[selected.status] }}>
              {STATUS_LABEL[selected.status]}
            </span>
          </div>
          <span className="order-status-badge" style={{ background: STATUS_COLOR[selected.status] }}>
            {Math.round(Number(selected.item_count))} είδη
          </span>
          {!isPlacementPhase && !isReadOnly && selected.items.length > 0 && (
            <button className="btn-primary" style={{ padding: '10px 14px', fontSize: '0.88rem' }} onClick={closeReceipt}>
              ✓ Κλείσιμο
            </button>
          )}
        </div>

        {!isReadOnly && (
          <button className="btn-place" onClick={() => setShowScanner(true)}>
            📷 {isPlacementPhase ? 'Σκανάρισε για Εναπόθεση' : 'Σκανάρισε Προϊόν'}
          </button>
        )}

        {/* Scanner popup */}
        {showScanner && (
          <>
            <div className="popup-overlay" onClick={() => setShowScanner(false)} />
            <div className="popup" style={{ gap: 12 }}>
              <button className="popup-close" onClick={() => setShowScanner(false)}>✕</button>
              <div className="popup-name" style={{ fontSize: '0.95rem' }}>
                {isPlacementPhase ? 'Σκανάρισμα για Εναπόθεση' : 'Σκανάρισμα Προϊόντος'}
              </div>
              <BarcodeScanner
                onScan={code => {
                  setShowScanner(false)
                  isPlacementPhase ? handlePlaceProductScan(code) : handleProductScan(code)
                }}
                placeholder="Barcode προϊόντος..."
                autoStart
              />
            </div>
          </>
        )}

        {pending.length > 0 && (
          <>
            <span style={{ fontSize: '0.8rem', color: '#666', paddingLeft: 2 }}>
              {isPlacementPhase ? `Αναμένουν εναπόθεση (${pending.length})` : `Σκαναρισμένα (${pending.length})`}
            </span>
            <div className="scard-list">
              {pending.map(item => (
                <div key={item.product_id} className="scard" style={{ borderLeft: '3px solid #ffc107' }}>
                  <div className="scard-name">{item.name}</div>
                  <div className="scard-bottom">
                    <span className="scard-meta">
                      {item.sku}
                      {item.placement_added && <span style={{ color: '#e67e00' }}> · Νέο</span>}
                    </span>
                    <span className="scard-qty">x{Math.round(Number(item.received_qty))}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {placed.length > 0 && (
          <>
            {!isReadOnly && <span style={{ fontSize: '0.8rem', color: '#666', paddingLeft: 2 }}>Τοποθετήθηκαν ({placed.length})</span>}
            <div className="scard-list" style={isReadOnly ? {} : { opacity: 0.55 }}>
              {placed.map(item => (
                <div key={item.product_id} className="scard">
                  <div className="scard-name">{item.name}</div>
                  <div className="scard-bottom">
                    <span className="scard-meta">
                      {item.sku}
                      {item.location_code && <> · <span className="scard-locs">{item.location_code}</span></>}
                      {item.placement_added && <span style={{ color: '#e67e00' }}> · Νέο</span>}
                    </span>
                    <span className="scard-qty" style={{ color: isReadOnly ? '#111' : '#28a745' }}>
                      {isReadOnly ? '' : '✓ '}x{Math.round(Number(item.received_qty))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Popup */}
        {popup && (
          <>
            <div className="popup-overlay" onClick={() => setPopup(null)} />
            <div className="popup">
              <button className="popup-close" onClick={() => setPopup(null)}>✕</button>
              <div className="popup-name">{popup.name}</div>
              <div className="popup-sku">{popup.sku}</div>
              {popup.is_new && (
                <div style={{ textAlign: 'center', fontSize: '0.82rem', color: '#e67e00', fontWeight: 600 }}>
                  ⚠ Δεν ήταν στο παραστατικό
                </div>
              )}
              {popup.already_placed && (
                <div style={{ textAlign: 'center', fontSize: '0.82rem', color: '#28a745', fontWeight: 600 }}>
                  ✓ Ήδη τοποθετημένο
                </div>
              )}
              <div className="popup-qty-row">
                <button className="qty-btn" onClick={() => setPopup(p => p ? { ...p, qty: Math.max(1, p.qty - 1) } : p)}>−</button>
                <span className="popup-qty">{popup.qty}</span>
                <button className="qty-btn" onClick={() => setPopup(p => p ? { ...p, qty: p.qty + 1 } : p)}>+</button>
              </div>
              {isPlacementPhase ? (
                <button className="btn-place" onClick={() => { setPendingPlace(popup); setPopup(null); setStep('place_location') }}>
                  📍 Σκανάρισε Θέση
                </button>
              ) : (
                <button className="btn-place" onClick={() => setPopup(null)}>
                  ✓ ΟΚ
                </button>
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  // ── List ───────────────────────────────────────────────────────
  return (
    <div className="page">
      {message && <div className={`message ${message.type}`}>{message.text}</div>}

      <div className="page-header">
        <h2 style={{ flex: 1 }}>Παραλαβές</h2>
        <button className="btn-primary" style={{ padding: '10px 14px', fontSize: '0.9rem' }}
          onClick={() => setShowNewForm(v => !v)}>
          + Νέα Παραλαβή
        </button>
      </div>

      <div className="status-filters">
        {(['all', 'open', 'closed', 'completed'] as StatusFilter[]).map(s => (
          <button key={s} className={`status-filter-btn${statusFilter === s ? ' active' : ''}`}
            onClick={() => setStatusFilter(s)}>
            {s === 'all' ? 'Όλες' : STATUS_LABEL[s as ReceiptStatus]}
          </button>
        ))}
      </div>

      {showNewForm && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="scan-input" style={{ flex: 1 }}
            placeholder="Barcode παραστατικού (προαιρετικό)..."
            value={newDoc}
            onChange={e => setNewDoc(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createReceipt()}
            autoFocus
          />
          <button className="btn-primary" style={{ flexShrink: 0 }} onClick={createReceipt}>Έναρξη</button>
        </div>
      )}

      {loading ? <p>Φόρτωση...</p> : receipts.length === 0 && !showNewForm ? (
        <p className="empty">Δεν υπάρχουν ανοιχτές παραλαβές</p>
      ) : (
        <div className="scard-list">
          {receipts.map(r => (
            <div key={r.id} className="scard" onClick={() => openReceipt(r.id)}
              style={{ borderLeft: `3px solid ${STATUS_COLOR[r.status]}` }}>
              <div className="scard-name" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{r.entersoft_po_id || <span style={{ color: '#aaa' }}>Χωρίς παραστατικό</span>}</span>
                <span className="order-status-badge" style={{ background: STATUS_COLOR[r.status] }}>
                  {STATUS_LABEL[r.status]}
                </span>
              </div>
              <div className="scard-bottom">
                <span className="scard-meta">{formatDate(r.created_at)}</span>
                <span className="scard-qty">
                  {r.status === 'closed'
                    ? `${Math.round(Number(r.placed_count))}/${Math.round(Number(r.item_count))} τοποθ.`
                    : `${Math.round(Number(r.item_count))} είδη`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
