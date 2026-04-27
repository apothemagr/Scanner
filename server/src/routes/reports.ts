import { Router } from 'express'
import { query } from '../db'
import { getProductsBySkus } from '../services/productService'

const router = Router()

// ── Activity log: λίστα κινήσεων stock με enrichment από users + ecom ──
router.get('/activity', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500)
  const offset = Number(req.query.offset) || 0
  const sku = (req.query.sku as string) || ''
  const type = (req.query.type as string) || '' // 'in' | 'out'
  const refType = (req.query.ref_type as string) || '' // receipt|picking|transfer|unpick
  const userId = req.query.user_id ? Number(req.query.user_id) : null
  const fromDate = (req.query.from as string) || ''
  const toDate = (req.query.to as string) || ''

  const where: string[] = []
  const params: unknown[] = []
  let i = 1
  if (sku) { where.push(`sm.sku LIKE $${i++}`); params.push(`%${sku}%`) }
  if (type === 'in' || type === 'out') { where.push(`sm.type = $${i++}`); params.push(type) }
  if (refType) { where.push(`sm.reference_type = $${i++}`); params.push(refType) }
  if (userId) { where.push(`sm.created_by = $${i++}`); params.push(userId) }
  if (fromDate) { where.push(`sm.created_at >= $${i++}`); params.push(new Date(fromDate)) }
  if (toDate) { where.push(`sm.created_at < DATEADD(DAY, 1, $${i++})`); params.push(new Date(toDate)) }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

  const r = await query(
    `SELECT sm.id, sm.sku, sm.type, CAST(sm.quantity AS INT) AS quantity,
        sm.reference_type, sm.reference_id, sm.created_at, sm.created_by,
        l.code AS location_code, u.full_name AS user_name, u.username
     FROM stock_movements sm WITH (NOLOCK)
     LEFT JOIN locations l WITH (NOLOCK) ON l.id = sm.location_id
     LEFT JOIN users u WITH (NOLOCK) ON u.id = sm.created_by
     ${whereClause}
     ORDER BY sm.created_at DESC
     OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`,
    params
  )

  // Enrich με product names
  const skus = Array.from(new Set(r.rows.map(x => String(x.sku)).filter(Boolean)))
  const productMap = await getProductsBySkus(skus)

  const enriched = r.rows.map(x => {
    const p = productMap.get(String(x.sku))
    return {
      ...x,
      product_name: p?.name || `[${x.sku}]`,
    }
  })

  return res.json(enriched)
})

// ── KPIs ημέρας ──
router.get('/dashboard', async (_req, res) => {
  const today = await query(
    `SELECT
       (SELECT COUNT(*) FROM pickings WITH (NOLOCK)
        WHERE CAST(completed_at AS DATE) = CAST(GETDATE() AS DATE)) AS orders_completed,
       (SELECT COUNT(*) FROM pickings WITH (NOLOCK)
        WHERE CAST(invoice_date AS DATE) = CAST(GETDATE() AS DATE)) AS orders_today,
       (SELECT COUNT(*) FROM receipts WITH (NOLOCK)
        WHERE CAST(completed_at AS DATE) = CAST(GETDATE() AS DATE)) AS receipts_completed,
       (SELECT COUNT(*) FROM receipts WITH (NOLOCK) WHERE status IN ('open','closed')) AS receipts_pending,
       (SELECT CAST(COALESCE(SUM(quantity),0) AS INT) FROM stock_movements WITH (NOLOCK)
        WHERE type='out' AND CAST(created_at AS DATE) = CAST(GETDATE() AS DATE)) AS items_out_today,
       (SELECT CAST(COALESCE(SUM(quantity),0) AS INT) FROM stock_movements WITH (NOLOCK)
        WHERE type='in' AND CAST(created_at AS DATE) = CAST(GETDATE() AS DATE)) AS items_in_today,
       (SELECT COUNT(*) FROM stock WITH (NOLOCK) WHERE quantity > 0 AND quantity <= 5) AS low_stock_count,
       (SELECT CAST(COALESCE(SUM(quantity),0) AS INT) FROM stock WITH (NOLOCK)) AS total_stock_units,
       (SELECT COUNT(DISTINCT sku) FROM stock WITH (NOLOCK) WHERE quantity > 0) AS distinct_skus_in_stock`
  )
  return res.json(today.rows[0])
})

// ── Picking productivity ανά χρήστη ──
router.get('/picking-productivity', async (req, res) => {
  const fromDate = (req.query.from as string) || ''
  const toDate = (req.query.to as string) || ''
  const where: string[] = [`sm.type='out'`, `sm.reference_type='picking'`]
  const params: unknown[] = []
  let i = 1
  if (fromDate) { where.push(`sm.created_at >= $${i++}`); params.push(new Date(fromDate)) }
  if (toDate) { where.push(`sm.created_at < DATEADD(DAY, 1, $${i++})`); params.push(new Date(toDate)) }

  const r = await query(
    `SELECT u.id, u.username, u.full_name,
        COUNT(sm.id) AS scans,
        CAST(SUM(sm.quantity) AS INT) AS total_qty,
        COUNT(DISTINCT sm.reference_id) AS orders
     FROM stock_movements sm WITH (NOLOCK)
     LEFT JOIN users u WITH (NOLOCK) ON u.id = sm.created_by
     WHERE ${where.join(' AND ')}
     GROUP BY u.id, u.username, u.full_name
     ORDER BY scans DESC`,
    params
  )
  return res.json(r.rows)
})

// ── Top moving items (ανά πλήθος scans εξόδου) ──
router.get('/top-moving', async (req, res) => {
  const days = Math.min(Number(req.query.days) || 30, 365)
  const limit = Math.min(Number(req.query.limit) || 20, 100)

  const r = await query(
    `SELECT TOP (${limit}) sm.sku,
        COUNT(sm.id) AS scans,
        CAST(SUM(sm.quantity) AS INT) AS total_qty
     FROM stock_movements sm WITH (NOLOCK)
     WHERE sm.type='out' AND sm.reference_type='picking'
       AND sm.created_at >= DATEADD(DAY, -$1, GETDATE())
     GROUP BY sm.sku
     ORDER BY total_qty DESC`,
    [days]
  )

  const skus = r.rows.map(x => String(x.sku))
  const productMap = await getProductsBySkus(skus)
  return res.json(r.rows.map(x => ({
    ...x,
    product_name: productMap.get(String(x.sku))?.name || `[${x.sku}]`,
  })))
})

// ── Λίστα χρηστών για το user filter στο activity ──
router.get('/users', async (_req, res) => {
  const r = await query(
    `SELECT id, username, full_name FROM users WITH (NOLOCK) ORDER BY full_name, username`
  )
  return res.json(r.rows)
})

export default router
