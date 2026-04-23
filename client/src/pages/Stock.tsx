import { useState, useEffect, useMemo, useRef } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

function toSlug(txt: string): string {
  let s = txt
  s = s.replace(/[αΑ][ιίΙΊ]/g, 'e')
  s = s.replace(/[οΟΕε][ιίΙΊ]/g, 'i')
  s = s.replace(/[αΑ][υύΥΎ](?=[θΘκΚξΞπΠσςΣτΤφΦχΧψΨ]|\s|$)/g, 'af')
  s = s.replace(/[αΑ][υύΥΎ]/g, 'av')
  s = s.replace(/[εΕ][υύΥΎ](?=[θΘκΚξΞπΠσςΣτΤφΦχΧψΨ]|\s|$)/g, 'ef')
  s = s.replace(/[εΕ][υύΥΎ]/g, 'ev')
  s = s.replace(/[οΟ][υύΥΎ]/g, 'ou')
  s = s.replace(/(^|\s)[μΜ][πΠ]/g, '$1b')
  s = s.replace(/[μΜ][πΠ](\s|$)/g, 'b$1')
  s = s.replace(/[μΜ][πΠ]/g, 'mp')
  s = s.replace(/[νΝ][τΤ]/g, 'nt')
  s = s.replace(/[τΤ][σΣ]/g, 'ts')
  s = s.replace(/[τΤ][ζΖ]/g, 'tz')
  s = s.replace(/[γΓ][γΓ]/g, 'ng')
  s = s.replace(/[γΓ][κΚ]/g, 'gk')
  s = s.replace(/[ηΗ][υΥ](?=[θΘκΚξΞπΠσςΣτΤφΦχΧψΨ]|\s|$)/g, 'if')
  s = s.replace(/[ηΗ][υΥ]/g, 'iu')
  s = s.replace(/[θΘ]/g, 'th')
  s = s.replace(/[χΧ]/g, 'ch')
  s = s.replace(/[ψΨ]/g, 'ps')
  s = s.replace(/[αάΑΆ]/g, 'a')
  s = s.replace(/[βΒ]/g, 'v')
  s = s.replace(/[γΓ]/g, 'g')
  s = s.replace(/[δΔ]/g, 'd')
  s = s.replace(/[εέΕΈ]/g, 'e')
  s = s.replace(/[ζΖ]/g, 'z')
  s = s.replace(/[ηήΗΉ]/g, 'i')
  s = s.replace(/[ιίϊΙΊΪ]/g, 'i')
  s = s.replace(/[κΚ]/g, 'k')
  s = s.replace(/[λΛ]/g, 'l')
  s = s.replace(/[μΜ]/g, 'm')
  s = s.replace(/[νΝ]/g, 'n')
  s = s.replace(/[ξΞ]/g, 'x')
  s = s.replace(/[οόΟΌ]/g, 'o')
  s = s.replace(/[πΠ]/g, 'p')
  s = s.replace(/[ρΡ]/g, 'r')
  s = s.replace(/[σςΣ]/g, 's')
  s = s.replace(/[τΤ]/g, 't')
  s = s.replace(/[υύϋΥΎΫ]/g, 'i')
  s = s.replace(/[φΦ]/g, 'f')
  s = s.replace(/[ωώΩΏ]/g, 'o')
  s = s.replace(/€/g, 'eu')
  s = s.replace(/&/g, 'n')
  s = s.replace(/\s/g, '-')
  s = s.toLowerCase()
  s = s.replace(/[^a-z0-9]/g, '-')
  s = s.replace(/-{2,}/g, '-')
  s = s.replace(/^-+|-+$/g, '')
  return s
}

function productUrl(sku: string, name: string): string {
  return `https://www.apothema.gr/${toSlug(name)}-${sku}p`
}

interface StockItem {
  id: number
  sku: string
  name: string
  unit: string
  brand: string | null
  supplier: string | null
  total_quantity: number
  locations: { location: string; qty: number }[] | null
  site_url: string | null
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

export default function Stock() {
  const [items, setItems] = useState<StockItem[]>([])
  const [search, setSearch] = useState('')
  const [brand, setBrand] = useState('')
  const [supplier, setSupplier] = useState('')
  const [qtyFilter, setQtyFilter] = useState<QtyFilter>('all')
  const [loading, setLoading] = useState(true)
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

  useEffect(() => {
    fetch(`${API}/stock`)
      .then(r => r.json())
      .then(data => { setItems(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const brands = useMemo(() => {
    const set = new Set<string>()
    items.forEach(i => { if (i.brand) set.add(i.brand) })
    return Array.from(set).sort()
  }, [items])

  const suppliers = useMemo(() => {
    const set = new Set<string>()
    items.forEach(i => { if (i.supplier) set.add(i.supplier) })
    return Array.from(set).sort()
  }, [items])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(i => {
      if (q && !i.name.toLowerCase().includes(q) && !i.sku.toLowerCase().includes(q)) return false
      if (brand && i.brand !== brand) return false
      if (supplier && i.supplier !== supplier) return false
      if (qtyFilter === 'in_stock' && i.total_quantity <= 0) return false
      if (qtyFilter === 'low' && (i.total_quantity < 1 || i.total_quantity > 5)) return false
      if (qtyFilter === 'zero' && i.total_quantity !== 0) return false
      return true
    })
  }, [items, search, brand, supplier, qtyFilter])

  const hasActiveFilters = !!(brand || supplier || qtyFilter !== 'all' || search)

  const clearFilters = () => {
    setSearch('')
    setBrand('')
    setSupplier('')
    setQtyFilter('all')
  }

  return (
    <div className="page">
      <div className={`stock-filters-header${headerVisible ? '' : ' hidden'}`}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Αναζήτηση προϊόντος..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="scan-input"
            style={{ paddingRight: search ? 36 : undefined }}
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

      {loading ? <p>Φόρτωση...</p> : (
        <div className="scard-list" ref={listRef}>
          {filtered.map(item => (
            <div
              key={item.id}
              className="scard"
              onClick={() => window.open(item.site_url || productUrl(item.sku, item.name), '_blank')}
            >
              <div className="scard-name">
                {item.brand ? <span className="scard-brand">{item.brand} </span> : null}
                {item.name}
              </div>
              <div className="scard-bottom">
                <span className="scard-meta">
                  {item.sku}
                  {item.locations && item.locations.length > 0 && (
                    <> · <span className="scard-locs">{item.locations.map(l => `${l.location}:${l.qty}`).join('  ')}</span></>
                  )}
                </span>
                <span className={`scard-qty${item.total_quantity === 0 ? ' zero' : ''}`}>
                  {item.total_quantity} {item.unit}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}