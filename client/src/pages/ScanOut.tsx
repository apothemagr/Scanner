import { useState, useEffect } from 'react'
import BarcodeScanner from '../components/BarcodeScanner'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

interface PickingOrder {
  id: number
  entersoft_so_id: string
  customer_name: string
  order_type: 'pickup' | 'courier'
  transporter: string
  voucher_qty: number
  invoice_date: string
  status: string
  item_count: number
  picked_count: number
}

interface PickingItem {
  product_id: number
  sku: string
  name: string
  unit: string
  required_qty: number
  picked_qty: number
  location_code: string | null
}

interface OrderDetail extends PickingOrder {
  items: PickingItem[]
}

interface ScannedProduct {
  product_id: number
  name: string
  sku: string
  unit: string
  location_code: string | null
  location_id: number | null
  required_qty: number
  picked_qty: number
  qty: number
  single_location?: boolean
}

type Step = 'list' | 'order' | 'scan_location'
type StatusFilter = 'all' | 'open' | 'in_progress' | 'completed'

const STATUS_LABEL: Record<string, string> = {
  open: 'Εκκρεμεί',
  in_progress: 'Σε Picking',
  completed: 'Ολοκληρωμένη',
}
const STATUS_COLOR: Record<string, string> = {
  open: '#f0a500',
  in_progress: '#1a6fa8',
  completed: '#28a745',
}

export default function ScanOut() {
  const [tab, setTab] = useState<'pickup' | 'courier'>('pickup')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [orders, setOrders] = useState<PickingOrder[]>([])
  const [selected, setSelected] = useState<OrderDetail | null>(null)
  const [step, setStep] = useState<Step>('list')
  const [popup, setPopup] = useState<ScannedProduct | null>(null)
  const [unpickPopup, setUnpickPopup] = useState<{ product_id: number; name: string; sku: string; unit: string; location_code: string | null; picked_qty: number } | null>(null)
  const [pendingLocation, setPendingLocation] = useState<ScannedProduct | null>(null)
  const [pendingUnpick, setPendingUnpick] = useState<typeof unpickPopup>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadOrders(statusFilter)
    const interval = setInterval(() => loadOrders(statusFilter), 45000)
    return () => clearInterval(interval)
  }, [statusFilter])

  useEffect(() => {
    const onPopState = () => {
      if (step === 'scan_location') {
        setPendingLocation(null)
        setStep('order')
      } else if (step === 'order') {
        setSelected(null)
        setStep('list')
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [step])

  useEffect(() => {
    if (step === 'order' || step === 'scan_location') {
      window.history.pushState({ step }, '')
    }
  }, [step])

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 3500)
  }

  const loadOrders = async (status?: StatusFilter) => {
    setLoading(true)
    try {
      const s = status ?? statusFilter
      const params = s !== 'all' ? `?status=${s}` : ''
      const res = await fetch(`${API}/scan-out/pickings${params}`)
      setOrders(await res.json())
    } catch { /* skip */ }
    setLoading(false)
  }

  const openOrder = async (id: number) => {
    const res = await fetch(`${API}/scan-out/pickings/${id}`)
    const data = await res.json()
    setSelected(data)
    setStep('order')
  }

  const handleProductScan = async (code: string) => {
    if (!selected) return
    try {
      const res = await fetch(`${API}/scan-out/pickings/${selected.id}/scan-product`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode_or_sku: code }),
      })
      const data = await res.json()
      if (!res.ok) { showMessage(data.error, 'error'); return }

      if (data.mode === 'unpick') {
        setUnpickPopup(data)
      } else {
        setPopup({ ...data })
      }
    } catch {
      showMessage('Σφάλμα σύνδεσης', 'error')
    }
  }

  const handleLocationScan = async (code: string) => {
    if (!selected) return

    // Un-pick mode
    if (pendingUnpick) {
      try {
        const res = await fetch(`${API}/scan-out/pickings/${selected.id}/unpick`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_id: pendingUnpick.product_id, location_code: code, quantity: pendingUnpick.picked_qty }),
        })
        const data = await res.json()
        if (!res.ok) { showMessage(data.error, 'error'); return }
        showMessage(`↩ ${data.product} → ${data.location}`, 'success')
        setPendingUnpick(null)
        setStep('list')
        setSelected(null)
        loadOrders(statusFilter)
      } catch { showMessage('Σφάλμα σύνδεσης', 'error') }
      return
    }

    if (!pendingLocation) return
    try {
      const res = await fetch(`${API}/scan-out/pickings/${selected.id}/scan-location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_code: code,
          product_id: pendingLocation.product_id,
          quantity: pendingLocation.qty,
        }),
      })
      const data = await res.json()
      if (!res.ok) { showMessage(data.error, 'error'); return }

      if (data.order_complete) {
        showMessage('Παραγγελία ΟΛΟΚΛΗΡΩΘΗΚΕ! ✓', 'success')
        setStep('list')
        setSelected(null)
        setPendingLocation(null)
        loadOrders()
      } else {
        showMessage(`✓ ${data.product} (${data.picked}/${data.required})`, 'success')
        setPendingLocation(null)
        setStep('list')
        setSelected(null)
        loadOrders(statusFilter)
      }
    } catch {
      showMessage('Σφάλμα σύνδεσης', 'error')
    }
  }

  const handleUnpickDirect = async (item: typeof unpickPopup) => {
    if (!selected || !item) return
    try {
      const res = await fetch(`${API}/scan-out/pickings/${selected.id}/unpick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: item.product_id, location_code: item.location_code, quantity: item.picked_qty }),
      })
      const data = await res.json()
      if (!res.ok) { showMessage(data.error, 'error'); return }
      showMessage(`↩ ${data.product} → ${data.location}`, 'success')
      setStep('list')
      setSelected(null)
      loadOrders(statusFilter)
    } catch { showMessage('Σφάλμα σύνδεσης', 'error') }
  }

  const confirmPick = async () => {
    if (!popup) return
    if (popup.location_code) {
      setPopup(null)
      await handleLocationScanDirect(popup)
    } else {
      setPendingLocation(popup)
      setPopup(null)
      setStep('scan_location')
    }
  }

  const handleLocationScanDirect = async (item: ScannedProduct) => {
    if (!selected) return
    try {
      const res = await fetch(`${API}/scan-out/pickings/${selected.id}/scan-location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_code: item.location_code, product_id: item.product_id, quantity: item.qty }),
      })
      const data = await res.json()
      if (!res.ok) { showMessage(data.error, 'error'); return }
      if (data.order_complete) {
        showMessage('Παραγγελία ΟΛΟΚΛΗΡΩΘΗΚΕ! ✓', 'success')
        setStep('list'); setSelected(null)
        loadOrders(statusFilter)
      } else {
        showMessage(`✓ ${data.product} → ${item.location_code}`, 'success')
        setStep('list')
        setSelected(null)
        loadOrders(statusFilter)
      }
    } catch { showMessage('Σφάλμα σύνδεσης', 'error') }
  }

  const displayOrders = orders.filter(o => o.order_type === tab)
  const pending = selected?.items.filter(i => i.picked_qty < i.required_qty) || []
  const done = selected?.items.filter(i => i.picked_qty >= i.required_qty) || []

  // ── Location scan step ──────────────────────────────────────────
  if (step === 'scan_location' && (pendingLocation || pendingUnpick)) {
    return (
      <div className="page">
        {message && <div className={`message ${message.type}`}>{message.text}</div>}
        <div className="step-header">
          <button className="btn-back" onClick={() => { setPendingLocation(null); setStep('order') }}>← Πίσω</button>
          <span className="step-title">{pendingUnpick ? 'Θέση Επαναφοράς' : 'Σκανάρισε τη Θέση'}</span>
        </div>
        <div className="location-summary">
          {pendingUnpick ? (
            <>
              <div className="summary-row">
                <span>{pendingUnpick.name}</span>
                <span className="summary-qty">x{Math.round(pendingUnpick.picked_qty)} {pendingUnpick.unit}</span>
              </div>
              {pendingUnpick.location_code && (
                <div className="summary-row">
                  <span style={{ fontSize: '0.85rem', color: '#666' }}>Αρχική θέση</span>
                  <span style={{ color: '#007bff', fontWeight: 700 }}>{pendingUnpick.location_code}</span>
                </div>
              )}
            </>
          ) : pendingLocation && (
            <>
              <div className="summary-row">
                <span>{pendingLocation.name}</span>
                <span className="summary-qty">x{pendingLocation.qty} {pendingLocation.unit}</span>
              </div>
              {pendingLocation.location_code && (
                <div className="summary-row">
                  <span style={{ fontSize: '0.85rem', color: '#666' }}>Αναμενόμενη θέση</span>
                  <span style={{ color: '#007bff', fontWeight: 700 }}>{pendingLocation.location_code}</span>
                </div>
              )}
            </>
          )}
        </div>
        <BarcodeScanner onScan={handleLocationScan} placeholder="Σκανάρισμα θέσης..." autoStart type="location" />
      </div>
    )
  }

  // ── Order detail step ───────────────────────────────────────────
  if (step === 'order' && selected) {
    return (
      <div className="page">
        {message && <div className={`message ${message.type}`}>{message.text}</div>}

        <div className="page-header">
          <button className="btn-back" onClick={() => { setSelected(null); setStep('list') }}>← Πίσω</button>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '1rem' }}>{selected.customer_name}</h2>
            <span className="order-id">{selected.entersoft_so_id}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <span className="order-status-badge" style={{ background: STATUS_COLOR[selected.status] }}>
              {STATUS_LABEL[selected.status] ?? selected.status}
            </span>
            {selected.voucher_qty > 1 && (
              <span style={{ fontSize: '0.78rem', color: '#666' }}>{selected.voucher_qty} δέματα</span>
            )}
          </div>
        </div>

        <BarcodeScanner onScan={handleProductScan} placeholder="Σκανάρισμα προϊόντος..." paused={!!popup} />

        {pending.length > 0 && (
          <>
            <span style={{ fontSize: '0.8rem', color: '#666', paddingLeft: 2 }}>Εκκρεμή ({pending.length})</span>
            <div className="scard-list">
              {pending.map(item => (
                <div key={item.product_id} className="scard" style={{ borderLeft: '3px solid #ffc107' }}>
                  <div className="scard-name">{item.name || item.sku}</div>
                  <div className="scard-bottom">
                    <span className="scard-meta">
                      {item.sku}
                      {item.location_code && <> · <span className="scard-locs">{item.location_code}</span></>}
                    </span>
                    <span className="scard-qty">{Math.round(item.picked_qty)}/{Math.round(item.required_qty)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {done.length > 0 && (
          <>
            <span style={{ fontSize: '0.8rem', color: '#666', paddingLeft: 2 }}>Μαζεύτηκαν ({done.length})</span>
            <div className="scard-list" style={{ opacity: 0.5 }}>
              {done.map(item => (
                <div key={item.product_id} className="scard">
                  <div className="scard-bottom">
                    <span className="scard-name" style={{ fontSize: '0.88rem' }}>{item.name || item.sku}</span>
                    <span className="scard-qty" style={{ color: '#28a745' }}>✓</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Un-pick popup */}
        {unpickPopup && (
          <>
            <div className="popup-overlay" onClick={() => setUnpickPopup(null)} />
            <div className="popup">
              <button className="popup-close" onClick={() => setUnpickPopup(null)}>✕</button>
              <div className="popup-name">{unpickPopup.name}</div>
              <div className="popup-sku">{unpickPopup.sku}</div>
              {unpickPopup.location_code && (
                <div style={{ textAlign: 'center', fontSize: '1rem', color: '#007bff', fontWeight: 700 }}>
                  📍 {unpickPopup.location_code}
                </div>
              )}
              <div style={{ textAlign: 'center', fontSize: '0.9rem', color: '#666' }}>
                Ποσότητα: {Math.round(unpickPopup.picked_qty)} {unpickPopup.unit}
              </div>
              <button className="btn-place" style={{ background: '#dc3545' }} onClick={() => {
                if (unpickPopup.location_code) {
                  setUnpickPopup(null)
                  handleUnpickDirect(unpickPopup)
                } else {
                  setPendingUnpick(unpickPopup)
                  setUnpickPopup(null)
                  setStep('scan_location')
                }
              }}>
                ↩ Επαναφορά στη Θέση
              </button>
            </div>
          </>
        )}

        {/* Popup — εμφανίζεται μετά το scan προϊόντος */}
        {popup && (
          <>
            <div className="popup-overlay" onClick={() => setPopup(null)} />
            <div className="popup">
              <button className="popup-close" onClick={() => setPopup(null)}>✕</button>
              <div className="popup-name">{popup.name}</div>
              <div className="popup-sku">{popup.sku}</div>
              {popup.location_code && (
                <div style={{ textAlign: 'center', fontSize: '1.1rem', color: '#007bff', fontWeight: 700 }}>
                  📍 {popup.location_code}
                </div>
              )}
              <div className="popup-qty-row">
                <button className="qty-btn" onClick={() => setPopup(p => p ? { ...p, qty: Math.max(1, p.qty - 1) } : p)}>−</button>
                <span className="popup-qty">{Math.round(popup.qty)}</span>
                <button className="qty-btn" onClick={() => setPopup(p => p ? { ...p, qty: Math.min(p.required_qty - p.picked_qty, p.qty + 1) } : p)}>+</button>
              </div>
              <button className="btn-place" onClick={confirmPick}>
                📦 Αφαίρεση από Θέση
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  // ── Orders list ─────────────────────────────────────────────────
  return (
    <div className="page">
      {message && <div className={`message ${message.type}`}>{message.text}</div>}

      <div className="picking-tabs">
        <button className={`picking-tab${tab === 'pickup' ? ' active' : ''}`} onClick={() => setTab('pickup')}>
          Παραλαβή
          <span className="tab-count">{orders.filter(o => o.order_type === 'pickup').length}</span>
        </button>
        <button className={`picking-tab${tab === 'courier' ? ' active' : ''}`} onClick={() => setTab('courier')}>
          Courier
          <span className="tab-count">{orders.filter(o => o.order_type === 'courier').length}</span>
        </button>
      </div>

      <div className="status-filters">
        {(['all', 'open', 'in_progress', 'completed'] as StatusFilter[]).map(s => (
          <button
            key={s}
            className={`status-filter-btn${statusFilter === s ? ' active' : ''}`}
            onClick={() => setStatusFilter(s)}
          >
            {s === 'all' ? 'Όλες' : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {loading ? <p>Φόρτωση...</p> : displayOrders.length === 0 ? (
        <p className="empty">Δεν υπάρχουν ανοιχτές παραγγελίες</p>
      ) : (
        <div className="scard-list">
          {displayOrders.map(o => (
            <div key={o.id} className="scard" onClick={() => openOrder(o.id)}>
              <div className="scard-name" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{o.customer_name}</span>
                <span className="order-status-badge" style={{ background: STATUS_COLOR[o.status] }}>
                  {STATUS_LABEL[o.status] ?? o.status}
                </span>
              </div>
              <div className="scard-bottom">
                <span className="scard-meta">
                  {o.entersoft_so_id}
                  {o.voucher_qty > 1 && <> · <span className="scard-locs">{o.voucher_qty} δέμ.</span></>}
                </span>
                <span className="scard-qty">{Math.round(Number(o.picked_count))}/{Math.round(Number(o.item_count))} είδη</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
