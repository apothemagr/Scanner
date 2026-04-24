import { Router } from 'express'
import { query, parseJsonCol } from '../db'

const router = Router()

// Αναζήτηση με barcode ή SKU
router.get('/lookup', async (req, res) => {
  const { code } = req.query
  if (!code) return res.status(400).json({ error: 'code required' })

  const result = await query(
    `SELECT p.id, p.sku, p.name, p.barcode, p.barcode2, p.unit,
        p.needs_label, p.brand, p.supplier, p.site_url,
        (SELECT l.code AS location_code, l.id AS location_id,
                CAST(s2.quantity AS INT) AS quantity
         FROM stock s2
         JOIN locations l ON l.id = s2.location_id
         WHERE s2.product_id = p.id AND s2.quantity > 0
         FOR JSON PATH) AS stock_locations
     FROM products p
     WHERE p.barcode = $1 OR p.barcode2 = $1 OR p.sku = $1`,
    [code]
  )

  if (result.rows.length === 0) return res.status(404).json({ error: 'Προϊόν δεν βρέθηκε' })
  const row = result.rows[0]
  return res.json({ ...row, stock_locations: parseJsonCol(row.stock_locations) })
})

// Αναζήτηση με όνομα
router.get('/search', async (req, res) => {
  const { q } = req.query
  if (!q || String(q).trim().length < 2) return res.json([])
  const result = await query(
    `SELECT TOP 10 id, sku, name FROM products WHERE name LIKE $1 ORDER BY name`,
    [`%${String(q).trim()}%`]
  )
  return res.json(result.rows)
})

// Λίστα όλων
router.get('/', async (_req, res) => {
  const result = await query(`SELECT * FROM products ORDER BY name`)
  return res.json(result.rows)
})

// Δημιουργία
router.post('/', async (req, res) => {
  const { sku, name, barcode, unit, needs_label, entersoft_id } = req.body
  const result = await query(
    `INSERT INTO products (sku, name, barcode, unit, needs_label, entersoft_id)
     OUTPUT INSERTED.*
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [sku, name, barcode || null, unit || 'τεμ', needs_label ? 1 : 0, entersoft_id || null]
  )
  return res.status(201).json(result.rows[0])
})

// Ενημέρωση
router.put('/:id', async (req, res) => {
  const { name, barcode, unit, needs_label } = req.body
  const result = await query(
    `UPDATE products
     SET name=$1, barcode=$2, unit=$3, needs_label=$4, updated_at=GETDATE()
     OUTPUT INSERTED.*
     WHERE id=$5`,
    [name, barcode || null, unit, needs_label ? 1 : 0, req.params.id]
  )
  if (result.rows.length === 0) return res.status(404).json({ error: 'Δεν βρέθηκε' })
  return res.json(result.rows[0])
})

export default router
