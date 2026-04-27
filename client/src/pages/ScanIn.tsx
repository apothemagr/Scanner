import { useState, useEffect } from 'react'
import { API, authFetch } from '../api'
import BarcodeScanner from '../components/BarcodeScanner'
import LinkBarcodeModal from '../components/LinkBarcodeModal'
import PrintLabelModal from '../components/PrintLabelModal'


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
  receipt_type: 'supplier' | 'internal'
  created_at: string
  completed_at: string | null
  item_count: number
  placed_count: number
}

interface ReceiptItem {
  sku: string
  name: string
  unit: string
  received_qty: number
  expected_qty: number | null
  location_id: number | null
  location_code: string | null
  placement_added: boolean
}

interface ReceiptDetail extends Receipt {
  items: ReceiptItem[]
}

interface Popup {
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
  const [newFormManual, setNewFormManual] = useState(false)
  const [newReceiptType, setNewReceiptType] = useState<'supplier' | 'internal' | 'expectation' | null>(null)
  const [expectationSuppliers, setExpectationSuppliers] = useState<{ supplier: string; sku_count: number; expected_units: number }[]>([])
  const [expectationSearch, setExpectationSearch] = useState('')
  const [newDoc, setNewDoc] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [showScanner, setShowScanner] = useState(false)
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null)
  const [printSku, setPrintSku] = useState<string | null>(null)
  const [showEditDoc, setShowEditDoc] = useState(false)
  const [editDocVal, setEditDocVal] = useState('')
  const [receiptTab, setReceiptTab] = useState<'awaiting' | 'scanned'>('scanned')

  // Αρχική κατάσταση: αν υπάρχει αποθηκευμένο receipt id, ξεκίνα κατευθείαν σε mode 'receipt'
  const [restoring, setRestoring] = useState(() => !!localStorage.getItem('scanin_open_receipt'))

  useEffect(() => {
    if (!restoring) loadReceipts(statusFilter)
  }, [statusFilter, restoring])

  // Restore τρέχουσα παραλαβή μετά από refresh — fetch χωρίς να γυρνάμε στη λίστα πρώτα
  useEffect(() => {
    const savedId = localStorage.getItem('scanin_open_receipt')
    if (savedId) {
      const id = Number(savedId)
      if (!isNaN(id)) {
        setStep('receipt')
        authFetch(`${API}/scan-in/receipts/${id}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => {
            if (d) setSelected(d)
            else { localStorage.removeItem('scanin_open_receipt'); setStep('list') }
            setRestoring(false)
          })
          .catch(() => { localStorage.removeItem('scanin_open_receipt'); setStep('list'); setRestoring(false) })
      }
    }
  }, [])

  // Persist current open receipt
  useEffect(() => {
    if (step === 'receipt' && selected) {
      localStorage.setItem('scanin_open_receipt', String(selected.id))
    } else if (step === 'list') {
      localStorage.removeItem('scanin_open_receipt')
    }
  }, [step, selected?.id])

  useEffect(() => {
    const onPopState = () => {
      if (step === 'place_location') { setPendingPlace(null); setStep('receipt') }
      else if (step === 'receipt') { setSelected(null); setStep('list'); loadReceipts() }
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
      setReceipts(await (await authFetch(`${API}/scan-in/receipts${params}`)).json())
    } catch { /* skip */ }
    setLoading(false)
  }

  const openReceipt = async (id: number) => {
    const data = await (await authFetch(`${API}/scan-in/receipts/${id}`)).json()
    setSelected(data)
    setStep('receipt')
  }

  const createReceiptWith = async (doc: string) => {
    const r = await authFetch(`${API}/scan-in/receipts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entersoft_po_id: doc.trim() || null, receipt_type: newReceiptType }),
    })
    const data = await r.json()
    setNewDoc(''); setShowNewForm(false); setNewReceiptType(null)
    await openReceipt(data.id)
  }

  const createReceipt = async () => createReceiptWith(newDoc)

  const loadExpectationSuppliers = async () => {
    setNewReceiptType('expectation')
    setExpectationSearch('')
    try {
      const r = await authFetch(`${API}/expectations/suppliers`)
      const d = await r.json()
      setExpectationSuppliers(Array.isArray(d) ? d : [])
    } catch { setExpectationSuppliers([]) }
  }

  const createReceiptFromExpectation = async (supplier: string) => {
    try {
      const r = await authFetch(`${API}/scan-in/receipts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier_name: supplier, receipt_type: 'supplier', from_expectations: true }),
      })
      const d = await r.json()
      if (!r.ok) { showMessage(d.error || 'Σφάλμα', 'error'); return }
      setShowNewForm(false); setNewReceiptType(null)
      loadReceipts()
      openReceipt(d.id)
    } catch { showMessage('Σφάλμα σύνδεσης', 'error') }
  }

  // ── Φάση 1: Scan προϊόντων ─────────────────────────────────────
  const handleProductScan = async (code: string) => {
    if (!selected) return
    try {
      const r = await authFetch(`${API}/scan-in/receipts/${selected.id}/scan-product`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode_or_sku: code }),
      })
      const data = await r.json()
      if (!r.ok) {
        if (r.status === 404) {
          // Άγνωστο barcode — πρότεινε αντιστοίχιση με υπάρχον προϊόν
          setUnknownBarcode(code)
        } else {
          showMessage(data.error, 'error')
        }
        return
      }
      setShowScanner(false)
      // Warnings για unexpected ή over-expected
      if (data.unexpected) {
        showMessage(`⚠ "${data.name}" δεν ήταν στις αναμονές προμηθευτή`, 'error')
      } else if (data.over_expected) {
        showMessage(`⚠ Σκαναρίστηκαν παραπάνω από αναμενόμενα (${data.received_qty}/${data.expected_qty})`, 'error')
      }
      setPopup({ name: data.name, sku: data.sku, unit: data.unit, qty: data.received_qty })
      // Αν έγινε auto-prefetch αναμονών, ξαναφορτώνουμε όλο το receipt για να εμφανιστούν τα Αναμενόμενα
      if (data.prefetched) {
        const r = await authFetch(`${API}/scan-in/receipts/${selected.id}`)
        if (r.ok) {
          const fresh = await r.json()
          setSelected(fresh)
        }
        return
      }
      setSelected(prev => {
        if (!prev) return prev
        const updated = { ...prev }
        if (data.supplier && !prev.supplier_name) updated.supplier_name = data.supplier
        const exists = prev.items.find(i => i.sku === data.sku)
        if (exists) return { ...updated, items: prev.items.map(i => i.sku === data.sku ? { ...i, received_qty: data.received_qty } : i) }
        return { ...updated, items: [{ sku: data.sku, name: data.name, unit: data.unit, received_qty: 1, expected_qty: null, location_id: null, location_code: null, placement_added: false }, ...prev.items] }
      })
    } catch { showMessage('Σφάλμα σύνδεσης', 'error') }
  }

  const closeReceipt = async () => {
    if (!selected || selected.items.length === 0) return
    await authFetch(`${API}/scan-in/receipts/${selected.id}/close`, { method: 'POST' })
    setSelected(prev => prev ? { ...prev, status: 'closed' } : prev)
    showMessage('Παραστατικό κλείστηκε — ξεκίνα εναπόθεση', 'success')
  }


  const handlePlaceAll = async (location_code: string) => {
    if (!selected) return
    try {
      const r = await authFetch(`${API}/scan-in/receipts/${selected.id}/place-all`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_code }),
      })
      const data = await r.json()
      if (!r.ok) { showMessage(data.error, 'error'); return }
      showMessage(`✓ ${data.count} είδη → ${data.location}`, 'success')
      setTimeout(() => { setStep('list'); setSelected(null); loadReceipts() }, 1500)
    } catch { showMessage('Σφάλμα σύνδεσης', 'error') }
  }

  const handlePlaceLocationScan = async (code: string) => {
    if (!selected || !pendingPlace) return
    try {
      const r = await authFetch(`${API}/scan-in/receipts/${selected.id}/place-location`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: pendingPlace.sku, location_code: code, quantity: pendingPlace.qty }),
      })
      const data = await r.json()
      if (!r.ok) { showMessage(data.error, 'error'); return }
      showMessage(`✓ ${data.sku} → ${data.location}`, 'success')
      setSelected(prev => {
        if (!prev) return prev
        const updated = prev.items.map(i => i.sku === pendingPlace.sku
          ? { ...i, location_code: data.location, location_id: 1 } : i)
        const allPlaced = updated.every(i => i.location_id != null)
        return { ...prev, items: updated, status: allPlaced ? 'completed' : prev.status }
      })
      setPendingPlace(null)
      setStep('receipt')
      if ((await (await authFetch(`${API}/scan-in/receipts/${selected.id}`)).json()).status === 'completed') {
        showMessage('Παραλαβή ΟΛΟΚΛΗΡΩΘΗΚΕ ✓', 'success')
        setTimeout(() => { setStep('list'); setSelected(null); loadReceipts() }, 1500)
      }
    } catch { showMessage('Σφάλμα σύνδεσης', 'error') }
  }

  const isPlacementPhase = selected?.status === 'closed'
  const isReadOnly = selected?.status === 'completed'
  const awaiting = selected?.items.filter(i => !i.location_id && Number(i.received_qty) === 0 && Number(i.expected_qty || 0) > 0) ?? []
  const pending = selected?.items.filter(i => !i.location_id && Number(i.received_qty) > 0) ?? []
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

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button className="btn-back" onClick={() => { setSelected(null); setStep('list'); loadReceipts() }}>← Πίσω</button>
          <span
            style={{ fontWeight: 800, fontSize: '1.1rem', color: '#1a1a2e', cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 3 }}
            onClick={() => {
              if (selected.status !== 'open') {
                showMessage('Δεν επιτρέπεται αλλαγή — το παραστατικό έχει εξαχθεί στο Ecommerce', 'error')
                return
              }
              setEditDocVal(selected.entersoft_po_id || '')
              setShowEditDoc(true)
            }}
          >
            {selected.entersoft_po_id || <span style={{ color: '#aaa', fontWeight: 400 }}>Χωρίς παραστατικό</span>}
          </span>
        </div>
        {(selected.supplier_name || selected.receipt_type === 'internal') && (
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: selected.receipt_type === 'internal' ? '#6f42c1' : '#1a6fa8' }}>
            {selected.receipt_type === 'internal' ? '🔄 Ενδοδιακίνηση' : selected.supplier_name}
          </span>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.82rem', color: '#666' }}>{selected.items.length} είδη</span>
            {placed.length > 0 && (
              <span style={{ fontSize: '0.82rem', color: '#28a745', fontWeight: 600 }}>· {placed.length} τοποθ.</span>
            )}
          </div>
          <span style={{ background: STATUS_COLOR[selected.status], color: 'white', borderRadius: 6, padding: '2px 10px', fontSize: '0.75rem', fontWeight: 700 }}>
            {STATUS_LABEL[selected.status]}
          </span>
          {!isPlacementPhase && !isReadOnly && selected.items.length > 0 && (
            <button className="btn-primary" style={{ padding: '8px 28px', fontSize: '0.88rem', flex: 'none', background: '#28a745' }} onClick={closeReceipt}>
              ✓ Οριστικοποίηση
            </button>
          )}
        </div>

        {!isReadOnly && (
          <button className="btn-place" onClick={() => { setReceiptTab('scanned'); setShowScanner(true) }}>
            📷 {isPlacementPhase ? 'Σκανάρισε Θέση για Μαζική Εναπόθεση' : 'Σκανάρισε Προϊόν'}
          </button>
        )}

        {/* Scanner popup */}
        {showScanner && (
          <>
            <div className="popup-overlay" onClick={() => setShowScanner(false)} />
            <div className="popup" style={{ gap: 12 }}>
              <button className="popup-close" onClick={() => setShowScanner(false)}>✕</button>
              <div className="popup-name" style={{ fontSize: '0.95rem' }}>
                {isPlacementPhase ? 'Σκανάρισε Θέση Εναπόθεσης' : 'Σκανάρισμα Προϊόντος'}
              </div>
              <BarcodeScanner
                onScan={code => {
                  if (isPlacementPhase) { setShowScanner(false); handlePlaceAll(code) }
                  else handleProductScan(code)
                }}
                onStop={!isPlacementPhase ? () => setShowScanner(false) : undefined}
                placeholder={isPlacementPhase ? 'Θέση (π.χ. R-A06-3)...' : 'Barcode προϊόντος...'}
                autoStart
                type={isPlacementPhase ? 'location' : 'product'}
              />
            </div>
          </>
        )}

        {showEditDoc && (
          <>
            <div className="popup-overlay" onClick={() => setShowEditDoc(false)} />
            <div className="popup" style={{ gap: 14, bottom: 'auto', top: 0, borderRadius: '0 0 20px 20px' }}>
              <button className="popup-close" onClick={() => setShowEditDoc(false)}>✕</button>
              <div className="popup-name">Αριθμός Παραστατικού</div>
              <input
                className="scan-input"
                value={editDocVal}
                onChange={e => setEditDocVal(e.target.value)}
                onKeyDown={async e => {
                  if (e.key === 'Enter') {
                    const r = await authFetch(`${API}/scan-in/receipts/${selected.id}`, {
                      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ entersoft_po_id: editDocVal.trim() }),
                    })
                    if (!r.ok) { showMessage('Σφάλμα αποθήκευσης', 'error'); return }
                    setSelected(prev => prev ? { ...prev, entersoft_po_id: editDocVal.trim() } : prev)
                    setReceipts(prev => prev.map(rec => rec.id === selected.id ? { ...rec, entersoft_po_id: editDocVal.trim() } : rec))
                    setShowEditDoc(false)
                  }
                }}
                autoFocus
                placeholder="Αριθμός παραστατικού..."
              />
              <button className="btn-primary" onClick={async () => {
                const r = await authFetch(`${API}/scan-in/receipts/${selected.id}`, {
                  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ entersoft_po_id: editDocVal.trim() }),
                })
                if (!r.ok) { showMessage('Σφάλμα αποθήκευσης', 'error'); return }
                setSelected(prev => prev ? { ...prev, entersoft_po_id: editDocVal.trim() } : prev)
                setReceipts(prev => prev.map(rec => rec.id === selected.id ? { ...rec, entersoft_po_id: editDocVal.trim() } : rec))
                setShowEditDoc(false)
              }}>Αποθήκευση</button>
            </div>
          </>
        )}

        {!isPlacementPhase && (awaiting.length > 0 || pending.length > 0) && (
          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #ddd' }}>
            {awaiting.length > 0 && (
              <button
                onClick={() => setReceiptTab('awaiting')}
                style={{
                  padding: '10px 14px', border: 'none', cursor: 'pointer', flex: 1,
                  background: receiptTab === 'awaiting' ? '#1a1a2e' : 'transparent',
                  color: receiptTab === 'awaiting' ? 'white' : '#666',
                  borderRadius: '6px 6px 0 0', fontWeight: 600, fontSize: '0.88rem',
                }}>
                📋 Αναμονές ({awaiting.length})
              </button>
            )}
            <button
              onClick={() => setReceiptTab('scanned')}
              style={{
                padding: '10px 14px', border: 'none', cursor: 'pointer', flex: 1,
                background: receiptTab === 'scanned' ? '#1a1a2e' : 'transparent',
                color: receiptTab === 'scanned' ? 'white' : '#666',
                borderRadius: '6px 6px 0 0', fontWeight: 600, fontSize: '0.88rem',
              }}>
              ✓ Σκαναρισμένα ({pending.length})
            </button>
          </div>
        )}

        {!isPlacementPhase && receiptTab === 'awaiting' && awaiting.length > 0 && (
          <div className="scard-list">
            {awaiting.map(item => (
              <div key={item.sku} style={{ position: 'relative' }}>
                <div className="scard"
                  style={{ borderLeft: '3px solid #999', opacity: 0.7, paddingRight: 56 }}>
                  <div className="scard-name">{item.name}</div>
                  <div className="scard-bottom">
                    <span className="scard-meta">{item.sku}</span>
                    <span className="scard-qty" style={{ color: '#999' }}>
                      0/{Math.round(Number(item.expected_qty || 0))}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPrintSku(item.sku)}
                  title="Εκτύπωση label"
                  style={{ position: 'absolute', top: 8, right: 8, background: '#f0f0f0',
                    border: '1px solid #ccc', borderRadius: 6, padding: '6px 10px',
                    cursor: 'pointer', fontSize: 18, lineHeight: 1, zIndex: 5 }}
                >🖨</button>
              </div>
            ))}
          </div>
        )}

        {pending.length > 0 && (isPlacementPhase || receiptTab === 'scanned') && (
          <>
            {isPlacementPhase && <span style={{ fontSize: '0.8rem', color: '#666', paddingLeft: 2 }}>
              Αναμένουν εναπόθεση ({pending.length})
            </span>}
            <div className="scard-list">
              {pending.map(item => (
                <div key={item.sku} style={{ position: 'relative' }}>
                  <div
                    className="scard"
                    style={{ borderLeft: '3px solid #ffc107', cursor: (isPlacementPhase || !isReadOnly) ? 'pointer' : 'default', paddingRight: 56 }}
                    onClick={() => {
                      if (isReadOnly) return
                      setPopup({ name: item.name, sku: item.sku, unit: item.unit, qty: item.received_qty })
                    }}
                  >
                    <div className="scard-name">{item.name}</div>
                    <div className="scard-bottom">
                      <span className="scard-meta">
                        {item.sku}
                        {item.placement_added && <span style={{ color: '#e67e00' }}> · Νέο</span>}
                      </span>
                      <span className="scard-qty">
                        {isPlacementPhase ? <span style={{ color: '#1a6fa8' }}>📍 Εναπόθεση</span> : null}
                        {' '}{item.expected_qty != null && Number(item.expected_qty) > 0
                          ? <span style={{ color: Number(item.received_qty) === Number(item.expected_qty) ? '#28a745' : Number(item.received_qty) > Number(item.expected_qty) ? '#dc3545' : '#e67e00' }}>
                              {Math.round(Number(item.received_qty))}/{Math.round(Number(item.expected_qty))}
                            </span>
                          : <>x{Math.round(Number(item.received_qty))}</>}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPrintSku(item.sku)}
                    title="Εκτύπωση label"
                    style={{
                      position: 'absolute', top: 8, right: 8,
                      background: '#f0f0f0', border: '1px solid #ccc', borderRadius: 6,
                      padding: '6px 10px', cursor: 'pointer', fontSize: 18, lineHeight: 1, zIndex: 5,
                    }}
                  >🖨</button>
                </div>
              ))}
            </div>
          </>
        )}

        {placed.length > 0 && (
          <>
            <div className="scard-list">
              {placed.map(item => (
                <div key={item.sku} style={{ position: 'relative' }}>
                  <div className="scard" style={{ borderLeft: '3px solid #28a745', paddingRight: 56 }}>
                  <div className="scard-name">{item.name}</div>
                  <div className="scard-bottom">
                    <span className="scard-meta">
                      {item.sku}
                      {item.placement_added && <span style={{ color: '#e67e00' }}> · Νέο</span>}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {item.location_code && (
                        <span style={{ background: '#e8f4fd', color: '#1a6fa8', fontWeight: 700, fontSize: '0.88rem', borderRadius: 6, padding: '2px 8px' }}>
                          📍 {item.location_code}
                        </span>
                      )}
                      <span className="scard-qty" style={{ color: '#28a745' }}>✓ x{Math.round(Number(item.received_qty))}</span>
                    </span>
                  </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPrintSku(item.sku)}
                    title="Εκτύπωση label"
                    style={{
                      position: 'absolute', top: 8, right: 8,
                      background: '#f0f0f0', border: '1px solid #ccc', borderRadius: 6,
                      padding: '6px 10px', cursor: 'pointer', fontSize: 18, lineHeight: 1, zIndex: 5,
                    }}
                  >🖨</button>
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
                <>
                  <button className="btn-place" onClick={async () => {
                    if (!selected || !popup) return
                    await authFetch(`${API}/scan-in/receipts/${selected.id}/items/${popup.sku}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ quantity: popup.qty }),
                    })
                    setSelected(prev => prev ? {
                      ...prev,
                      items: prev.items.map(i => i.sku === popup.sku ? { ...i, received_qty: popup.qty } : i)
                    } : prev)
                    setPopup(null)
                  }}>
                    ✓ ΟΚ
                  </button>
                  <button style={{ background: 'none', border: 'none', color: '#dc3545', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', padding: '4px 0' }}
                    onClick={async () => {
                      if (!selected || !popup) return
                      const dr = await authFetch(`${API}/scan-in/receipts/${selected.id}/items/${popup.sku}`, { method: 'DELETE' })
                      const dd = await dr.json()
                      setSelected(prev => {
                        if (!prev) return prev
                        const items = prev.items.filter(i => i.sku !== popup.sku)
                        return { ...prev, items, supplier_name: dd.empty ? null : prev.supplier_name }
                      })
                      setPopup(null)
                    }}>
                    Αφαίρεση από παραλαβή
                  </button>
                </>
              )}
            </div>
          </>
        )}
        {printSku && <PrintLabelModal sku={printSku} onClose={() => setPrintSku(null)} />}
        {unknownBarcode && (
          <LinkBarcodeModal
            barcode={unknownBarcode}
            onClose={() => setUnknownBarcode(null)}
            onLinked={() => {
              const code = unknownBarcode
              setUnknownBarcode(null)
              if (code) handleProductScan(code)
            }}
          />
        )}
      </div>
    )
  }

  // Loading screen όσο φορτώνει η αποθηκευμένη παραλαβή
  if (restoring || (step === 'receipt' && !selected)) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
        <span style={{ color: '#888' }}>Φόρτωση...</span>
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
          onClick={() => { setShowNewForm(true); setNewDoc('') }}>
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
        <>
          <div className="popup-overlay" onClick={() => { setShowNewForm(false); setNewFormManual(false); setNewReceiptType(null) }} />
          <div className="popup" style={{ gap: 14, bottom: 'auto', top: 0, borderRadius: '0 0 20px 20px' }}>
            <button className="popup-close" onClick={() => { setShowNewForm(false); setNewFormManual(false); setNewReceiptType(null) }}>✕</button>
            <div className="popup-name">Νέα Παραλαβή</div>

            {!newReceiptType ? (
              // Βήμα 1: Επιλογή τύπου
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button className="btn-primary" style={{ padding: '18px', fontSize: '1rem' }}
                  onClick={() => setNewReceiptType('supplier')}>
                  📦 Παραλαβή Προμηθευτή
                </button>
                <button style={{ padding: '18px', fontSize: '1rem', fontWeight: 700, background: '#6f42c1', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}
                  onClick={() => setNewReceiptType('internal')}>
                  🔄 Ενδοδιακίνηση
                </button>
              </div>
            ) : newReceiptType === 'expectation' ? (
              // Επιλογή προμηθευτή από αναμονές
              <>
                <div style={{ fontSize: '0.82rem', color: '#28a745', fontWeight: 700, textAlign: 'center' }}>
                  📋 Από Αναμονή Προμηθευτή
                </div>
                <input
                  className="scan-input"
                  placeholder="Αναζήτηση προμηθευτή..."
                  value={expectationSearch}
                  onChange={e => setExpectationSearch(e.target.value)}
                  autoFocus
                />
                <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {expectationSuppliers
                    .filter(s => !expectationSearch || s.supplier.toLowerCase().includes(expectationSearch.toLowerCase()))
                    .map(s => (
                      <button key={s.supplier}
                        onClick={() => createReceiptFromExpectation(s.supplier)}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
                          padding: 10, border: '1px solid #ddd', borderRadius: 6, background: 'white',
                          textAlign: 'left', cursor: 'pointer' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{s.supplier}</span>
                        <span style={{ fontSize: '0.78rem', color: '#666' }}>
                          {s.sku_count} είδη · {s.expected_units} τεμ.
                        </span>
                      </button>
                    ))}
                  {expectationSuppliers.length === 0 && (
                    <p style={{ textAlign: 'center', color: '#888' }}>Φόρτωση...</p>
                  )}
                </div>
                <button className="btn-secondary btn-cancel-camera" style={{ background: '#f0f2f5', color: '#666', fontSize: '0.9rem', padding: '12px' }}
                  onClick={() => setNewReceiptType(null)}>
                  ← Πίσω
                </button>
              </>
            ) : !newFormManual ? (
              // Βήμα 2: Κάμερα
              <>
                <div style={{ fontSize: '0.82rem', color: newReceiptType === 'internal' ? '#6f42c1' : '#e67e00', fontWeight: 700, textAlign: 'center' }}>
                  {newReceiptType === 'internal' ? '🔄 Ενδοδιακίνηση' : '📦 Παραλαβή Προμηθευτή'}
                </div>
                <BarcodeScanner
                  onScan={code => { setShowNewForm(false); setNewFormManual(false); setNewReceiptType(null); createReceiptWith(code) }}
                  placeholder="Barcode παραστατικού..."
                  autoStart
                  cameraOnly
                />
                <button className="btn-secondary btn-cancel-camera" onClick={() => setNewFormManual(true)}>
                  ⌨️ Χειροκίνητη Παραλαβή
                </button>
                <button className="btn-secondary btn-cancel-camera" style={{ background: '#f0f2f5', color: '#666', fontSize: '0.9rem', padding: '12px' }}
                  onClick={() => setNewReceiptType(null)}>
                  ← Πίσω
                </button>
              </>
            ) : (
              // Βήμα 2: Χειροκίνητη εισαγωγή
              <>
                <div style={{ fontSize: '0.82rem', color: newReceiptType === 'internal' ? '#6f42c1' : '#e67e00', fontWeight: 700, textAlign: 'center' }}>
                  {newReceiptType === 'internal' ? '🔄 Ενδοδιακίνηση' : '📦 Παραλαβή Προμηθευτή'}
                </div>
                <button className="btn-secondary btn-cancel-camera" onClick={() => setNewFormManual(false)}>
                  ← Κάμερα
                </button>
                <input
                  className="scan-input"
                  placeholder="Αριθμός παραστατικού..."
                  value={newDoc}
                  onChange={e => setNewDoc(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createReceipt()}
                  autoFocus
                />
                <button className="btn-primary" style={{ width: '100%' }} onClick={createReceipt}>
                  Καταχώρηση
                </button>
              </>
            )}
          </div>
        </>
      )}

      {loading ? <p>Φόρτωση...</p> : receipts.length === 0 && !showNewForm ? (
        <p className="empty">Δεν υπάρχουν ανοιχτές παραλαβές</p>
      ) : (
        <div className="scard-list">
          {receipts.map(r => (
            <div key={r.id} className="scard" onClick={() => openReceipt(r.id)}
              style={{ borderLeft: `3px solid ${r.receipt_type === 'internal' ? '#6f42c1' : STATUS_COLOR[r.status]}` }}>
              <div className="scard-name" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{r.entersoft_po_id || <span style={{ color: '#aaa' }}>Χωρίς παραστατικό</span>}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="order-status-badge" style={{ background: STATUS_COLOR[r.status] }}>
                    {STATUS_LABEL[r.status]}
                  </span>
                </div>
              </div>
              <div className="scard-bottom">
                <span className="scard-meta">
                  {formatDate(r.created_at)}
                  {r.supplier_name && <span style={{ color: r.receipt_type === 'internal' ? '#dc3545' : '#1a6fa8', fontWeight: 600 }}> · {r.supplier_name}</span>}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="scard-qty">
                    {r.status === 'closed'
                      ? `${Math.round(Number(r.placed_count))}/${Math.round(Number(r.item_count))} τοποθ.`
                      : `${Math.round(Number(r.item_count))} είδη`}
                  </span>
                  {r.status === 'open' && (
                    <button
                      style={{ background: 'none', border: 'none', color: '#dc3545', fontSize: '1.1rem', cursor: 'pointer', padding: '0', lineHeight: 1 }}
                      onClick={async e => {
                        e.stopPropagation()
                        if (!confirm('Διαγραφή παραλαβής;')) return
                        const res = await authFetch(`${API}/scan-in/receipts/${r.id}`, { method: 'DELETE' })
                        if (res.ok) setReceipts(prev => prev.filter(x => x.id !== r.id))
                        else showMessage('Σφάλμα διαγραφής', 'error')
                      }}
                    >🗑</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {unknownBarcode && (
        <LinkBarcodeModal
          barcode={unknownBarcode}
          onClose={() => setUnknownBarcode(null)}
          onLinked={() => {
            const code = unknownBarcode
            setUnknownBarcode(null)
            if (code) handleProductScan(code)
          }}
        />
      )}
      {printSku && <PrintLabelModal sku={printSku} onClose={() => setPrintSku(null)} />}
    </div>
  )
}
