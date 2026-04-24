import { Router } from 'express'
import { query, withTransaction } from '../db'

const router = Router()

// Λίστα παραλαβών με προαιρετικό φίλτρο κατάστασης
router.get('/receipts', async (req, res) => {
  const status = req.query.status as string | undefined
  const where = status ? `WHERE r.status = '${status}'` : `WHERE r.status IN ('open','closed','completed')`
  const result = await query(
    `SELECT r.id, r.entersoft_po_id, r.supplier_name, r.status, r.created_at, r.completed_at,
        COUNT(ri.id) AS item_count,
        SUM(CASE WHEN ri.location_id IS NOT NULL THEN 1 ELSE 0 END) AS placed_count
     FROM receipts r WITH (NOLOCK)
     LEFT JOIN receipt_items ri WITH (NOLOCK) ON ri.receipt_id = r.id
     ${where}
     GROUP BY r.id, r.entersoft_po_id, r.supplier_name, r.status, r.created_at, r.completed_at
     ORDER BY r.created_at DESC`
  )
  return res.json(result.rows)
})

// Λεπτομέρειες παραλαβής
router.get('/receipts/:id', async (req, res) => {
  const r = await query(`SELECT * FROM receipts WITH (NOLOCK) WHERE id = $1`, [req.params.id])
  if (!r.rows[0]) return res.status(404).json({ error: 'Δεν βρέθηκε' })

  const items = await query(
    `SELECT ri.id, ri.product_id, ri.received_qty, ri.location_id, ri.scanned_at, ri.placement_added,
        ISNULL(p.sku, '') AS sku, p.name, p.unit, l.code AS location_code
     FROM receipt_items ri WITH (NOLOCK)
     LEFT JOIN products p WITH (NOLOCK) ON p.id = ri.product_id
     LEFT JOIN locations l WITH (NOLOCK) ON l.id = ri.location_id
     WHERE ri.receipt_id = $1
     ORDER BY ri.scanned_at DESC`,
    [req.params.id]
  )
  return res.json({ ...r.rows[0], items: items.rows })
})

// Δημιουργία νέας παραλαβής
router.post('/receipts', async (req, res) => {
  const { entersoft_po_id, supplier_name } = req.body
  const r = await query(
    `INSERT INTO receipts (entersoft_po_id, supplier_name, status)
     OUTPUT INSERTED.*
     VALUES ($1, $2, 'open')`,
    [entersoft_po_id || null, supplier_name || null]
  )
  return res.status(201).json(r.rows[0])
})

// Scan προϊόντος (φάση καταχώρησης) — upsert στο receipt_items, χωρίς stock update
router.post('/receipts/:id/scan-product', async (req, res) => {
  const { barcode_or_sku } = req.body

  const prod = await query(
    `SELECT * FROM products WITH (NOLOCK) WHERE barcode = $1 OR barcode2 = $1 OR sku = $1`,
    [barcode_or_sku]
  )
  if (!prod.rows[0]) return res.status(404).json({ error: 'Προϊόν δεν βρέθηκε: ' + barcode_or_sku })
  const p = prod.rows[0]

  const existing = await query(
    `SELECT * FROM receipt_items WITH (NOLOCK) WHERE receipt_id = $1 AND product_id = $2`,
    [req.params.id, p.id]
  )

  let received_qty: number
  if (existing.rows[0]) {
    received_qty = Number(existing.rows[0].received_qty) + 1
    await query(
      `UPDATE receipt_items SET received_qty = $1, scanned_at = GETDATE()
       WHERE receipt_id = $2 AND product_id = $3`,
      [received_qty, req.params.id, p.id]
    )
  } else {
    received_qty = 1
    await query(
      `INSERT INTO receipt_items (receipt_id, product_id, received_qty, scanned_at)
       VALUES ($1, $2, 1, GETDATE())`,
      [req.params.id, p.id]
    )
  }

  return res.json({ product_id: p.id, name: p.name, sku: p.sku, unit: p.unit, received_qty })
})

// Κλείσιμο παραλαβής — οριστικοποίηση + TODO: αποστολή στο Ecom
router.post('/receipts/:id/close', async (_req, res) => {
  await query(
    `UPDATE receipts SET status='closed', closed_at=GETDATE() WHERE id=$1`,
    [_req.params.id]
  )

  // TODO: αποστολή παραστατικού στο Ecom (γράψιμο σε πίνακα APOTHEMA)

  return res.json({ success: true })
})

// Scan προϊόντος κατά την εναπόθεση — επιστρέφει ποσότητα από παραστατικό
router.post('/receipts/:id/place-product', async (req, res) => {
  const { barcode_or_sku } = req.body

  const prod = await query(
    `SELECT * FROM products WITH (NOLOCK) WHERE barcode = $1 OR barcode2 = $1 OR sku = $1`,
    [barcode_or_sku]
  )
  if (!prod.rows[0]) return res.status(404).json({ error: 'Προϊόν δεν βρέθηκε: ' + barcode_or_sku })
  const p = prod.rows[0]

  const item = await query(
    `SELECT ri.*, l.code AS location_code FROM receipt_items ri WITH (NOLOCK)
     LEFT JOIN locations l WITH (NOLOCK) ON l.id = ri.location_id
     WHERE ri.receipt_id = $1 AND ri.product_id = $2`,
    [req.params.id, p.id]
  )

  let received_qty = 1
  let is_new = false

  if (!item.rows[0]) {
    // Νέο προϊόν που δεν ήταν στο παραστατικό — προσθήκη με flag
    is_new = true
    await query(
      `INSERT INTO receipt_items (receipt_id, product_id, received_qty, scanned_at, placement_added)
       VALUES ($1, $2, 1, GETDATE(), 1)`,
      [req.params.id, p.id]
    )
  } else {
    received_qty = Number(item.rows[0].received_qty)
  }

  return res.json({
    product_id: p.id, name: p.name, sku: p.sku, unit: p.unit,
    received_qty, is_new,
    already_placed: item.rows[0]?.location_id != null,
    location_code: item.rows[0]?.location_code ?? null,
  })
})

// Scan θέσης κατά την εναπόθεση — ενημέρωση stock
router.post('/receipts/:id/place-location', async (req, res) => {
  const { product_id, location_code, quantity } = req.body

  const locRes = await query(
    `SELECT * FROM locations WITH (NOLOCK) WHERE code = $1`, [location_code.toUpperCase()]
  )
  if (!locRes.rows[0]) return res.status(404).json({ error: 'Θέση δεν βρέθηκε: ' + location_code })
  const loc = locRes.rows[0]

  const item = await query(
    `SELECT ri.*, p.name FROM receipt_items ri WITH (NOLOCK)
     JOIN products p WITH (NOLOCK) ON p.id = ri.product_id
     WHERE ri.receipt_id = $1 AND ri.product_id = $2`,
    [req.params.id, product_id]
  )
  if (!item.rows[0]) return res.status(400).json({ error: 'Προϊόν δεν βρέθηκε στην παραλαβή' })

  const qty = Number(quantity) || Number(item.rows[0].received_qty)

  await withTransaction(async (t) => {
    await t.query(
      `UPDATE receipt_items SET location_id = $1, scanned_at = GETDATE()
       WHERE receipt_id = $2 AND product_id = $3`,
      [loc.id, req.params.id, product_id]
    )
    await t.query(
      `MERGE stock AS tgt
       USING (SELECT $1 AS pid, $2 AS lid, $3 AS q) AS src
       ON tgt.product_id = src.pid AND tgt.location_id = src.lid
       WHEN MATCHED THEN UPDATE SET quantity = tgt.quantity + src.q, updated_at = GETDATE()
       WHEN NOT MATCHED THEN INSERT (product_id, location_id, quantity) VALUES (src.pid, src.lid, src.q);`,
      [product_id, loc.id, qty]
    )
    await t.query(
      `INSERT INTO stock_movements (product_id, location_id, type, quantity, reference_type, reference_id)
       VALUES ($1, $2, 'in', $3, 'receipt', $4)`,
      [product_id, loc.id, qty, req.params.id]
    )

    // Έλεγχος αν όλα τοποθετήθηκαν
    const remaining = await t.query(
      `SELECT COUNT(*) AS cnt FROM receipt_items
       WHERE receipt_id = $1 AND location_id IS NULL`,
      [req.params.id]
    )
    if (Number(remaining.rows[0].cnt) === 0) {
      await t.query(
        `UPDATE receipts SET status='completed', completed_at=GETDATE() WHERE id=$1`,
        [req.params.id]
      )
    }
  })

  return res.json({ success: true, product: item.rows[0].name, location: loc.code })
})

export default router
