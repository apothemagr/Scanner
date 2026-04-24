import { Router } from 'express'
import { pool, query } from '../db'

const router = Router()

// Λίστα ανοιχτών pickings (grouped by type)
router.get('/pickings', async (req, res) => {
  const type = req.query.type as string | undefined
  const status = req.query.status as string | undefined
  const result = await query(
    `SELECT p.*,
      COUNT(pi.id) as item_count,
      COUNT(pi.id) FILTER (WHERE pi.picked_qty >= pi.required_qty) as picked_count,
      CASE
        WHEN COUNT(pi.id) > 0 AND COUNT(pi.id) FILTER (WHERE pi.picked_qty >= pi.required_qty) = COUNT(pi.id) THEN 'completed'
        WHEN COUNT(pi.id) FILTER (WHERE pi.picked_qty > 0) > 0 THEN 'in_progress'
        ELSE 'open'
      END as status
     FROM pickings p
     LEFT JOIN picking_items pi ON pi.picking_id = p.id
     WHERE ($1::text IS NULL OR p.order_type = $1)
     GROUP BY p.id
     HAVING
       $2::text IS NULL
       OR ($2 = 'open'        AND COUNT(pi.id) FILTER (WHERE pi.picked_qty > 0) = 0)
       OR ($2 = 'in_progress' AND COUNT(pi.id) FILTER (WHERE pi.picked_qty > 0) > 0
                              AND COUNT(pi.id) FILTER (WHERE pi.picked_qty >= pi.required_qty) < COUNT(pi.id))
       OR ($2 = 'completed'   AND COUNT(pi.id) > 0
                              AND COUNT(pi.id) FILTER (WHERE pi.picked_qty >= pi.required_qty) = COUNT(pi.id))
     ORDER BY p.invoice_date, p.entersoft_so_id`,
    [type || null, status || null]
  )
  return res.json(result.rows)
})

// Λεπτομέρειες picking με θέσεις
router.get('/pickings/:id', async (req, res) => {
  const picking = await query(`SELECT * FROM pickings WHERE id = $1`, [req.params.id])
  if (picking.rows.length === 0) return res.status(404).json({ error: 'Δεν βρέθηκε' })

  const items = await query(
    `SELECT pi.*, COALESCE(p.sku, pi.sku) as sku, p.name, p.barcode, p.barcode2, p.unit,
      l.code as location_code
     FROM picking_items pi
     LEFT JOIN products p ON p.id = pi.product_id
     LEFT JOIN locations l ON l.id = pi.location_id
     WHERE pi.picking_id = $1
     ORDER BY l.code NULLS LAST, p.name`,
    [req.params.id]
  )

  return res.json({ ...picking.rows[0], items: items.rows })
})

// Scan προϊόντος — αν η θέση είναι μοναδική, κάνει αυτόματα pick
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
    `SELECT pi.*, l.code as location_code
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
    // Επιστρέφει un-pick mode
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
    `SELECT s.location_id, l.code as location_code
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

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    await client.query(
      `UPDATE picking_items SET picked_qty = $1, scanned_at = NOW()
       WHERE picking_id = $2 AND product_id = $3`,
      [newQty, req.params.id, product_id]
    )

    // Αφαίρεση από stock
    await client.query(
      `UPDATE stock SET quantity = quantity - $1, updated_at = NOW()
       WHERE product_id = $2 AND location_id = $3`,
      [qty, product_id, loc.id]
    )

    await client.query(
      `INSERT INTO stock_movements (product_id, location_id, type, quantity, reference_type, reference_id)
       VALUES ($1,$2,'out',$3,'picking',$4)`,
      [product_id, loc.id, qty, req.params.id]
    )

    // Έλεγχος ολοκλήρωσης παραγγελίας
    const remaining = await client.query(
      `SELECT COUNT(*) as cnt FROM picking_items
       WHERE picking_id = $1 AND picked_qty < required_qty`,
      [req.params.id]
    )
    const isComplete = remaining.rows[0].cnt === '0'
    if (isComplete) {
      await client.query(
        `UPDATE pickings SET status='completed', completed_at=NOW() WHERE id=$1`,
        [req.params.id]
      )
    }

    await client.query('COMMIT')
    return res.json({
      success: true,
      product: item.name,
      picked: newQty,
      required: Number(item.required_qty),
      order_complete: isComplete,
    })
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
})

// Επαναφορά είδους στη θέση (un-pick)
router.post('/pickings/:id/unpick', async (req, res) => {
  const { product_id, location_code, quantity } = req.body

  const locRes = await query(`SELECT * FROM locations WHERE code = $1`, [location_code.toUpperCase()])
  if (locRes.rows.length === 0) {
    return res.status(404).json({ error: 'Θέση δεν βρέθηκε: ' + location_code })
  }
  const loc = locRes.rows[0]

  const pickItem = await query(
    `SELECT pi.*, p.name FROM picking_items pi JOIN products p ON p.id = pi.product_id
     WHERE pi.picking_id = $1 AND pi.product_id = $2`,
    [req.params.id, product_id]
  )
  if (pickItem.rows.length === 0) {
    return res.status(400).json({ error: 'Γραμμή picking δεν βρέθηκε' })
  }
  const item = pickItem.rows[0]
  const qty = Number(quantity) || Number(item.picked_qty)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    await client.query(
      `UPDATE picking_items SET picked_qty = picked_qty - $1, scanned_at = NULL, location_id = $2
       WHERE picking_id = $3 AND product_id = $4`,
      [qty, loc.id, req.params.id, product_id]
    )

    // Επαναφορά stock
    await client.query(
      `INSERT INTO stock (product_id, location_id, quantity, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (product_id, location_id)
       DO UPDATE SET quantity = stock.quantity + $3, updated_at = NOW()`,
      [product_id, loc.id, qty]
    )

    await client.query(
      `INSERT INTO stock_movements (product_id, location_id, type, quantity, reference_type, reference_id)
       VALUES ($1, $2, 'in', $3, 'unpick', $4)`,
      [product_id, loc.id, qty, req.params.id]
    )

    // Ανοίγουμε ξανά την παραγγελία αν ήταν completed
    await client.query(
      `UPDATE pickings SET status = 'open', completed_at = NULL WHERE id = $1`,
      [req.params.id]
    )

    await client.query('COMMIT')
    return res.json({ success: true, product: item.name, location: loc.code })
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
})

export default router
