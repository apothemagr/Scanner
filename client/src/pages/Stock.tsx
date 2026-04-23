import { useState, useEffect } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

interface StockItem {
  id: number
  sku: string
  name: string
  unit: string
  total_quantity: number
  locations: { location: string; qty: number }[] | null
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
            <div key={item.id} className="stock-row">
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
