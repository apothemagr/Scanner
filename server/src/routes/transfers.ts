import { Router } from 'express'
import { query, withTransaction } from '../db'
import { getProductByBarcodeOrSku } from '../services/productService'

const router = Router()

// Επικύρωση θέσης (πηγής ή προορισμού)
router.get('/location/:code', async (req, res) => {
  const r = await query(
    `SELECT id, code, type, description FROM locations WITH (NOLOCK)
     WHERE code = $1 AND is_active = 1`,
    [String(req.params.code).toUpperCase()]
  )
  if (r.rows.length === 0) return res.status(404).json({ error: 'Θέση δεν βρέθηκε' })
  return res.json(r.rows[0])
})

// Scan προϊόντος για μετακίνηση — επιστρέφει διαθέσιμη ποσότητα στην πηγή
router.post('/scan-product', async (req, res) => {
  const { barcode_or_sku, source_code } = req.body
  if (!barcode_or_sku || !source_code) return res.status(400).json({ error: 'Λείπουν πεδία' })

  const product = await getProductByBarcodeOrSku(barcode_or_sku)
  if (!product) return res.status(404).json({ error: 'Προϊόν δεν βρέθηκε: ' + barcode_or_sku })

  const lookupCode = String(source_code).toUpperCase()
  const stockRes = await query(
    `SELECT CAST(s.quantity AS INT) AS quantity
     FROM stock s WITH (NOLOCK)
     JOIN locations l WITH (NOLOCK) ON l.id = s.location_id
     WHERE s.sku = $1 AND l.code = $2`,
    [product.sku, lookupCode]
  )
  const available = stockRes.rows.length > 0 ? Number(stockRes.rows[0].quantity) : 0
  if (available <= 0) {
    // Δες αν υπάρχει σε άλλες θέσεις
    const otherRes = await query(
      `SELECT l.code, CAST(s.quantity AS INT) AS qty
       FROM stock s WITH (NOLOCK)
       JOIN locations l WITH (NOLOCK) ON l.id = s.location_id
       WHERE s.sku = $1 AND s.quantity > 0
       ORDER BY s.quantity DESC`,
      [product.sku]
    )
    const others = otherRes.rows.map(r => `${r.code} (${r.qty})`).join(', ')
    const msg = others
      ? `Το προϊόν δεν είναι στη θέση ${lookupCode}. Διαθέσιμο σε: ${others}`
      : `Δεν υπάρχει καθόλου stock για ${product.name}`
    return res.status(400).json({ error: msg })
  }

  return res.json({
    sku: product.sku,
    name: product.name,
    unit: product.unit,
    available,
  })
})

// Εκτέλεση μετακίνησης
router.post('/', async (req, res) => {
  const { sku, source_code, destination_code, quantity } = req.body
  const qty = Number(quantity)
  const userId = req.session.user?.id || null

  if (!sku || !source_code || !destination_code || !qty || qty <= 0) {
    return res.status(400).json({ error: 'Λείπουν ή λάθος πεδία' })
  }
  if (String(source_code).toUpperCase() === String(destination_code).toUpperCase()) {
    return res.status(400).json({ error: 'Πηγή και προορισμός είναι η ίδια θέση' })
  }

  const srcRes = await query(
    `SELECT id FROM locations WITH (NOLOCK) WHERE code = $1 AND is_active = 1`,
    [String(source_code).toUpperCase()]
  )
  if (srcRes.rows.length === 0) return res.status(404).json({ error: 'Θέση πηγής δεν βρέθηκε' })
  const sourceLocId = Number(srcRes.rows[0].id)

  const dstRes = await query(
    `SELECT id FROM locations WITH (NOLOCK) WHERE code = $1 AND is_active = 1`,
    [String(destination_code).toUpperCase()]
  )
  if (dstRes.rows.length === 0) return res.status(404).json({ error: 'Θέση προορισμού δεν βρέθηκε' })
  const destLocId = Number(dstRes.rows[0].id)

  const stockRes = await query(
    `SELECT CAST(quantity AS INT) AS qty FROM stock WITH (NOLOCK)
     WHERE sku = $1 AND location_id = $2`,
    [sku, sourceLocId]
  )
  const available = stockRes.rows.length > 0 ? Number(stockRes.rows[0].qty) : 0
  if (qty > available) {
    return res.status(400).json({ error: `Διαθέσιμα μόνο ${available} τεμ. στη θέση ${source_code}` })
  }

  await withTransaction(async (t) => {
    // Αφαίρεση από πηγή
    await t.query(
      `UPDATE stock SET quantity = quantity - $1, updated_at = GETDATE()
       WHERE sku = $2 AND location_id = $3`,
      [qty, sku, sourceLocId]
    )
    // Διαγραφή γραμμής αν έγινε 0 (προαιρετικό — αλλιώς μένει με 0)
    await t.query(
      `DELETE FROM stock WHERE sku = $1 AND location_id = $2 AND quantity <= 0`,
      [sku, sourceLocId]
    )
    // Προσθήκη στον προορισμό (upsert)
    await t.query(
      `MERGE stock AS tgt
       USING (SELECT $1 AS sku, $2 AS lid, $3 AS q) AS src
       ON tgt.sku = src.sku AND tgt.location_id = src.lid
       WHEN MATCHED THEN UPDATE SET quantity = tgt.quantity + src.q, updated_at = GETDATE()
       WHEN NOT MATCHED THEN INSERT (sku, location_id, quantity) VALUES (src.sku, src.lid, src.q);`,
      [sku, destLocId, qty]
    )
    // Movement log: out από πηγή, in σε προορισμό (reference_type='transfer')
    await t.query(
      `INSERT INTO stock_movements (sku, location_id, type, quantity, reference_type, reference_id, created_by)
       VALUES ($1, $2, 'out', $3, 'transfer', $4, $5)`,
      [sku, sourceLocId, qty, destLocId, userId]
    )
    await t.query(
      `INSERT INTO stock_movements (sku, location_id, type, quantity, reference_type, reference_id, created_by)
       VALUES ($1, $2, 'in', $3, 'transfer', $4, $5)`,
      [sku, destLocId, qty, sourceLocId, userId]
    )
  })

  return res.json({
    success: true,
    sku, quantity: qty,
    source: String(source_code).toUpperCase(),
    destination: String(destination_code).toUpperCase(),
  })
})

export default router
