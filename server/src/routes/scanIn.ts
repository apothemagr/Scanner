import { Router } from 'express'
import { query, withTransaction } from '../db'
import { getProductByBarcodeOrSku, getProductsBySkus } from '../services/productService'

const router = Router()

// Λίστα παραλαβών με προαιρετικό φίλτρο κατάστασης
router.get('/receipts', async (req, res) => {
  const status = req.query.status as string | undefined
  const where = status ? `WHERE r.status = '${status}'` : `WHERE r.status IN ('open','closed','completed')`
  const result = await query(
    `SELECT r.id, r.entersoft_po_id, r.supplier_name, r.status, r.receipt_type, r.created_at, r.completed_at,
        COUNT(ri.id) AS item_count,
        SUM(CASE WHEN ri.location_id IS NOT NULL THEN 1 ELSE 0 END) AS placed_count
     FROM receipts r WITH (NOLOCK)
     LEFT JOIN receipt_items ri WITH (NOLOCK) ON ri.receipt_id = r.id
     ${where}
     GROUP BY r.id, r.entersoft_po_id, r.supplier_name, r.status, r.receipt_type, r.created_at, r.completed_at
     ORDER BY r.created_at DESC`
  )
  return res.json(result.rows)
})

// Λεπτομέρειες παραλαβής
router.get('/receipts/:id', async (req, res) => {
  const r = await query(`SELECT * FROM receipts WITH (NOLOCK) WHERE id = $1`, [req.params.id])
  if (!r.rows[0]) return res.status(404).json({ error: 'Δεν βρέθηκε' })

  const items = await query(
    `SELECT ri.id, ri.sku, ri.received_qty, ri.expected_qty, ri.location_id, ri.scanned_at, ri.placement_added,
        l.code AS location_code
     FROM receipt_items ri WITH (NOLOCK)
     LEFT JOIN locations l WITH (NOLOCK) ON l.id = ri.location_id
     WHERE ri.receipt_id = $1
     ORDER BY CASE WHEN ri.scanned_at IS NULL THEN 1 ELSE 0 END, ri.scanned_at DESC`,
    [req.params.id]
  )

  const skus = items.rows.map(r => String(r.sku || '')).filter(Boolean)
  const productMap = await getProductsBySkus(skus)
  const enriched = items.rows.map(r => {
    const p = productMap.get(String(r.sku))
    return { ...r, name: p?.name || `[${r.sku}]`, unit: p?.unit || 'τεμ.' }
  })

  return res.json({ ...r.rows[0], items: enriched })
})

// Ενημέρωση αριθμού παραστατικού
router.patch('/receipts/:id', async (req, res) => {
  const { entersoft_po_id } = req.body
  try {
    await query(
      `UPDATE receipts SET entersoft_po_id = $1 WHERE id = $2`,
      [entersoft_po_id?.trim() || null, Number(req.params.id)]
    )
    return res.json({ success: true })
  } catch (e) {
    console.error('PATCH receipts error:', e)
    return res.status(500).json({ error: String(e) })
  }
})

// Δημιουργία νέας παραλαβής
router.post('/receipts', async (req, res) => {
  const { entersoft_po_id, supplier_name, receipt_type, from_expectations } = req.body
  const type = receipt_type === 'internal' ? 'internal' : 'supplier'
  const supplierVal = type === 'internal' ? 'Ενδοδιακίνηση' : (supplier_name || null)
  const r = await query(
    `INSERT INTO receipts (entersoft_po_id, supplier_name, status, receipt_type)
     OUTPUT INSERTED.*
     VALUES ($1, $2, 'open', $3)`,
    [entersoft_po_id || null, supplierVal, type]
  )
  const receipt = r.rows[0]

  // Αν ζητήθηκε pre-load από αναμονές προμηθευτή
  if (from_expectations && supplierVal && type === 'supplier') {
    const { getEcomPool } = await import('../db')
    const pool = await getEcomPool()
    const items = await pool.request()
      .input('s', supplierVal)
      .query(`SELECT CAST(ReferenceCode AS NVARCHAR(50)) AS sku, CAST(OpenQty AS INT) AS qty
              FROM ecomProductPickingView WITH (NOLOCK)
              WHERE Supplier = @s AND OpenQty > 0`)
    for (const it of items.recordset) {
      await query(
        `INSERT INTO receipt_items (receipt_id, sku, expected_qty, received_qty)
         VALUES ($1, $2, $3, 0)`,
        [receipt.id, it.sku, Number(it.qty)]
      )
    }
  }

  return res.status(201).json(receipt)
})

// Scan προϊόντος (φάση καταχώρησης)
router.post('/receipts/:id/scan-product', async (req, res) => {
  const { barcode_or_sku } = req.body

  const p = await getProductByBarcodeOrSku(barcode_or_sku)
  if (!p) return res.status(404).json({ error: 'Προϊόν δεν βρέθηκε: ' + barcode_or_sku })

  // Έλεγχος προμηθευτή (μόνο για παραλαβές τύπου supplier)
  const receipt = await query(`SELECT supplier_name, receipt_type FROM receipts WITH (NOLOCK) WHERE id = $1`, [Number(req.params.id)])
  const existingSupplier = receipt.rows[0]?.supplier_name as string | null
  const receiptType = receipt.rows[0]?.receipt_type as string

  let prefetched = false
  if (receiptType !== 'internal') {
    if (existingSupplier && p.supplier && existingSupplier !== p.supplier) {
      return res.status(400).json({ error: 'Δεν επιτρέπεται να περάσετε στην ίδια παραλαβή προϊόντα διαφορετικών προμηθευτών' })
    }
    if (p.supplier && !existingSupplier) {
      await query(`UPDATE receipts SET supplier_name = $1 WHERE id = $2`, [p.supplier, Number(req.params.id)])
      prefetched = true

      // Auto-load αναμονών προμηθευτή στο πρώτο scan
      try {
        const { getEcomPool } = await import('../db')
        const pool = await getEcomPool()
        const exp = await pool.request()
          .input('s', p.supplier)
          .query(`SELECT CAST(ReferenceCode AS NVARCHAR(50)) AS sku, CAST(OpenQty AS INT) AS qty
                  FROM ecomProductPickingView WITH (NOLOCK)
                  WHERE Supplier = @s AND OpenQty > 0`)
        for (const it of exp.recordset) {
          await query(
            `IF NOT EXISTS (SELECT 1 FROM receipt_items WITH (NOLOCK) WHERE receipt_id = $1 AND sku = $2)
               INSERT INTO receipt_items (receipt_id, sku, expected_qty, received_qty)
               VALUES ($1, $2, $3, 0)
             ELSE
               UPDATE receipt_items SET expected_qty = $3 WHERE receipt_id = $1 AND sku = $2 AND (expected_qty IS NULL OR expected_qty = 0)`,
            [Number(req.params.id), it.sku, Number(it.qty)]
          )
        }
      } catch (e) { console.error('[scanIn] expectation prefetch error:', e) }
    }
  }

  const existing = await query(
    `SELECT * FROM receipt_items WITH (NOLOCK) WHERE receipt_id = $1 AND sku = $2`,
    [req.params.id, p.sku]
  )

  // Έλεγχος αν το receipt έχει αναμονές (για unexpected detection)
  const hasExpectations = await query(
    `SELECT COUNT(*) AS cnt FROM receipt_items WITH (NOLOCK)
     WHERE receipt_id = $1 AND expected_qty IS NOT NULL AND expected_qty > 0`,
    [Number(req.params.id)]
  )
  const expectsAny = Number(hasExpectations.rows[0]?.cnt || 0) > 0

  let received_qty: number
  let unexpected = false
  let over_expected = false
  let expected_qty_val: number | null = null

  if (existing.rows[0]) {
    received_qty = Number(existing.rows[0].received_qty) + 1
    expected_qty_val = existing.rows[0].expected_qty != null ? Number(existing.rows[0].expected_qty) : null
    if (expected_qty_val != null && expected_qty_val > 0 && received_qty > expected_qty_val) {
      over_expected = true
    }
    await query(
      `UPDATE receipt_items SET received_qty = $1, scanned_at = GETDATE()
       WHERE receipt_id = $2 AND sku = $3`,
      [received_qty, req.params.id, p.sku]
    )
  } else {
    received_qty = 1
    unexpected = expectsAny  // αν υπήρχε λίστα αναμονής και δεν ήταν μέσα → unexpected
    await query(
      `INSERT INTO receipt_items (receipt_id, sku, received_qty, scanned_at, placement_added)
       VALUES ($1, $2, 1, GETDATE(), $3)`,
      [req.params.id, p.sku, unexpected ? 1 : 0]
    )
  }

  // Αν έγινε prefetch, επιστρέφω και τα expected items για άμεσο reload
  let expected_items: { sku: string; expected_qty: number }[] | undefined
  if (prefetched) {
    const r = await query(
      `SELECT sku, CAST(expected_qty AS INT) AS expected_qty FROM receipt_items WITH (NOLOCK)
       WHERE receipt_id = $1 AND expected_qty IS NOT NULL AND expected_qty > 0`,
      [Number(req.params.id)]
    )
    expected_items = r.rows.map(x => ({ sku: String(x.sku), expected_qty: Number(x.expected_qty) }))
  }

  return res.json({
    sku: p.sku, name: p.name, unit: p.unit, received_qty, supplier: p.supplier,
    prefetched, expected_items,
    expected_qty: expected_qty_val,
    unexpected, over_expected,
  })
})

// Ενημέρωση ποσότητας είδους
router.patch('/receipts/:id/items/:sku', async (req, res) => {
  const { quantity } = req.body
  if (!quantity || Number(quantity) < 1) return res.status(400).json({ error: 'Μη έγκυρη ποσότητα' })
  await query(
    `UPDATE receipt_items SET received_qty = $1 WHERE receipt_id = $2 AND sku = $3`,
    [Number(quantity), req.params.id, req.params.sku]
  )
  return res.json({ success: true })
})

// Διαγραφή παραλαβής (μόνο σε κατάσταση open)
router.delete('/receipts/:id', async (req, res) => {
  const r = await query(`SELECT status FROM receipts WITH (NOLOCK) WHERE id = $1`, [Number(req.params.id)])
  if (!r.rows[0]) return res.status(404).json({ error: 'Δεν βρέθηκε' })
  if (r.rows[0].status !== 'open') return res.status(400).json({ error: 'Μόνο παραλαβές σε Καταχώρηση μπορούν να διαγραφούν' })
  await query(`DELETE FROM receipt_items WHERE receipt_id = $1`, [Number(req.params.id)])
  await query(`DELETE FROM receipts WHERE id = $1`, [Number(req.params.id)])
  return res.json({ success: true })
})

// Αφαίρεση είδους από παραλαβή
router.delete('/receipts/:id/items/:sku', async (req, res) => {
  await query(
    `DELETE FROM receipt_items WHERE receipt_id = $1 AND sku = $2`,
    [Number(req.params.id), req.params.sku]
  )
  const remaining = await query(
    `SELECT COUNT(*) AS cnt FROM receipt_items WHERE receipt_id = $1`,
    [Number(req.params.id)]
  )
  if (Number(remaining.rows[0].cnt) === 0) {
    await query(`UPDATE receipts SET supplier_name = NULL WHERE id = $1`, [Number(req.params.id)])
  }
  return res.json({ success: true, empty: Number(remaining.rows[0].cnt) === 0 })
})

// Κλείσιμο παραλαβής
router.post('/receipts/:id/close', async (_req, res) => {
  await query(
    `UPDATE receipts SET status='closed', closed_at=GETDATE() WHERE id=$1`,
    [_req.params.id]
  )
  return res.json({ success: true })
})

// Scan προϊόντος κατά την εναπόθεση
router.post('/receipts/:id/place-product', async (req, res) => {
  const { barcode_or_sku } = req.body

  const p = await getProductByBarcodeOrSku(barcode_or_sku)
  if (!p) return res.status(404).json({ error: 'Προϊόν δεν βρέθηκε: ' + barcode_or_sku })

  const item = await query(
    `SELECT ri.*, l.code AS location_code FROM receipt_items ri WITH (NOLOCK)
     LEFT JOIN locations l WITH (NOLOCK) ON l.id = ri.location_id
     WHERE ri.receipt_id = $1 AND ri.sku = $2`,
    [req.params.id, p.sku]
  )

  let received_qty = 1
  let is_new = false

  if (!item.rows[0]) {
    is_new = true
    await query(
      `INSERT INTO receipt_items (receipt_id, sku, received_qty, scanned_at, placement_added)
       VALUES ($1, $2, 1, GETDATE(), 1)`,
      [req.params.id, p.sku]
    )
  } else {
    received_qty = Number(item.rows[0].received_qty)
  }

  return res.json({
    sku: p.sku, name: p.name, unit: p.unit,
    received_qty, is_new,
    already_placed: item.rows[0]?.location_id != null,
    location_code: item.rows[0]?.location_code ?? null,
  })
})

// Scan θέσης κατά την εναπόθεση
router.post('/receipts/:id/place-location', async (req, res) => {
  const { sku, location_code, quantity } = req.body
  const userId = req.session.user?.id || null

  const locRes = await query(
    `SELECT * FROM locations WITH (NOLOCK) WHERE code = $1`, [String(location_code).toUpperCase()]
  )
  if (!locRes.rows[0]) return res.status(404).json({ error: 'Θέση δεν βρέθηκε: ' + location_code })
  const loc = locRes.rows[0]

  const item = await query(
    `SELECT * FROM receipt_items WITH (NOLOCK)
     WHERE receipt_id = $1 AND sku = $2`,
    [req.params.id, sku]
  )
  if (!item.rows[0]) return res.status(400).json({ error: 'Προϊόν δεν βρέθηκε στην παραλαβή' })

  const qty = Number(quantity) || Number(item.rows[0].received_qty)

  await withTransaction(async (t) => {
    await t.query(
      `UPDATE receipt_items SET location_id = $1, scanned_at = GETDATE()
       WHERE receipt_id = $2 AND sku = $3`,
      [loc.id, req.params.id, sku]
    )
    await t.query(
      `MERGE stock AS tgt
       USING (SELECT $1 AS sku, $2 AS lid, $3 AS q) AS src
       ON tgt.sku = src.sku AND tgt.location_id = src.lid
       WHEN MATCHED THEN UPDATE SET quantity = tgt.quantity + src.q, updated_at = GETDATE()
       WHEN NOT MATCHED THEN INSERT (sku, location_id, quantity) VALUES (src.sku, src.lid, src.q);`,
      [sku, loc.id, qty]
    )
    await t.query(
      `INSERT INTO stock_movements (sku, location_id, type, quantity, reference_type, reference_id, created_by)
       VALUES ($1, $2, 'in', $3, 'receipt', $4, $5)`,
      [sku, loc.id, qty, req.params.id, userId]
    )
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

  return res.json({ success: true, sku, location: loc.code })
})

// Μαζική εναπόθεση
router.post('/receipts/:id/place-all', async (req, res) => {
  const { location_code } = req.body
  const userId = req.session.user?.id || null

  const locRes = await query(
    `SELECT * FROM locations WITH (NOLOCK) WHERE code = $1`, [String(location_code).toUpperCase()]
  )
  if (!locRes.rows[0]) return res.status(404).json({ error: 'Θέση δεν βρέθηκε: ' + location_code })
  const loc = locRes.rows[0]

  const items = await query(
    `SELECT * FROM receipt_items WITH (NOLOCK)
     WHERE receipt_id = $1 AND location_id IS NULL`,
    [req.params.id]
  )
  if (items.rows.length === 0) return res.status(400).json({ error: 'Δεν υπάρχουν εκκρεμή είδη' })

  await withTransaction(async (t) => {
    for (const item of items.rows) {
      await t.query(
        `UPDATE receipt_items SET location_id = $1, scanned_at = GETDATE()
         WHERE receipt_id = $2 AND sku = $3`,
        [loc.id, req.params.id, item.sku]
      )
      await t.query(
        `MERGE stock AS tgt
         USING (SELECT $1 AS sku, $2 AS lid, $3 AS q) AS src
         ON tgt.sku = src.sku AND tgt.location_id = src.lid
         WHEN MATCHED THEN UPDATE SET quantity = tgt.quantity + src.q, updated_at = GETDATE()
         WHEN NOT MATCHED THEN INSERT (sku, location_id, quantity) VALUES (src.sku, src.lid, src.q);`,
        [item.sku, loc.id, Number(item.received_qty)]
      )
      await t.query(
        `INSERT INTO stock_movements (sku, location_id, type, quantity, reference_type, reference_id, created_by)
         VALUES ($1, $2, 'in', $3, 'receipt', $4, $5)`,
        [item.sku, loc.id, Number(item.received_qty), req.params.id, userId]
      )
    }
    await t.query(`UPDATE receipts SET status='completed', completed_at=GETDATE() WHERE id=$1`, [req.params.id])
  })

  return res.json({ success: true, location: loc.code, count: items.rows.length })
})

export default router
