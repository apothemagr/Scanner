import { Router } from 'express'
import { query, withTransaction } from '../db'

const router = Router()

// Λίστα pickings με φίλτρα
router.get('/pickings', async (req, res) => {
  const type = req.query.type as string | undefined
  const status = req.query.status as string | undefined
  const result = await query(
    `SELECT p.id, p.entersoft_so_id, p.customer_name, p.transporter,
        p.order_type, p.voucher_qty, p.invoice_date, p.print_date,
        p.created_at, p.completed_at,
        COUNT(pi.id) AS item_count,
        SUM(CASE WHEN pi.picked_qty >= pi.required_qty THEN 1 ELSE 0 END) AS picked_count,
        CASE
          WHEN COUNT(pi.id) > 0
           AND SUM(CASE WHEN pi.picked_qty >= pi.required_qty THEN 1 ELSE 0 END) = COUNT(pi.id)
            THEN 'completed'
          WHEN SUM(CASE WHEN pi.picked_qty > 0 THEN 1 ELSE 0 END) > 0
            THEN 'in_progress'
          ELSE 'open'
        END AS status
     FROM pickings p
     LEFT JOIN picking_items pi ON pi.picking_id = p.id
     WHERE ($1 IS NULL OR p.order_type = $1)
     GROUP BY p.id, p.entersoft_so_id, p.customer_name, p.transporter,
              p.order_type, p.voucher_qty, p.invoice_date, p.print_date,
              p.created_at, p.completed_at
     HAVING
       $2 IS NULL
       OR ($2 = 'open'        AND SUM(CASE WHEN pi.picked_qty > 0 THEN 1 ELSE 0 END) = 0)
       OR ($2 = 'in_progress' AND SUM(CASE WHEN pi.picked_qty > 0 THEN 1 ELSE 0 END) > 0
                              AND SUM(CASE WHEN pi.picked_qty >= pi.required_qty THEN 1 ELSE 0 END) < COUNT(pi.id))
       OR ($2 = 'completed'   AND COUNT(pi.id) > 0
                              AND SUM(CASE WHEN pi.picked_qty >= pi.required_qty THEN 1 ELSE 0 END) = COUNT(pi.id))
     ORDER BY p.invoice_date, p.entersoft_so_id`,
    [type || null, status || null]
  )
  return res.json(result.rows)
})

// Λεπτομέρειες picking
router.get('/pickings/:id', async (req, res) => {
  const picking = await query(`SELECT * FROM pickings WHERE id = $1`, [req.params.id])
  if (picking.rows.length === 0) return res.status(404).json({ error: 'Δεν βρέθηκε' })

  const items = await query(
    `SELECT pi.id, pi.picking_id, pi.product_id, pi.location_id,
        pi.required_qty, pi.picked_qty, pi.scanned_at,
        COALESCE(p.sku, pi.sku) AS sku,
        p.name, p.barcode, p.barcode2, p.unit,
        l.code AS location_code
     FROM picking_items pi
     LEFT JOIN products p ON p.id = pi.product_id
     LEFT JOIN locations l ON l.id = pi.location_id
     WHERE pi.picking_id = $1
     ORDER BY CASE WHEN l.code IS NULL THEN 1 ELSE 0 END, l.code, p.name`,
    [req.params.id]
  )

  return res.json({ ...picking.rows[0], items: items.rows })
})

// Scan προϊόντος
router.post('/pickings/:id/scan-product', async (req, res) => {
  const { barcode_or_sku } = req.body

  const product = await query(
    `SELECT * FROM products WHERE barcode = $1 OR barcode2 = $1 OR sku = $1`,
    [barcode_or_sku]
  )
  if (product.rows.length === 0) {
    return res.status(404).json({ error: 'Προϊόν δεν βρέθηκε: ' + barcode_or_sku })
  }
  const prod = product.rows[0]

  const pickItem = await query(
    `SELECT pi.*, l.code AS location_code
     FROM picking_items pi
     LEFT JOIN locations l ON l.id = pi.location_id
     WHERE pi.picking_id = $1 AND pi.product_id = $2`,
    [req.params.id, prod.id]
  )
  if (pickItem.rows.length === 0) {
    return res.status(400).json({ error: 'Το προϊόν δεν ανήκει σε αυτή την παραγγελία', product: prod.name })
  }

  const item = pickItem.rows[0]
  if (Number(item.picked_qty) >= Number(item.required_qty)) {
    return res.json({
      mode: 'unpick',
      product_id: prod.id,
      name: prod.name,
      sku: prod.sku,
      unit: prod.unit,
      location_code: item.location_code,
      location_id: item.location_id,
      picked_qty: Number(item.picked_qty),
    })
  }

  const qty = Number(item.required_qty) - Number(item.picked_qty)
  const stockLocs = await query(
    `SELECT s.location_id, l.code AS location_code
     FROM stock s JOIN locations l ON l.id = s.location_id
     WHERE s.product_id = $1 AND s.quantity > 0`,
    [prod.id]
  )

  const effectiveLocationId = item.location_id ?? (stockLocs.rows.length === 1 ? stockLocs.rows[0].location_id : null)
  const effectiveLocationCode = item.location_code ?? (stockLocs.rows.length === 1 ? stockLocs.rows[0].location_code : null)

  return res.json({
    product_id: prod.id,
    name: prod.name,
    sku: prod.sku,
    unit: prod.unit,
    location_code: effectiveLocationCode,
    location_id: effectiveLocationId,
    required_qty: Number(item.required_qty),
    picked_qty: Number(item.picked_qty),
    qty,
  })
})

// Scan θέσης — επιβεβαίωση και αφαίρεση από stock
router.post('/pickings/:id/scan-location', async (req, res) => {
  const { location_code, product_id, quantity } = req.body

  const locRes = await query(`SELECT * FROM locations WHERE code = $1`, [location_code.toUpperCase()])
  if (locRes.rows.length === 0) {
    return res.status(404).json({ error: 'Θέση δεν βρέθηκε: ' + location_code })
  }
  const loc = locRes.rows[0]

  const pickItem = await query(
    `SELECT pi.*, p.name FROM picking_items pi
     JOIN products p ON p.id = pi.product_id
     WHERE pi.picking_id = $1 AND pi.product_id = $2`,
    [req.params.id, product_id]
  )
  if (pickItem.rows.length === 0) {
    return res.status(400).json({ error: 'Γραμμή picking δεν βρέθηκε' })
  }
  const item = pickItem.rows[0]
  const qty = Number(quantity) || Number(item.required_qty) - Number(item.picked_qty)
  const newQty = Number(item.picked_qty) + qty

  if (newQty > Number(item.required_qty)) {
    return res.status(400).json({ error: 'Ποσότητα υπερβαίνει την παραγγελία' })
  }

  const result = await withTransaction(async (t) => {
    await t.query(
      `UPDATE picking_items SET picked_qty = $1, scanned_at = GETDATE()
       WHERE picking_id = $2 AND product_id = $3`,
      [newQty, req.params.id, product_id]
    )
    await t.query(
      `UPDATE stock SET quantity = quantity - $1, updated_at = GETDATE()
       WHERE product_id = $2 AND location_id = $3`,
      [qty, product_id, loc.id]
    )
    await t.query(
      `INSERT INTO stock_movements (product_id, location_id, type, quantity, reference_type, reference_id)
       VALUES ($1, $2, 'out', $3, 'picking', $4)`,
      [product_id, loc.id, qty, req.params.id]
    )
    const remaining = await t.query(
      `SELECT COUNT(*) AS cnt FROM picking_items
       WHERE picking_id = $1 AND picked_qty < required_qty`,
      [req.params.id]
    )
    const isComplete = Number(remaining.rows[0].cnt) === 0
    if (isComplete) {
      await t.query(
        `UPDATE pickings SET status='completed', completed_at=GETDATE() WHERE id=$1`,
        [req.params.id]
      )
    }
    return { isComplete }
  })

  return res.json({
    success: true,
    product: item.name,
    picked: newQty,
    required: Number(item.required_qty),
    order_complete: result.isComplete,
  })
})

// Επαναφορά είδους (un-pick)
router.post('/pickings/:id/unpick', async (req, res) => {
  const { product_id, location_code, quantity } = req.body

  const locRes = await query(`SELECT * FROM locations WHERE code = $1`, [location_code.toUpperCase()])
  if (locRes.rows.length === 0) {
    return res.status(404).json({ error: 'Θέση δεν βρέθηκε: ' + location_code })
  }
  const loc = locRes.rows[0]

  const pickItem = await query(
    `SELECT pi.*, p.name FROM picking_items pi
     JOIN products p ON p.id = pi.product_id
     WHERE pi.picking_id = $1 AND pi.product_id = $2`,
    [req.params.id, product_id]
  )
  if (pickItem.rows.length === 0) {
    return res.status(400).json({ error: 'Γραμμή picking δεν βρέθηκε' })
  }
  const item = pickItem.rows[0]
  const qty = Number(quantity) || Number(item.picked_qty)

  await withTransaction(async (t) => {
    await t.query(
      `UPDATE picking_items
       SET picked_qty = picked_qty - $1, scanned_at = NULL, location_id = $2
       WHERE picking_id = $3 AND product_id = $4`,
      [qty, loc.id, req.params.id, product_id]
    )
    // Επαναφορά stock με MERGE
    await t.query(
      `MERGE stock AS tgt
       USING (SELECT $1 AS product_id, $2 AS location_id, $3 AS qty) AS src
       ON tgt.product_id = src.product_id AND tgt.location_id = src.location_id
       WHEN MATCHED THEN
         UPDATE SET quantity = tgt.quantity + src.qty, updated_at = GETDATE()
       WHEN NOT MATCHED THEN
         INSERT (product_id, location_id, quantity)
         VALUES (src.product_id, src.location_id, src.qty);`,
      [product_id, loc.id, qty]
    )
    await t.query(
      `INSERT INTO stock_movements (product_id, location_id, type, quantity, reference_type, reference_id)
       VALUES ($1, $2, 'in', $3, 'unpick', $4)`,
      [product_id, loc.id, qty, req.params.id]
    )
    await t.query(
      `UPDATE pickings SET status = 'open', completed_at = NULL WHERE id = $1`,
      [req.params.id]
    )
  })

  return res.json({ success: true, product: item.name, location: loc.code })
})

export default router
