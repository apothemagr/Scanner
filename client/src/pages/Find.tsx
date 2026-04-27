import { useState, useEffect, useMemo, useRef } from 'react'
import { API, authFetch } from '../api'

interface StockItem {
  sku: string
  name: string
  unit: string
  brand: string | null
  supplier: string | null
  total_quantity: number
  locations: { location: string; qty: number }[] | null
  site_url: string | null
  ecom_stock: number
}

type QtyFilter = 'all' | 'in_stock' | 'low' | 'zero'

const FILTERS_KEY = 'find_filters_v1'
type SavedFilters = { search: string; skuSearch: string; brand: string; supplier: string; qtyFilter: QtyFilter }
function loadFilters(): SavedFilters {
  try {
    const raw = localStorage.getItem(FILTERS_KEY)
    if (raw) return JSON.parse(raw) as SavedFilters
  } catch { /* ignore */ }
  return { search: '', skuSearch: '', brand: '', supplier: '', qtyFilter: 'all' }
}

type Cache = { sig: string; items: StockItem[]; brands: string[]; suppliers: string[] }
let cache: Cache | null = null
const sigOf = (f: SavedFilters) => JSON.stringify(f)

export default function Find() {
  const initial = loadFilters()
  const [items, setItems] = useState<StockItem[]>(() => {
    if (cache && cache.sig === sigOf(initial)) return cache.items
    return []
  })
  const [brands, setBrands] = useState<string[]>(() => cache?.brands || [])
  const [suppliers, setSuppliers] = useState<string[]>(() => cache?.suppliers || [])
  const [search, setSearch] = useState(initial.search)
  const [skuSearch, setSkuSearch] = useState(initial.skuSearch)
  const [brand, setBrand] = useState(initial.brand)
  const [supplier, setSupplier] = useState(initial.supplier)
  const [qtyFilter, setQtyFilter] = useState<QtyFilter>(initial.qtyFilter)
  const [loading, setLoading] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (brands.length === 0) authFetch(`${API}/stock/brands`).then(r => r.json()).then(d => Array.isArray(d) && setBrands(d)).catch(() => {})
    if (suppliers.length === 0) authFetch(`${API}/stock/suppliers`).then(r => r.json()).then(d => Array.isArray(d) && setSuppliers(d)).catch(() => {})
    searchRef.current?.focus()
  }, [])

  useEffect(() => {
    try { localStorage.setItem(FILTERS_KEY, JSON.stringify({ search, skuSearch, brand, supplier, qtyFilter })) } catch { /* ignore */ }
  }, [search, skuSearch, brand, supplier, qtyFilter])

  useEffect(() => {
    const filters: SavedFilters = { search, skuSearch, brand, supplier, qtyFilter }
    const sig = sigOf(filters)
    const hasFilter = !!(search.trim() || skuSearch.trim() || brand || supplier || (qtyFilter !== 'all'))
    if (!hasFilter) { setItems([]); cache = null; return }
    if (cache && cache.sig === sig) { setItems(cache.items); return }
    const params = new URLSearchParams()
    if (search.trim()) params.set('q', search.trim())
    if (skuSearch.trim()) params.set('sku', skuSearch.trim())
    if (brand) params.set('brand', brand)
    if (supplier) params.set('supplier', supplier)
    if (qtyFilter !== 'all') params.set('qty', qtyFilter)
    setLoading(true)
    const timer = setTimeout(() => {
      authFetch(`${API}/stock?${params.toString()}`)
        .then(r => r.json())
        .then(data => {
          const arr = Array.isArray(data) ? data : []
          setItems(arr)
          setLoading(false)
          cache = { sig, items: arr, brands, suppliers }
        })
        .catch(() => { setItems([]); setLoading(false) })
    }, 250)
    return () => clearTimeout(timer)
  }, [search, skuSearch, brand, supplier, qtyFilter])

  const hasActiveFilters = !!(brand || supplier || qtyFilter !== 'all' || search || skuSearch)
  const clearFilters = () => {
    setSearch(''); setSkuSearch(''); setBrand(''); setSupplier(''); setQtyFilter('all')
  }

  const filteredBrands = useMemo(() => brands.slice(0, 500), [brands])
  const filteredSuppliers = useMemo(() => suppliers.slice(0, 500), [suppliers])

  return (
    <div data-fullwidth style={{
      maxWidth: 1400, margin: '0 auto', padding: '24px 32px',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <h1 style={{ margin: '0 0 24px', fontSize: 24, color: '#1a1a2e' }}>🔍 Εύρεση Προϊόντος</h1>

      <div style={{
        display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto',
        gap: 12, marginBottom: 16, alignItems: 'end',
      }}>
        <FieldGroup label="Τίτλος προϊόντος">
          <input ref={searchRef} type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="π.χ. Φούρνος μικροκυμάτων..." style={inputStyle} />
        </FieldGroup>
        <FieldGroup label="SKU">
          <input type="text" inputMode="numeric" value={skuSearch} onChange={e => setSkuSearch(e.target.value)}
            placeholder="123456" style={inputStyle} />
        </FieldGroup>
        <FieldGroup label="Μάρκα">
          <select value={brand} onChange={e => setBrand(e.target.value)} style={inputStyle}>
            <option value="">— όλες —</option>
            {filteredBrands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </FieldGroup>
        <FieldGroup label="Προμηθευτής">
          <select value={supplier} onChange={e => setSupplier(e.target.value)} style={inputStyle}>
            <option value="">— όλοι —</option>
            {filteredSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </FieldGroup>
        <FieldGroup label="Απόθεμα">
          <select value={qtyFilter} onChange={e => setQtyFilter(e.target.value as QtyFilter)} style={inputStyle}>
            <option value="all">Όλα</option>
            <option value="in_stock">Σε απόθεμα (&gt;0)</option>
            <option value="low">Χαμηλό (1-5)</option>
            <option value="zero">Εξαντλημένα (0)</option>
          </select>
        </FieldGroup>
        <button onClick={clearFilters}
          disabled={!hasActiveFilters}
          style={{
            padding: '10px 16px', fontSize: 14, fontWeight: 600,
            background: hasActiveFilters ? '#e9ecef' : '#f8f9fa',
            color: hasActiveFilters ? '#495057' : '#adb5bd',
            border: '1px solid #ced4da', borderRadius: 6,
            cursor: hasActiveFilters ? 'pointer' : 'not-allowed',
            height: 40,
          }}>
          Καθαρισμός
        </button>
      </div>

      {hasActiveFilters && !loading && (
        <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
          {items.length} αποτελέσματα
        </div>
      )}

      {!hasActiveFilters ? (
        <p style={{ textAlign: 'center', color: '#888', marginTop: 64, fontSize: 16 }}>
          Συμπλήρωσε ένα φίλτρο για αναζήτηση
        </p>
      ) : loading ? (
        <p style={{ textAlign: 'center', color: '#888', marginTop: 32 }}>Φόρτωση...</p>
      ) : items.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#888', marginTop: 32 }}>Δεν βρέθηκαν προϊόντα</p>
      ) : (
        <table style={{
          width: '100%', borderCollapse: 'collapse', background: 'white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)', borderRadius: 8, overflow: 'hidden',
        }}>
          <thead>
            <tr style={{ background: '#1a1a2e', color: 'white', textAlign: 'left' }}>
              <th style={thStyle}>SKU</th>
              <th style={thStyle}>Προϊόν</th>
              <th style={thStyle}>Προμηθευτής</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Τοποθεσίες</th>
              <th style={{ ...thStyle, textAlign: 'right', width: 100 }}>Στοκ</th>
              <th style={{ ...thStyle, textAlign: 'right', width: 100 }}>Ecom</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={item.sku}
                onClick={() => item.site_url && window.open(item.site_url, '_blank')}
                style={{
                  background: i % 2 === 0 ? 'white' : '#f8f9fa',
                  cursor: item.site_url ? 'pointer' : 'default',
                  borderBottom: '1px solid #eef0f3',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#e7f3ff')}
                onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? 'white' : '#f8f9fa')}
              >
                <td style={{ ...tdStyle, fontFamily: 'monospace', color: '#666' }}>{item.sku}</td>
                <td style={tdStyle}>
                  {item.brand && <span style={{ color: '#1a6fa8', fontWeight: 600 }}>{item.brand} </span>}
                  {item.name}
                </td>
                <td style={tdStyle}>{item.supplier || '—'}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  {item.locations && item.locations.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
                      {item.locations.map(l => (
                        <span key={l.location} style={{
                          background: '#e7f3ff', color: '#1a6fa8', fontWeight: 700,
                          padding: '3px 8px', borderRadius: 4, fontSize: 13,
                        }}>
                          📍 {l.location}: {l.qty}
                        </span>
                      ))}
                    </div>
                  ) : <span style={{ color: '#999', fontSize: 13 }}>—</span>}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700,
                  color: item.total_quantity === 0 ? '#dc3545' : item.total_quantity <= 5 ? '#e67e00' : '#28a745' }}>
                  {item.total_quantity} {item.unit}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', color: '#999', fontSize: 13 }}>
                  {item.ecom_stock}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 12, color: '#666', fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 40, padding: '0 10px', fontSize: 14,
  border: '1px solid #ced4da', borderRadius: 6, background: 'white',
  boxSizing: 'border-box',
}

const thStyle: React.CSSProperties = { padding: '12px 14px', fontSize: 13, fontWeight: 600 }
const tdStyle: React.CSSProperties = { padding: '10px 14px', fontSize: 14, verticalAlign: 'middle' }
