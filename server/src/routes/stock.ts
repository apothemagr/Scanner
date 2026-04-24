import { Router } from 'express'
import { query, parseJsonCol } from '../db'

const router = Router()

router.get('/', async (_req, res) => {
  const result = await query(
    `SELECT p.id, p.sku, p.name, p.unit, p.site_url, p.brand, p.supplier,
        CAST(COALESCE(SUM(s.quantity), 0) AS INT) AS total_quantity,
        (SELECT l2.code AS location, CAST(s2.quantity AS INT) AS qty
         FROM stock s2 WITH (NOLOCK)
         JOIN locations l2 WITH (NOLOCK) ON l2.id = s2.location_id
         WHERE s2.product_id = p.id AND s2.quantity > 0
         FOR JSON PATH) AS locations
     FROM products p WITH (NOLOCK)
     LEFT JOIN stock s WITH (NOLOCK) ON s.product_id = p.id
     GROUP BY p.id, p.sku, p.name, p.unit, p.site_url, p.brand, p.supplier
     ORDER BY p.name`
  )
  const rows = result.rows.map(r => ({ ...r, locations: parseJsonCol(r.locations) }))
  return res.json(rows)
})

export default router
