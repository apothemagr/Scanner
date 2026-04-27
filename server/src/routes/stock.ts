import { Router } from 'express'
import { query, parseJsonCol } from '../db'
import { filterProducts, getDistinctBrands, getDistinctSuppliers, getProductsBySkus } from '../services/productService'

const router = Router()

// Λίστες brands/suppliers (από ecom)
router.get('/brands', async (_req, res) => {
  res.json(await getDistinctBrands())
})

router.get('/suppliers', async (_req, res) => {
  res.json(await getDistinctSuppliers())
})

// Φιλτραρισμένη λίστα με stock info
// query params: q (όνομα), sku, brand, supplier, qty (in_stock|low|zero|all)
router.get('/', async (req, res) => {
  const q = (req.query.q as string) || ''
  const sku = (req.query.sku as string) || ''
  const brand = (req.query.brand as string) || ''
  const supplier = (req.query.supplier as string) || ''
  const qtyFilter = (req.query.qty as string) || 'all'

  // Αν δεν υπάρχει κανένα φίλτρο εκτός του qty, επιστροφή κενής λίστας
  const hasProductFilter = !!(q || sku || brand || supplier)

  let products: { sku: string; name: string; brand: string | null; supplier: string | null; unit: string; ecom_stock: number; url: string | null }[] = []

  if (hasProductFilter) {
    const ecomResults = await filterProducts({ q, sku, brand, supplier, limit: 1000 })
    products = ecomResults.map(p => ({
      sku: p.sku, name: p.name, brand: p.brand, supplier: p.supplier, unit: p.unit,
      ecom_stock: p.ecom_stock, url: p.url,
    }))
  } else if (qtyFilter === 'in_stock' || qtyFilter === 'low' || qtyFilter === 'zero') {
    // Μόνο qty filter — ξεκίνα από local stock
    const stockRes = await query(
      `SELECT s.sku, CAST(SUM(s.quantity) AS INT) AS total
       FROM stock s WITH (NOLOCK)
       WHERE s.sku IS NOT NULL
       GROUP BY s.sku`
    )
    let skus = stockRes.rows.map(r => String(r.sku))
    if (qtyFilter === 'in_stock') {
      const map = new Map(stockRes.rows.map(r => [String(r.sku), Number(r.total)]))
      skus = skus.filter(s => (map.get(s) || 0) > 0)
    } else if (qtyFilter === 'low') {
      const map = new Map(stockRes.rows.map(r => [String(r.sku), Number(r.total)]))
      skus = skus.filter(s => { const t = map.get(s) || 0; return t >= 1 && t <= 5 })
    } else if (qtyFilter === 'zero') {
      const map = new Map(stockRes.rows.map(r => [String(r.sku), Number(r.total)]))
      skus = skus.filter(s => (map.get(s) || 0) === 0)
    }
    if (skus.length > 0) {
      const productMap = await getProductsBySkus(skus)
      products = Array.from(productMap.values()).map(p => ({
        sku: p.sku, name: p.name, brand: p.brand, supplier: p.supplier, unit: p.unit,
        ecom_stock: p.ecom_stock, url: p.url,
      }))
    }
  } else {
    // Κανένα φίλτρο
    return res.json([])
  }

  if (products.length === 0) return res.json([])

  // Merge με local stock — fetch όλο το stock και in-memory match
  const allStock = await query(
    `SELECT s.sku,
        CAST(COALESCE(SUM(s.quantity),0) AS INT) AS total_quantity,
        (SELECT l.code AS location, CAST(s2.quantity AS INT) AS qty
         FROM stock s2 WITH (NOLOCK)
         JOIN locations l WITH (NOLOCK) ON l.id = s2.location_id
         WHERE s2.sku = s.sku AND s2.quantity > 0
         FOR JSON PATH) AS locations
     FROM stock s WITH (NOLOCK)
     WHERE s.sku IS NOT NULL
     GROUP BY s.sku`
  )
  const stockMap = new Map<string, { total: number; locs: unknown }>()
  for (const r of allStock.rows) {
    stockMap.set(String(r.sku), { total: Number(r.total_quantity), locs: r.locations })
  }

  let merged = products.map(p => {
    const s = stockMap.get(p.sku)
    return {
      sku: p.sku,
      name: p.name,
      unit: p.unit,
      brand: p.brand,
      supplier: p.supplier,
      site_url: p.url,
      ecom_stock: p.ecom_stock,
      total_quantity: s?.total || 0,
      locations: s ? parseJsonCol(s.locs) : null,
    }
  })

  // Apply qty filter post-merge (όταν συνδυάζεται με άλλα φίλτρα)
  if (hasProductFilter && qtyFilter !== 'all') {
    if (qtyFilter === 'in_stock') merged = merged.filter(m => m.total_quantity > 0)
    else if (qtyFilter === 'low') merged = merged.filter(m => m.total_quantity >= 1 && m.total_quantity <= 5)
    else if (qtyFilter === 'zero') merged = merged.filter(m => m.total_quantity === 0)
  }

  return res.json(merged.sort((a, b) => (a.name || '').localeCompare(b.name || '')))
})

export default router
