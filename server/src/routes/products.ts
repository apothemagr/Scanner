import { Router } from 'express'
import { query, parseJsonCol } from '../db'
import { searchProducts, getProductByBarcodeOrSku, getProductBySku } from '../services/productService'

const router = Router()

// Σύνδεση custom barcode με υπάρχον SKU
router.post('/aliases', async (req, res) => {
  const barcode = String(req.body.barcode || '').trim()
  const sku = String(req.body.sku || '').trim()
  if (!barcode || !sku) return res.status(400).json({ error: 'Λείπουν barcode ή sku' })

  // Έλεγχος ότι το SKU υπάρχει στο ecom
  const p = await getProductBySku(sku)
  if (!p) return res.status(404).json({ error: 'Το SKU δεν βρέθηκε στο ecom' })

  try {
    await query(
      `IF EXISTS (SELECT 1 FROM barcode_aliases WHERE barcode = $1)
         UPDATE barcode_aliases SET sku = $2 WHERE barcode = $1
       ELSE
         INSERT INTO barcode_aliases (barcode, sku) VALUES ($1, $2)`,
      [barcode, sku]
    )
    return res.json({ success: true, barcode, sku, name: p.name })
  } catch (e) {
    return res.status(500).json({ error: String(e) })
  }
})

// Λίστα aliases
router.get('/aliases', async (_req, res) => {
  const r = await query(
    `SELECT id, barcode, sku, created_at FROM barcode_aliases WITH (NOLOCK) ORDER BY created_at DESC`
  )
  return res.json(r.rows)
})

// Διαγραφή alias
router.delete('/aliases/:id', async (req, res) => {
  await query(`DELETE FROM barcode_aliases WHERE id = $1`, [Number(req.params.id)])
  return res.json({ success: true })
})

// Αναζήτηση με barcode ή SKU (από ecom)
router.get('/lookup', async (req, res) => {
  const { code } = req.query
  if (!code) return res.status(400).json({ error: 'code required' })

  const product = await getProductByBarcodeOrSku(String(code))
  if (!product) return res.status(404).json({ error: 'Προϊόν δεν βρέθηκε' })

  // Stock από local DB
  const stockRes = await query(
    `SELECT (SELECT l.code AS location_code, l.id AS location_id,
              CAST(s.quantity AS INT) AS quantity
            FROM stock s WITH (NOLOCK)
            JOIN locations l WITH (NOLOCK) ON l.id = s.location_id
            WHERE s.sku = $1 AND s.quantity > 0
            FOR JSON PATH) AS stock_locations`,
    [product.sku]
  )
  return res.json({ ...product, stock_locations: parseJsonCol(stockRes.rows[0]?.stock_locations) })
})

// Αναζήτηση με όνομα / SKU / Supplier SKU (από ecom)
router.get('/search', async (req, res) => {
  const { q, field } = req.query
  if (!q || String(q).trim().length < 2) return res.json([])
  const f = field === 'sku' || field === 'supplier_sku' ? field : 'name'
  const products = await searchProducts(String(q), f as 'name' | 'sku' | 'supplier_sku')
  return res.json(products)
})

// Single product by sku
router.get('/:sku', async (req, res) => {
  const product = await getProductBySku(req.params.sku)
  if (!product) return res.status(404).json({ error: 'Δεν βρέθηκε' })
  return res.json(product)
})

export default router
