import { useState, useEffect } from 'react'
import { API, authFetch } from '../api'

type Tab = 'dashboard' | 'activity' | 'productivity' | 'top'

interface Dashboard {
  orders_completed: number
  orders_today: number
  receipts_completed: number
  receipts_pending: number
  items_out_today: number
  items_in_today: number
  low_stock_count: number
  total_stock_units: number
  distinct_skus_in_stock: number
}

interface ActivityRow {
  id: number
  sku: string
  product_name: string
  type: 'in' | 'out'
  quantity: number
  reference_type: string
  reference_id: number | null
  created_at: string
  location_code: string | null
  user_name: string | null
  username: string | null
}

interface ProductivityRow {
  id: number | null
  username: string | null
  full_name: string | null
  scans: number
  total_qty: number
  orders: number
}

interface TopRow {
  sku: string
  product_name: string
  scans: number
  total_qty: number
}

interface UserItem { id: number; username: string; full_name: string | null }

const REF_LABEL: Record<string, string> = {
  receipt: 'Παραλαβή', picking: 'Picking', transfer: 'Μετακίνηση', unpick: 'Un-pick',
}
const REF_COLOR: Record<string, string> = {
  receipt: '#28a745', picking: '#007bff', transfer: '#6f42c1', unpick: '#fd7e14',
}

function formatDateTime(s: string): string {
  if (!s) return ''
  const d = new Date(s)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

export default function Reports() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [activity, setActivity] = useState<ActivityRow[]>([])
  const [productivity, setProductivity] = useState<ProductivityRow[]>([])
  const [topItems, setTopItems] = useState<TopRow[]>([])
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(false)

  // Activity filters
  const [actSku, setActSku] = useState('')
  const [actType, setActType] = useState<'' | 'in' | 'out'>('')
  const [actRef, setActRef] = useState('')
  const [actUser, setActUser] = useState('')
  const [actFrom, setActFrom] = useState('')
  const [actTo, setActTo] = useState('')

  useEffect(() => {
    authFetch(`${API}/reports/users`).then(r => r.json()).then(d => Array.isArray(d) && setUsers(d)).catch(() => {})
  }, [])

  useEffect(() => {
    if (tab === 'dashboard') {
      setLoading(true)
      authFetch(`${API}/reports/dashboard`).then(r => r.json()).then(d => { setDashboard(d); setLoading(false) }).catch(() => setLoading(false))
    }
    if (tab === 'productivity') {
      setLoading(true)
      authFetch(`${API}/reports/picking-productivity`).then(r => r.json()).then(d => { setProductivity(Array.isArray(d) ? d : []); setLoading(false) }).catch(() => setLoading(false))
    }
    if (tab === 'top') {
      setLoading(true)
      authFetch(`${API}/reports/top-moving?days=30&limit=20`).then(r => r.json()).then(d => { setTopItems(Array.isArray(d) ? d : []); setLoading(false) }).catch(() => setLoading(false))
    }
  }, [tab])

  const loadActivity = () => {
    const p = new URLSearchParams()
    if (actSku) p.set('sku', actSku)
    if (actType) p.set('type', actType)
    if (actRef) p.set('ref_type', actRef)
    if (actUser) p.set('user_id', actUser)
    if (actFrom) p.set('from', actFrom)
    if (actTo) p.set('to', actTo)
    p.set('limit', '200')
    setLoading(true)
    authFetch(`${API}/reports/activity?${p.toString()}`)
      .then(r => r.json())
      .then(d => { setActivity(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { if (tab === 'activity') loadActivity() }, [tab])

  return (
    <div className="page">
      <div className="page-header">
        <h2 style={{ flex: 1 }}>📊 Αναφορές</h2>
      </div>

      <div className="tabs" style={{ display: 'flex', gap: 4, borderBottom: '1px solid #ddd' }}>
        {(['dashboard', 'activity', 'productivity', 'top'] as Tab[]).map(t => (
          <button key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '10px 14px', border: 'none', cursor: 'pointer',
              background: tab === t ? '#1a1a2e' : 'transparent',
              color: tab === t ? 'white' : '#666',
              borderRadius: '6px 6px 0 0', fontWeight: 600, fontSize: '0.9rem',
            }}>
            {t === 'dashboard' ? '📈 KPIs' : t === 'activity' ? '📜 Κινήσεις' : t === 'productivity' ? '👤 Παραγωγικότητα' : '🔥 Top Items'}
          </button>
        ))}
      </div>

      {loading && <p style={{ textAlign: 'center', color: '#888' }}>Φόρτωση...</p>}

      {tab === 'dashboard' && dashboard && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 12 }}>
          <KpiCard label="Παραγγελίες σήμερα" value={dashboard.orders_today} sub={`${dashboard.orders_completed} ολοκληρωμένες`} color="#007bff" />
          <KpiCard label="Παραλαβές εκκρεμείς" value={dashboard.receipts_pending} sub={`${dashboard.receipts_completed} σήμερα ολοκληρωμένες`} color="#28a745" />
          <KpiCard label="Είδη OUT σήμερα" value={dashboard.items_out_today} color="#dc3545" />
          <KpiCard label="Είδη IN σήμερα" value={dashboard.items_in_today} color="#17a2b8" />
          <KpiCard label="Low stock (≤5)" value={dashboard.low_stock_count} color="#ffc107" />
          <KpiCard label="Διαφορετικά SKUs" value={dashboard.distinct_skus_in_stock} color="#6f42c1" />
          <KpiCard label="Σύνολο τεμαχίων" value={dashboard.total_stock_units} color="#1a1a2e" />
        </div>
      )}

      {tab === 'activity' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 6, marginTop: 8 }}>
            <input className="scan-input" placeholder="SKU..." value={actSku} onChange={e => setActSku(e.target.value)} />
            <select className="scan-input" value={actType} onChange={e => setActType(e.target.value as '' | 'in' | 'out')}>
              <option value="">Όλα (in/out)</option>
              <option value="in">Είσοδος</option>
              <option value="out">Έξοδος</option>
            </select>
            <select className="scan-input" value={actRef} onChange={e => setActRef(e.target.value)}>
              <option value="">Όλοι οι τύποι</option>
              <option value="receipt">Παραλαβή</option>
              <option value="picking">Picking</option>
              <option value="transfer">Μετακίνηση</option>
              <option value="unpick">Un-pick</option>
            </select>
            <select className="scan-input" value={actUser} onChange={e => setActUser(e.target.value)}>
              <option value="">Όλοι οι χρήστες</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.username}</option>)}
            </select>
            <input className="scan-input" type="date" value={actFrom} onChange={e => setActFrom(e.target.value)} />
            <input className="scan-input" type="date" value={actTo} onChange={e => setActTo(e.target.value)} />
          </div>
          <button className="btn-primary" style={{ marginTop: 6 }} onClick={loadActivity}>Φιλτράρισμα</button>

          <div className="scard-list" style={{ marginTop: 8 }}>
            {activity.map(a => (
              <div key={a.id} className="scard" style={{ borderLeft: `3px solid ${REF_COLOR[a.reference_type] || '#888'}` }}>
                <div className="scard-name" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ flex: 1, fontSize: '0.92rem' }}>{a.product_name}</span>
                  <span style={{ color: a.type === 'in' ? '#28a745' : '#dc3545', fontWeight: 700 }}>
                    {a.type === 'in' ? '+' : '−'}{a.quantity}
                  </span>
                </div>
                <div className="scard-bottom">
                  <span className="scard-meta" style={{ fontSize: '0.78rem' }}>
                    {a.sku}
                    {a.location_code && <> · 📍 {a.location_code}</>}
                    {' · '}<span style={{ color: REF_COLOR[a.reference_type] || '#888' }}>{REF_LABEL[a.reference_type] || a.reference_type}</span>
                    {a.user_name && <> · 👤 {a.user_name}</>}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#888' }}>{formatDateTime(a.created_at)}</span>
                </div>
              </div>
            ))}
            {activity.length === 0 && !loading && <p className="empty" style={{ textAlign: 'center', color: '#888' }}>Δεν υπάρχουν κινήσεις</p>}
          </div>
        </>
      )}

      {tab === 'productivity' && (
        <div className="scard-list" style={{ marginTop: 12 }}>
          {productivity.map((p, i) => (
            <div key={p.id || i} className="scard">
              <div className="scard-name">
                {p.full_name || p.username || '— χωρίς χρήστη —'}
              </div>
              <div className="scard-bottom">
                <span className="scard-meta">
                  {p.scans} scans · {p.orders} παραγγελίες
                </span>
                <span className="scard-qty">{p.total_qty} τεμ.</span>
              </div>
            </div>
          ))}
          {productivity.length === 0 && !loading && <p className="empty" style={{ textAlign: 'center', color: '#888' }}>Καμία δραστηριότητα picking</p>}
        </div>
      )}

      {tab === 'top' && (
        <div className="scard-list" style={{ marginTop: 12 }}>
          {topItems.map((t, i) => (
            <div key={t.sku} className="scard">
              <div className="scard-name" style={{ display: 'flex', gap: 8 }}>
                <span style={{ minWidth: 24, color: '#888', fontWeight: 700 }}>#{i + 1}</span>
                <span style={{ flex: 1 }}>{t.product_name}</span>
              </div>
              <div className="scard-bottom">
                <span className="scard-meta">{t.sku} · {t.scans} scans</span>
                <span className="scard-qty">{t.total_qty} τεμ.</span>
              </div>
            </div>
          ))}
          {topItems.length === 0 && !loading && <p className="empty" style={{ textAlign: 'center', color: '#888' }}>Καμία κίνηση τις τελευταίες 30 ημέρες</p>}
        </div>
      )}
    </div>
  )
}

function KpiCard({ label, value, sub, color }: { label: string; value: number; sub?: string; color: string }) {
  return (
    <div style={{
      background: 'white', borderRadius: 10, padding: 14,
      borderLeft: `4px solid ${color}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      <div style={{ fontSize: '0.78rem', color: '#666', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '1.8rem', fontWeight: 800, color, lineHeight: 1 }}>{Math.round(value).toLocaleString('el-GR')}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: '#888', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}
