import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { API, authFetch } from '../api'

interface Suggestion {
  sku: string
  name: string
  brand: string | null
  supplier_sku: string | null
}

interface Props {
  barcode: string
  onClose: () => void
  onLinked: (sku: string) => void
}

export default function LinkBarcodeModal({ barcode, onClose, onLinked }: Props) {
  const [query, setQuery] = useState('')
  const [field, setField] = useState<'name' | 'sku' | 'supplier_sku'>('name')
  const [results, setResults] = useState<Suggestion[]>([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (query.trim().length < 2) { setResults([]); return }
    timer.current = setTimeout(async () => {
      const r = await authFetch(`${API}/products/search?q=${encodeURIComponent(query.trim())}&field=${field}`)
      if (r.ok) setResults(await r.json())
    }, 300)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [query, field])

  const link = async (sku: string) => {
    setSaving(true)
    setErr(null)
    try {
      const r = await authFetch(`${API}/products/aliases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode, sku }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'Σφάλμα'); setSaving(false); return }
      onLinked(sku)
    } catch {
      setErr('Σφάλμα σύνδεσης')
      setSaving(false)
    }
  }

  return createPortal(
    <>
      <div className="popup-overlay" onClick={onClose} />
      <div className="popup" style={{ gap: 12 }}>
        <button className="popup-close" onClick={onClose}>✕</button>
        <div className="popup-name">Σύνδεσε barcode με προϊόν</div>
        <div style={{ fontSize: '0.85rem', color: '#666', textAlign: 'center' }}>
          Άγνωστο barcode: <strong>{barcode}</strong>
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" className={field === 'name' ? 'btn-primary' : 'btn-secondary'} onClick={() => { setField('name'); setQuery(''); setResults([]) }} style={{ flex: 1, fontSize: '0.85rem' }}>Τίτλος</button>
          <button type="button" className={field === 'sku' ? 'btn-primary' : 'btn-secondary'} onClick={() => { setField('sku'); setQuery(''); setResults([]) }} style={{ flex: 1, fontSize: '0.85rem' }}>SKU</button>
          <button type="button" className={field === 'supplier_sku' ? 'btn-primary' : 'btn-secondary'} onClick={() => { setField('supplier_sku'); setQuery(''); setResults([]) }} style={{ flex: 1, fontSize: '0.85rem' }}>Sup.SKU</button>
        </div>

        <input
          type="text"
          className="scan-input"
          placeholder={`Αναζήτηση με ${field === 'name' ? 'τίτλο' : field === 'sku' ? 'SKU' : 'supplier SKU'}...`}
          value={query}
          onChange={e => setQuery(e.target.value)}
          inputMode={field === 'sku' ? 'numeric' : 'text'}
          autoFocus
        />

        {results.length > 0 && (
          <div className="suggestions" style={{ position: 'static', maxHeight: 250, overflowY: 'auto' }}>
            {results.map(s => (
              <div key={s.sku} className="suggestion-row" onClick={() => link(s.sku)} style={{ cursor: saving ? 'wait' : 'pointer' }}>
                <span className="suggestion-name">{s.brand ? `${s.brand} · ` : ''}{s.name}</span>
                <span className="suggestion-sku">{s.sku}{s.supplier_sku ? ` · ${s.supplier_sku}` : ''}</span>
              </div>
            ))}
          </div>
        )}

        {err && <div style={{ color: '#dc3545', fontSize: '0.85rem', textAlign: 'center' }}>{err}</div>}
      </div>
    </>,
    document.body
  )
}
