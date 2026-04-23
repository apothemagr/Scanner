import { Router } from 'express';
import { pool, query } from '../db';

const router = Router();

// Λίστα ανοιχτών picking sessions
router.get('/pickings', async (_req, res) => {
  const result = await query(
    `SELECT p.*,
      COUNT(pi.id) as item_count,
      COUNT(pi.id) FILTER (WHERE pi.scanned_at IS NOT NULL) as picked_count
     FROM pickings p
     LEFT JOIN picking_items pi ON pi.picking_id = p.id
     WHERE p.status IN ('open', 'in_progress')
     GROUP BY p.id
     ORDER BY p.created_at DESC`
  );
  return res.json(result.rows);
});

// Λεπτομέρειες picking με θέσεις
router.get('/pickings/:id', async (req, res) => {
  const picking = await query(
    `SELECT * FROM pickings WHERE id = $1`,
    [req.params.id]
  );
  if (picking.rows.length === 0) return res.status(404).json({ error: 'Δεν βρέθηκε' });

  const items = await query(
    `SELECT pi.*, p.sku, p.name, p.barcode, p.unit,
      l.code as location_code
     FROM picking_items pi
     JOIN products p ON p.id = pi.product_id
     LEFT JOIN locations l ON l.id = pi.location_id
     WHERE pi.picking_id = $1
     ORDER BY l.code, p.name`,
    [req.params.id]
  );

  return res.json({ ...picking.rows[0], items: items.rows });
});

// Δημιουργία picking από Sales Order
router.post('/pickings', async (req, res) => {
  const { entersoft_so_id, customer_name, created_by, items } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const picking = await client.query(
      `INSERT INTO pickings (entersoft_so_id, customer_name, created_by, status)
       VALUES ($1, $2, $3, 'open') RETURNING *`,
      [entersoft_so_id || null, customer_name, created_by]
    );
    const pickingId = picking.rows[0].id;

    for (const item of items) {
      // Βρες τη θέση με το μεγαλύτερο απόθεμα για αυτό το προϊόν
      const stockResult = await client.query(
        `SELECT s.location_id FROM stock s
         WHERE s.product_id = $1 AND s.quantity >= $2
         ORDER BY s.quantity DESC LIMIT 1`,
        [item.product_id, item.required_qty]
      );
      const locationId = stockResult.rows[0]?.location_id || null;

      await client.query(
        `INSERT INTO picking_items (picking_id, product_id, location_id, required_qty)
         VALUES ($1, $2, $3, $4)`,
        [pickingId, item.product_id, locationId, item.required_qty]
      );
    }

    await client.query('COMMIT');
    return res.status(201).json(picking.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

// Scan προϊόντος κατά το picking
router.post('/pickings/:id/scan', async (req, res) => {
  const { barcode_or_sku, quantity } = req.body;

  // Βρες το προϊόν
  const product = await query(
    `SELECT * FROM products WHERE barcode = $1 OR sku = $1`,
    [barcode_or_sku]
  );
  if (product.rows.length === 0) {
    return res.status(404).json({ error: 'Προϊόν δεν βρέθηκε', code: barcode_or_sku });
  }
  const prod = product.rows[0];

  // Έλεγξε αν είναι στη λίστα picking
  const pickItem = await query(
    `SELECT * FROM picking_items WHERE picking_id = $1 AND product_id = $2`,
    [req.params.id, prod.id]
  );
  if (pickItem.rows.length === 0) {
    return res.status(400).json({ error: 'Το προϊόν δεν ανήκει σε αυτή την παραγγελία', product: prod.name });
  }

  const item = pickItem.rows[0];
  const newQty = Number(item.picked_qty) + (quantity || 1);

  if (newQty > Number(item.required_qty)) {
    return res.status(400).json({ error: 'Ποσότητα υπερβαίνει την παραγγελία', required: item.required_qty, current: item.picked_qty });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE picking_items SET picked_qty = $1, scanned_at = NOW()
       WHERE picking_id = $2 AND product_id = $3`,
      [newQty, req.params.id, prod.id]
    );

    // Αφαίρεση από stock
    await client.query(
      `UPDATE stock SET quantity = quantity - $1, updated_at = NOW()
       WHERE product_id = $2 AND location_id = $3`,
      [quantity || 1, prod.id, item.location_id]
    );

    // Καταγραφή κίνησης
    await client.query(
      `INSERT INTO stock_movements (product_id, location_id, type, quantity, reference_type, reference_id)
       VALUES ($1, $2, 'out', $3, 'picking', $4)`,
      [prod.id, item.location_id, quantity || 1, req.params.id]
    );

    // Ελέγξε αν ολοκληρώθηκε το picking
    const remaining = await client.query(
      `SELECT COUNT(*) as cnt FROM picking_items
       WHERE picking_id = $1 AND picked_qty < required_qty`,
      [req.params.id]
    );
    const isComplete = remaining.rows[0].cnt === '0';
    if (isComplete) {
      await client.query(
        `UPDATE pickings SET status='completed', completed_at=NOW() WHERE id=$1`,
        [req.params.id]
      );
    }

    await client.query('COMMIT');
    return res.json({ success: true, product: prod.name, picked: newQty, required: item.required_qty, order_complete: isComplete });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

export default router;
