import { Router } from 'express';
import { query } from '../db';

const router = Router();

router.get('/', async (_req, res) => {
  const result = await query(
    `SELECT l.*, COUNT(s.id) as product_count
     FROM locations l
     LEFT JOIN stock s ON s.location_id = l.id AND s.quantity > 0
     WHERE l.is_active = true
     GROUP BY l.id
     ORDER BY l.code`
  );
  return res.json(result.rows);
});

router.post('/', async (req, res) => {
  const { code, type, description } = req.body;
  const result = await query(
    `INSERT INTO locations (code, type, description) VALUES ($1, $2, $3) RETURNING *`,
    [code, type, description || null]
  );
  return res.status(201).json(result.rows[0]);
});

// Περιεχόμενο θέσης
router.get('/:id/stock', async (req, res) => {
  const result = await query(
    `SELECT p.sku, p.name, p.barcode, s.quantity, p.unit
     FROM stock s
     JOIN products p ON p.id = s.product_id
     WHERE s.location_id = $1 AND s.quantity > 0
     ORDER BY p.name`,
    [req.params.id]
  );
  return res.json(result.rows);
});

export default router;
