import { useState, useEffect } from 'react'
import { API, authFetch } from '../api'

interface User {
  id: number
  username: string
  full_name: string | null
  can_orders: boolean
  can_receipts: boolean
  can_stock: boolean
  is_admin: boolean
}

const emptyForm = { username: '', password: '', full_name: '', can_orders: false, can_receipts: false, can_stock: false, is_admin: false }

export default function Admin() {
  const [users, setUsers] = useState<User[]>([])
  const [editing, setEditing] = useState<User | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    const r = await authFetch(`${API}/users`)
    setUsers(await r.json())
  }

  const openEdit = (u: User) => {
    setEditing(u)
    setForm({ username: u.username, password: '', full_name: u.full_name || '', can_orders: u.can_orders, can_receipts: u.can_receipts, can_stock: u.can_stock, is_admin: u.is_admin })
    setError('')
  }

  const openNew = () => {
    setEditing(null)
    setForm(emptyForm)
    setShowNew(true)
    setError('')
  }

  const save = async () => {
    setError('')
    if (editing) {
      const r = await authFetch(`${API}/users/${editing.id}`, { method: 'PATCH', body: JSON.stringify(form) })
      if (!r.ok) { setError((await r.json()).error); return }
    } else {
      const r = await authFetch(`${API}/users`, { method: 'POST', body: JSON.stringify(form) })
      if (!r.ok) { setError((await r.json()).error); return }
    }
    setEditing(null); setShowNew(false)
    load()
  }

  const deleteUser = async (u: User) => {
    if (!confirm(`Διαγραφή χρήστη "${u.username}";`)) return
    await authFetch(`${API}/users/${u.id}`, { method: 'DELETE' })
    load()
  }

  const PERM_LABEL: Record<string, string> = { can_orders: 'Παραγγελίες', can_receipts: 'Παραλαβές', can_stock: 'Απόθεμα', is_admin: 'Admin' }

  const showForm = editing || showNew

  return (
    <div className="page">
      <div className="page-header">
        <h2 style={{ flex: 1 }}>Χρήστες</h2>
        <button className="btn-primary" style={{ padding: '10px 14px', fontSize: '0.9rem' }} onClick={openNew}>+ Νέος</button>
      </div>

      {showForm && (
        <>
          <div className="popup-overlay" onClick={() => { setEditing(null); setShowNew(false) }} />
          <div className="popup" style={{ gap: 14, bottom: 'auto', top: 0, borderRadius: '0 0 20px 20px' }}>
            <button className="popup-close" onClick={() => { setEditing(null); setShowNew(false) }}>✕</button>
            <div className="popup-name">{editing ? 'Επεξεργασία Χρήστη' : 'Νέος Χρήστης'}</div>

            <input className="scan-input" placeholder="Username" value={form.username} disabled={!!editing}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))} autoCapitalize="none" />
            <input className="scan-input" placeholder={editing ? 'Νέο password (κενό = χωρίς αλλαγή)' : 'Password'} type="password"
              value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            <input className="scan-input" placeholder="Ονοματεπώνυμο" value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(['can_orders', 'can_receipts', 'can_stock', 'is_admin'] as const).map(key => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
                    style={{ width: 22, height: 22, cursor: 'pointer' }} />
                  <span style={{ fontSize: '1rem', fontWeight: 600 }}>{PERM_LABEL[key]}</span>
                </label>
              ))}
            </div>

            {error && <div style={{ background: '#f8d7da', color: '#721c24', padding: '10px 14px', borderRadius: 8, fontSize: '0.9rem' }}>{error}</div>}
            <button className="btn-primary" style={{ width: '100%' }} onClick={save}>Αποθήκευση</button>
          </div>
        </>
      )}

      <div className="scard-list">
        {users.map(u => (
          <div key={u.id} className="scard" onClick={() => openEdit(u)}>
            <div className="scard-name" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700 }}>{u.full_name || u.username}</span>
              <span style={{ fontSize: '0.78rem', color: '#888' }}>{u.username}</span>
            </div>
            <div className="scard-bottom">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {u.can_receipts && <span style={{ background: '#e8f4fd', color: '#1a6fa8', borderRadius: 6, padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600 }}>Παραλαβές</span>}
                {u.can_orders && <span style={{ background: '#fff3cd', color: '#856404', borderRadius: 6, padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600 }}>Παραγγελίες</span>}
                {u.can_stock && <span style={{ background: '#d4edda', color: '#155724', borderRadius: 6, padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600 }}>Απόθεμα</span>}
                {u.is_admin && <span style={{ background: '#1a1a2e', color: 'white', borderRadius: 6, padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600 }}>Admin</span>}
              </div>
              <button style={{ background: 'none', border: 'none', color: '#dc3545', fontSize: '1.1rem', cursor: 'pointer' }}
                onClick={e => { e.stopPropagation(); deleteUser(u) }}>🗑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
