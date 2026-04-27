import { Router } from 'express'
import { query, withTransaction } from '../db'
import { getProductByBarcodeOrSku, getProductsBySkus } from '../services/productService'

const router = Router()

// Λίστα pickings με φίλτρα
router.get('/pickings', async (req, res) => {
  const type = req.query.type as string | undefined
  const status = req.query.status as string | undefined
  const result = await query(
    `SELECT p.id, p.entersoft_so_id, p.customer_name, p.web_order_id, p.transporter,
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
     FROM pickings p WITH (NOLOCK)
     LEFT JOIN picking_items pi WITH (NOLOCK) ON pi.picking_id = p.id
     WHERE ($1 IS NULL OR p.order_type = $1)
     GROUP BY p.id, p.entersoft_so_id, p.customer_name, p.web_order_id, p.transporter,
              p.order_type, p.voucher_qty, p.invoice_date, p.print_date,
              p.created_at, p.completed_at
     HAVING
       CAST(p.invoice_date AS DATE) = CAST(GETDATE() AS DATE)
       AND (
         $2 IS NULL
         OR ($2 = 'open'        AND SUM(CASE WHEN pi.picked_qty > 0 THEN 1 ELSE 0 END) = 0)
         OR ($2 = 'in_progress' AND SUM(CASE WHEN pi.picked_qty > 0 THEN 1 ELSE 0 END) > 0
                                AND SUM(CASE WHEN pi.picked_qty >= pi.required_qty THEN 1 ELSE 0 END) < COUNT(pi.id))
         OR ($2 = 'completed'   AND COUNT(pi.id) > 0
                                AND SUM(CASE WHEN pi.picked_qty >= pi.required_qty THEN 1 ELSE 0 END) = COUNT(pi.id))
       )
     ORDER BY p.invoice_date, p.entersoft_so_id`,
    [type || null, status || null]
  )
  return res.json(result.rows)
})

// Λεπτομέρειες picking
router.get('/pickings/:id', async (req, res) => {
  const picking = await query(
    `SELECT * FROM pickings WITH (NOLOCK) WHERE id = $1`, [req.params.id]
  )
  if (picking.rows.length === 0) return res.status(404).json({ error: 'Δεν βρέθηκε' })

  const items = await query(
    `SELECT pi.id, pi.picking_id, pi.sku, pi.location_id,
        pi.required_qty, pi.picked_qty, pi.scanned_at,
        l.code AS location_code,
        CAST(COALESCE((
          SELECT SUM(s.quantity) FROM stock s WITH (NOLOCK)
          WHERE s.sku = pi.sku
        ), 0) AS INT) AS total_stock
     FROM picking_items pi WITH (NOLOCK)
     LEFT JOIN locations l WITH (NOLOCK) ON l.id = pi.location_id
     WHERE pi.picking_id = $1`,
    [req.params.id]
  )

  // Enrich με product info από ecom
  const skus = items.rows.map(r => String(r.sku || '')).filter(Boolean)
  const productMap = await getProductsBySkus(skus)

  const enriched = items.rows.map(r => {
    const p = productMap.get(String(r.sku))
    return {
      ...r,
      name: p?.name || `[${r.sku}]`,
      barcode: p?.barcode || null,
      barcode2: null,
      unit: p?.unit || 'τεμ.',
      supplier_sku: p?.supplier_sku || null,
    }
  }).sort((a, b) => {
    // null locations last, then by location_code, then by name
    const la = a.location_code, lb = b.location_code
    if (la == null && lb != null) return 1
    if (la != null && lb == null) return -1
    if (la != null && lb != null) {
      const c = String(la).localeCompare(String(lb))
      if (c !== 0) return c
    }
    return String(a.name || '').localeCompare(String(b.name || ''))
  })

  return res.json({ ...picking.rows[0], items: enriched })
})

// Scan προϊόντος
router.post('/pickings/:id/scan-product', async (req, res) => {
  const { barcode_or_sku } = req.body

  const product = await getProductByBarcodeOrSku(barcode_or_sku)
  if (!product) {
    return res.status(404).json({ error: 'Προϊόν δεν βρέθηκε: ' + barcode_or_sku })
  }

  const pickItem = await query(
    `SELECT pi.*, l.code AS location_code
     FROM picking_items pi WITH (NOLOCK)
     LEFT JOIN locations l WITH (NOLOCK) ON l.id = pi.location_id
     WHERE pi.picking_id = $1 AND pi.sku = $2`,
    [req.params.id, product.sku]
  )
  if (pickItem.rows.length === 0) {
    return res.status(400).json({ error: 'Το προϊόν δεν ανήκει σε αυτή την παραγγελία', product: product.name })
  }

  const item = pickItem.rows[0]
  if (Number(item.picked_qty) >= Number(item.required_qty)) {
    return res.json({
      mode: 'unpick',
      sku: product.sku,
      name: product.name,
      unit: product.unit,
      location_code: item.location_code,
      location_id: item.location_id,
      picked_qty: Number(item.picked_qty),
    })
  }

  const qty = Number(item.required_qty) - Number(item.picked_qty)
  const stockLocs = await query(
    `SELECT s.location_id, l.code AS location_code
     FROM stock s WITH (NOLOCK)
     JOIN locations l WITH (NOLOCK) ON l.id = s.location_id
     WHERE s.sku = $1 AND s.quantity > 0`,
    [product.sku]
  )

  let effectiveLocationId = item.location_id ?? (stockLocs.rows.length === 1 ? stockLocs.rows[0].location_id : null)
  let effectiveLocationCode = item.location_code ?? (stockLocs.rows.length === 1 ? stockLocs.rows[0].location_code : null)

  if (effectiveLocationId && !effectiveLocationCode) {
    const locLookup = await query(
      `SELECT code FROM locations WITH (NOLOCK) WHERE id = $1`, [effectiveLocationId]
    )
    effectiveLocationCode = locLookup.rows[0]?.code ?? null
  }

  const single_location = stockLocs.rows.length === 1 || effectiveLocationCode != null

  return res.json({
    sku: product.sku,
    name: product.name,
    unit: product.unit,
    location_code: effectiveLocationCode,
    location_id: effectiveLocationId,
    required_qty: Number(item.required_qty),
    picked_qty: Number(item.picked_qty),
    qty,
    single_location,
  })
})

// Scan θέσης
router.post('/pickings/:id/scan-location', async (req, res) => {
  const { location_code, sku, quantity } = req.body
  const userId = req.session.user?.id || null

  const locRes = await query(
    `SELECT * FROM locations WITH (NOLOCK) WHERE code = $1`, [String(location_code).toUpperCase()]
  )
  if (locRes.rows.length === 0) {
    return res.status(404).json({ error: 'Θέση δεν βρέθηκε: ' + location_code })
  }
  const loc = locRes.rows[0]

  const pickItem = await query(
    `SELECT * FROM picking_items WITH (NOLOCK)
     WHERE picking_id = $1 AND sku = $2`,
    [req.params.id, sku]
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
       WHERE picking_id = $2 AND sku = $3`,
      [newQty, req.params.id, sku]
    )
    await t.query(
      `UPDATE stock SET quantity = quantity - $1, updated_at = GETDATE()
       WHERE sku = $2 AND location_id = $3`,
      [qty, sku, loc.id]
    )
    await t.query(
      `INSERT INTO stock_movements (sku, location_id, type, quantity, reference_type, reference_id, created_by)
       VALUES ($1, $2, 'out', $3, 'picking', $4, $5)`,
      [sku, loc.id, qty, req.params.id, userId]
    )
    const remaining = await t.query(
      `SELECT COUNT(*) AS cnt FROM picking_items WITH (NOLOCK)
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
    sku,
    picked: newQty,
    required: Number(item.required_qty),
    order_complete: result.isComplete,
  })
})

// Un-pick
router.post('/pickings/:id/unpick', async (req, res) => {
  const { sku, location_code, quantity } = req.body
  const userId = req.session.user?.id || null

  const locRes = await query(
    `SELECT * FROM locations WITH (NOLOCK) WHERE code = $1`, [String(location_code).toUpperCase()]
  )
  if (locRes.rows.length === 0) {
    return res.status(404).json({ error: 'Θέση δεν βρέθηκε: ' + location_code })
  }
  const loc = locRes.rows[0]

  const pickItem = await query(
    `SELECT * FROM picking_items WITH (NOLOCK)
     WHERE picking_id = $1 AND sku = $2`,
    [req.params.id, sku]
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
       WHERE picking_id = $3 AND sku = $4`,
      [qty, loc.id, req.params.id, sku]
    )
    await t.query(
      `MERGE stock AS tgt
       USING (SELECT $1 AS sku, $2 AS location_id, $3 AS qty) AS src
       ON tgt.sku = src.sku AND tgt.location_id = src.location_id
       WHEN MATCHED THEN
         UPDATE SET quantity = tgt.quantity + src.qty, updated_at = GETDATE()
       WHEN NOT MATCHED THEN
         INSERT (sku, location_id, quantity)
         VALUES (src.sku, src.location_id, src.qty);`,
      [sku, loc.id, qty]
    )
    await t.query(
      `INSERT INTO stock_movements (sku, location_id, type, quantity, reference_type, reference_id, created_by)
       VALUES ($1, $2, 'in', $3, 'unpick', $4, $5)`,
      [sku, loc.id, qty, req.params.id, userId]
    )
    await t.query(
      `UPDATE pickings SET status = 'open', completed_at = NULL WHERE id = $1`,
      [req.params.id]
    )
  })

  return res.json({ success: true, sku, location: loc.code })
})

export default router
