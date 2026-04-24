import { Router } from 'express';
import { query } from '../db';

const router = Router();

// Συνολικό απόθεμα ανά προϊόν
router.get('/', async (_req, res) => {
  const result = await query(
    `SELECT p.id, p.sku, p.name, p.unit, p.site_url, p.brand, p.supplier,
      COALESCE(SUM(s.quantity), 0)::int as total_quantity,
      json_agg(json_build_object('location', l.code, 'qty', s.quantity::int))
        FILTER (WHERE s.quantity > 0) as locations
     FROM products p
     LEFT JOIN stock s ON s.product_id = p.id
     LEFT JOIN locations l ON l.id = s.location_id
     GROUP BY p.id
     ORDER BY p.name`
  );
  return res.json(result.rows);
});

export default router;
