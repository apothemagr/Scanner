import { useState, useEffect, useMemo, useRef } from 'react'
import { API, authFetch } from '../api'
import PrintLabelModal from '../components/PrintLabelModal'

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

interface SearchableSelectProps {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder: string
}

function SearchableSelect({ value, onChange, options, placeholder }: SearchableSelectProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const displayValue = open ? query : value
  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!q) return options.slice(0, 100)
    return options.filter(o => o.toLowerCase().includes(q)).slice(0, 100)
  }, [q, options])

  const select = (v: string) => {
    onChange(v)
    setQuery('')
    setOpen(false)
  }

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
    setQuery('')
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: '1 1 140px', minWidth: 0 }}>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          className="scan-input"
          placeholder={placeholder}
          value={displayValue}
          onFocus={() => { setQuery(''); setOpen(true) }}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          style={{ paddingRight: value ? 30 : undefined }}
        />
        {value && (
          <button
            type="button"
            onClick={clear}
            aria-label="Καθαρισμός"
            style={{
              position: 'absolute',
              right: 6,
              top: '50%',
              transform: 'translateY(-50%)',
              border: 'none',
              background: 'transparent',
              fontSize: 18,
              cursor: 'pointer',
              color: '#888',
              padding: '0 6px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>
      {open && filtered.length > 0 && (
        <div
          className="suggestions"
          style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, maxHeight: 260, overflowY: 'auto' }}
        >
          {filtered.map(opt => (
            <div
              key={opt}
              className="suggestion-row"
              onMouseDown={e => { e.preventDefault(); select(opt) }}
            >
              <span className="suggestion-name">{opt}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const FILTERS_KEY = 'stock_filters_v1'
type SavedFilters = { search: string; skuSearch: string; brand: string; supplier: string; qtyFilter: QtyFilter }
function loadFilters(): SavedFilters {
  try {
    const raw = localStorage.getItem(FILTERS_KEY)
    if (raw) return JSON.parse(raw) as SavedFilters
  } catch { /* ignore */ }
  return { search: '', skuSearch: '', brand: '', supplier: '', qtyFilter: 'all' }
}

// Module-level cache — επιβιώνει mount/unmount μέσα στο ίδιο session
type StockCache = { sig: string; items: StockItem[]; brands: string[]; suppliers: string[] }
let stockCache: StockCache | null = null
const filtersSig = (f: SavedFilters) => JSON.stringify(f)

export default function Stock() {
  const initial = loadFilters()
  const [items, setItems] = useState<StockItem[]>(() => {
    if (stockCache && stockCache.sig === filtersSig(initial)) return stockCache.items
    return []
  })
  const [brands, setBrands] = useState<string[]>(() => stockCache?.brands || [])
  const [suppliers, setSuppliers] = useState<string[]>(() => stockCache?.suppliers || [])
  const [search, setSearch] = useState(initial.search)
  const [skuSearch, setSkuSearch] = useState(initial.skuSearch)
  const [brand, setBrand] = useState(initial.brand)
  const [supplier, setSupplier] = useState(initial.supplier)
  const [qtyFilter, setQtyFilter] = useState<QtyFilter>(initial.qtyFilter)
  const [loading, setLoading] = useState(false)
  const [printSku, setPrintSku] = useState<string | null>(null)
  const [headerVisible, setHeaderVisible] = useState(true)
  const lastScrollY = useRef(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = document.querySelector('.app-main') as HTMLElement
    if (!container) return
    const onScroll = () => {
      const y = container.scrollTop
      const scrollingUp = y < lastScrollY.current
      if (scrollingUp) {
        setHeaderVisible(true)
      } else if (listRef.current) {
        const listTop = listRef.current.getBoundingClientRect().top
        if (listTop <= 4) setHeaderVisible(false)
      }
      lastScrollY.current = y
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => container.removeEventListener('scroll', onScroll)
  }, [])

  // Φόρτωση brands/suppliers μία φορά (από ecom)
  useEffect(() => {
    if (brands.length === 0) authFetch(`${API}/stock/brands`).then(r => r.json()).then(d => Array.isArray(d) && setBrands(d)).catch(() => {})
    if (suppliers.length === 0) authFetch(`${API}/stock/suppliers`).then(r => r.json()).then(d => Array.isArray(d) && setSuppliers(d)).catch(() => {})
  }, [])

  // Persist filters σε localStorage
  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify({ search, skuSearch, brand, supplier, qtyFilter }))
    } catch { /* ignore */ }
  }, [search, skuSearch, brand, supplier, qtyFilter])

  // Φόρτωση προϊόντων με βάση τα φίλτρα (debounced)
  useEffect(() => {
    const filters: SavedFilters = { search, skuSearch, brand, supplier, qtyFilter }
    const sig = filtersSig(filters)
    const hasFilter = !!(search.trim() || skuSearch.trim() || brand || supplier || (qtyFilter !== 'all'))
    if (!hasFilter) {
      setItems([])
      stockCache = null
      return
    }
    // Αν cache ταιριάζει με τα τρέχοντα φίλτρα, μην ξανακάνεις fetch
    if (stockCache && stockCache.sig === sig) {
      setItems(stockCache.items)
      return
    }
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
          stockCache = { sig, items: arr, brands, suppliers }
        })
        .catch(() => { setItems([]); setLoading(false) })
    }, 250)
    return () => clearTimeout(timer)
  }, [search, skuSearch, brand, supplier, qtyFilter])

  // Ενημέρωση cache για brands/suppliers όταν φορτώνουν
  useEffect(() => {
    if (stockCache) stockCache = { ...stockCache, brands, suppliers }
  }, [brands, suppliers])

  const filtered = items

  const hasActiveFilters = !!(brand || supplier || qtyFilter !== 'all' || search || skuSearch)

  const clearFilters = () => {
    setSearch('')
    setSkuSearch('')
    setBrand('')
    setSupplier('')
    setQtyFilter('all')
  }

  return (
    <div className="page">
      <div className={`stock-filters-header${headerVisible ? '' : ' hidden'}`}>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', flex: 2, minWidth: 0 }}>
            <input
              type="text"
              placeholder="Τίτλος προϊόντος..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="scan-input"
              style={{ paddingRight: search ? 36 : undefined, width: '100%' }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Καθαρισμός"
                style={{
                  position: 'absolute', right: 8, top: '50%',
                  transform: 'translateY(-50%)', border: 'none',
                  background: 'transparent', fontSize: 20,
                  cursor: 'pointer', color: '#888', padding: '0 6px', lineHeight: 1,
                }}
              >×</button>
            )}
          </div>
          <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <input
              type="text"
              inputMode="numeric"
              placeholder="SKU..."
              value={skuSearch}
              onChange={e => setSkuSearch(e.target.value)}
              className="scan-input"
              style={{ paddingRight: skuSearch ? 36 : undefined, width: '100%' }}
            />
            {skuSearch && (
              <button
                type="button"
                onClick={() => setSkuSearch('')}
                aria-label="Καθαρισμός"
                style={{
                  position: 'absolute', right: 8, top: '50%',
                  transform: 'translateY(-50%)', border: 'none',
                  background: 'transparent', fontSize: 20,
                  cursor: 'pointer', color: '#888', padding: '0 6px', lineHeight: 1,
                }}
              >×</button>
            )}
          </div>
        </div>

        <div className="filters-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <SearchableSelect value={brand} onChange={setBrand} options={brands} placeholder="Μάρκα..." />
          <SearchableSelect value={supplier} onChange={setSupplier} options={suppliers} placeholder="Προμηθευτής..." />
          <select
            value={qtyFilter}
            onChange={e => setQtyFilter(e.target.value as QtyFilter)}
            className="scan-input"
            style={{ flex: '1 1 140px', minWidth: 0 }}
          >
            <option value="all">Όλο το απόθεμα</option>
            <option value="in_stock">Σε απόθεμα (&gt;0)</option>
            <option value="low">Χαμηλό (1-5)</option>
            <option value="zero">Εξαντλημένα (0)</option>
          </select>
        </div>

        {hasActiveFilters && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#666' }}>
              {filtered.length} από {items.length} προϊόντα
            </span>
            <button className="btn-clear" onClick={clearFilters}>Καθαρισμός φίλτρων</button>
          </div>
        )}
      </div>

      {loading ? <p>Φόρτωση...</p> : !hasActiveFilters ? (
        <p className="empty" style={{ textAlign: 'center', color: '#888', marginTop: 32 }}>
          Συμπλήρωσε ένα πεδίο αναζήτησης ή φίλτρο
        </p>
      ) : (
        <div className="scard-list" ref={listRef}>
          {filtered.map(item => (
            <div
              key={item.sku}
              className="scard"
              onClick={() => item.site_url && window.open(item.site_url, '_blank')}
            >
              <div className="scard-name" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ flex: 1 }}>
                  {item.brand ? <span className="scard-brand">{item.brand} </span> : null}
                  {item.name}
                </span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setPrintSku(item.sku) }}
                  title="Εκτύπωση label"
                  style={{ background: 'transparent', border: '1px solid #ccc', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', fontSize: 14 }}
                >🖨</button>
              </div>
              <div className="scard-bottom">
                <span className="scard-meta">
                  {item.sku}
                  {item.locations && item.locations.length > 0 && (
                    <> · <span className="scard-locs">{item.locations.map(l => `${l.location}:${l.qty}`).join('  ')}</span></>
                  )}
                  <> · <span style={{ color: '#999' }} title="Stock στο ecommerce (πληροφοριακό)">ecom: {item.ecom_stock}</span></>
                </span>
                <span className={`scard-qty${item.total_quantity === 0 ? ' zero' : ''}`}>
                  {item.total_quantity} {item.unit}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      {printSku && <PrintLabelModal sku={printSku} onClose={() => setPrintSku(null)} />}
    </div>
  )
}