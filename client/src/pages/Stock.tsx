import { useState, useEffect } from 'react'

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
  total_quantity: number
  locations: { location: string; qty: number }[] | null
  site_url: string | null
}

export default function Stock() {
  const [items, setItems] = useState<StockItem[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API}/stock`)
      .then(r => r.json())
      .then(data => { setItems(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = items.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.sku.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="page">
      <h2>Απόθεμα Αποθήκης</h2>
      <input
        type="text"
        placeholder="Αναζήτηση προϊόντος..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="scan-input"
      />

      {loading ? <p>Φόρτωση...</p> : (
        <div className="items-list">
          {filtered.map(item => (
            <div
              key={item.id}
              className="stock-row"
              onClick={() => window.open(item.site_url || productUrl(item.sku, item.name), '_blank')}
              style={{ cursor: 'pointer' }}
            >
              <div className="item-info">
                <span className="item-name">{item.name}</span>
                <span className="sku">{item.sku}</span>
                {item.locations?.map(l => (
                  <span key={l.location} className="item-location">{l.location}: {l.qty} {item.unit}</span>
                ))}
              </div>
              <span className={`stock-qty ${item.total_quantity === 0 ? 'zero' : ''}`}>
                {item.total_quantity} {item.unit}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
