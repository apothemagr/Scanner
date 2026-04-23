import { Router } from 'express';
import { query } from '../db';

const router = Router();

// Αναζήτηση με barcode ή SKU (χρησιμοποιείται κατά το scanning)
router.get('/lookup', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'code required' });

  const result = await query(
    `SELECT p.*,
      json_agg(json_build_object('location_code', l.code, 'location_id', l.id, 'quantity', s.quantity))
        FILTER (WHERE s.quantity > 0) as stock_locations
     FROM products p
     LEFT JOIN stock s ON s.product_id = p.id
     LEFT JOIN locations l ON l.id = s.location_id
     WHERE p.barcode = $1 OR p.barcode2 = $1 OR p.sku = $1
     GROUP BY p.id`,
    [code]
  );

  if (result.rows.length === 0) return res.status(404).json({ error: 'Προϊόν δεν βρέθηκε' });
  return res.json(result.rows[0]);
});

// Λίστα όλων των προϊόντων
router.get('/', async (_req, res) => {
  const result = await query(
    `SELECT * FROM products ORDER BY name`
  );
  return res.json(result.rows);
});

// Δημιουργία προϊόντος
router.post('/', async (req, res) => {
  const { sku, name, barcode, unit, needs_label, entersoft_id } = req.body;
  const result = await query(
    `INSERT INTO products (sku, name, barcode, unit, needs_label, entersoft_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [sku, name, barcode || null, unit || 'τεμ', needs_label || false, entersoft_id || null]
  );
  return res.status(201).json(result.rows[0]);
});

// Ενημέρωση προϊόντος
router.put('/:id', async (req, res) => {
  const { name, barcode, unit, needs_label } = req.body;
  const result = await query(
    `UPDATE products SET name=$1, barcode=$2, unit=$3, needs_label=$4, updated_at=NOW()
     WHERE id=$5 RETURNING *`,
    [name, barcode || null, unit, needs_label, req.params.id]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Δεν βρέθηκε' });
  return res.json(result.rows[0]);
});

export default router;
