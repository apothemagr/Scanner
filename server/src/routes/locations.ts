import { Router } from 'express'
import { query } from '../db'

const router = Router()

router.get('/', async (_req, res) => {
  const result = await query(
    `SELECT l.id, l.code, l.type, l.description, l.is_active, l.created_at,
        COUNT(s.id) AS product_count
     FROM locations l WITH (NOLOCK)
     LEFT JOIN stock s WITH (NOLOCK) ON s.location_id = l.id AND s.quantity > 0
     WHERE l.is_active = 1
     GROUP BY l.id, l.code, l.type, l.description, l.is_active, l.created_at
     ORDER BY l.code`
  )
  return res.json(result.rows)
})

router.post('/', async (req, res) => {
  const { code, type, description } = req.body
  const result = await query(
    `INSERT INTO locations (code, type, description)
     OUTPUT INSERTED.*
     VALUES ($1, $2, $3)`,
    [code, type, description || null]
  )
  return res.status(201).json(result.rows[0])
})

router.get('/:id/stock', async (req, res) => {
  const result = await query(
    `SELECT p.sku, p.name, p.barcode, CAST(s.quantity AS INT) AS quantity, p.unit
     FROM stock s WITH (NOLOCK)
     JOIN products p WITH (NOLOCK) ON p.id = s.product_id
     WHERE s.location_id = $1 AND s.quantity > 0
     ORDER BY p.name`,
    [req.params.id]
  )
  return res.json(result.rows)
})

export default router
