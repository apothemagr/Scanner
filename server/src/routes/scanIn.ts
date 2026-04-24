import { Router } from 'express'
import { query, withTransaction } from '../db'

const router = Router()

// Δημιουργία νέας παραλαβής
router.post('/receipts', async (req, res) => {
  const { entersoft_po_id, supplier_name, created_by, items } = req.body
  const receipt = await withTransaction(async (t) => {
    const r = await t.query(
      `INSERT INTO receipts (entersoft_po_id, supplier_name, created_by)
       OUTPUT INSERTED.*
       VALUES ($1, $2, $3)`,
      [entersoft_po_id || null, supplier_name, created_by]
    )
    const receiptId = r.rows[0].id
    if (items?.length) {
      for (const item of items) {
        await t.query(
          `INSERT INTO receipt_items (receipt_id, product_id, expected_qty)
           VALUES ($1, $2, $3)`,
          [receiptId, item.product_id, item.expected_qty]
        )
      }
    }
    return r.rows[0]
  })
  return res.status(201).json(receipt)
})

// Scan ενός προϊόντος κατά την παραλαβή
router.post('/receipts/:id/scan', async (req, res) => {
  const { product_id, location_id, quantity } = req.body
  await withTransaction(async (t) => {
    await t.query(
      `UPDATE receipt_items
       SET received_qty = received_qty + $1, location_id = $2, scanned_at = GETDATE()
       WHERE receipt_id = $3 AND product_id = $4`,
      [quantity, location_id, req.params.id, product_id]
    )
    await t.query(
      `MERGE stock AS tgt
       USING (SELECT $1 AS product_id, $2 AS location_id, $3 AS qty) AS src
       ON tgt.product_id = src.product_id AND tgt.location_id = src.location_id
       WHEN MATCHED THEN
         UPDATE SET quantity = tgt.quantity + src.qty, updated_at = GETDATE()
       WHEN NOT MATCHED THEN
         INSERT (product_id, location_id, quantity)
         VALUES (src.product_id, src.location_id, src.qty);`,
      [product_id, location_id, quantity]
    )
    await t.query(
      `INSERT INTO stock_movements (product_id, location_id, type, quantity, reference_type, reference_id)
       VALUES ($1, $2, 'in', $3, 'receipt', $4)`,
      [product_id, location_id, quantity, req.params.id]
    )
  })
  return res.json({ success: true })
})

// Ολοκλήρωση παραλαβής
router.post('/receipts/:id/complete', async (req, res) => {
  await query(
    `UPDATE receipts SET status='completed', completed_at=GETDATE() WHERE id=$1`,
    [req.params.id]
  )
  return res.json({ success: true })
})

// Γρήγορη παραλαβή
router.post('/receipts/quick', async (req, res) => {
  const { product_id, location_id, quantity } = req.body
  if (!product_id || !location_id || !quantity) {
    return res.status(400).json({ error: 'product_id, location_id, quantity required' })
  }
  await withTransaction(async (t) => {
    await t.query(
      `MERGE stock AS tgt
       USING (SELECT $1 AS product_id, $2 AS location_id, $3 AS qty) AS src
       ON tgt.product_id = src.product_id AND tgt.location_id = src.location_id
       WHEN MATCHED THEN
         UPDATE SET quantity = tgt.quantity + src.qty, updated_at = GETDATE()
       WHEN NOT MATCHED THEN
         INSERT (product_id, location_id, quantity)
         VALUES (src.product_id, src.location_id, src.qty);`,
      [product_id, location_id, quantity]
    )
    await t.query(
      `INSERT INTO stock_movements (product_id, location_id, type, quantity, reference_type)
       VALUES ($1, $2, 'in', $3, 'quick_receipt')`,
      [product_id, location_id, quantity]
    )
  })
  return res.json({ success: true })
})

// Λίστα ανοιχτών παραλαβών
router.get('/receipts', async (_req, res) => {
  const result = await query(
    `SELECT r.id, r.entersoft_po_id, r.supplier_name, r.created_by,
        r.status, r.created_at, r.completed_at,
        COUNT(ri.id) AS item_count,
        SUM(CASE WHEN ri.scanned_at IS NOT NULL THEN 1 ELSE 0 END) AS scanned_count
     FROM receipts r WITH (NOLOCK)
     LEFT JOIN receipt_items ri WITH (NOLOCK) ON ri.receipt_id = r.id
     WHERE r.status = 'open'
     GROUP BY r.id, r.entersoft_po_id, r.supplier_name, r.created_by,
              r.status, r.created_at, r.completed_at
     ORDER BY r.created_at DESC`
  )
  return res.json(result.rows)
})

export default router
