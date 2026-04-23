import { Router } from 'express';
import { pool, query } from '../db';

const router = Router();

// Δημιουργία νέας παραλαβής
router.post('/receipts', async (req, res) => {
  const { entersoft_po_id, supplier_name, created_by, items } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const receipt = await client.query(
      `INSERT INTO receipts (entersoft_po_id, supplier_name, created_by)
       VALUES ($1, $2, $3) RETURNING *`,
      [entersoft_po_id || null, supplier_name, created_by]
    );
    const receiptId = receipt.rows[0].id;

    if (items?.length) {
      for (const item of items) {
        await client.query(
          `INSERT INTO receipt_items (receipt_id, product_id, expected_qty)
           VALUES ($1, $2, $3)`,
          [receiptId, item.product_id, item.expected_qty]
        );
      }
    }

    await client.query('COMMIT');
    return res.status(201).json(receipt.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

// Scan ενός προϊόντος κατά την παραλαβή
router.post('/receipts/:id/scan', async (req, res) => {
  const { product_id, location_id, quantity } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ενημέρωση receipt item
    await client.query(
      `UPDATE receipt_items
       SET received_qty = received_qty + $1, location_id = $2, scanned_at = NOW()
       WHERE receipt_id = $3 AND product_id = $4`,
      [quantity, location_id, req.params.id, product_id]
    );

    // Upsert stock
    await client.query(
      `INSERT INTO stock (product_id, location_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (product_id, location_id)
       DO UPDATE SET quantity = stock.quantity + $3, updated_at = NOW()`,
      [product_id, location_id, quantity]
    );

    // Καταγραφή κίνησης
    await client.query(
      `INSERT INTO stock_movements (product_id, location_id, type, quantity, reference_type, reference_id)
       VALUES ($1, $2, 'in', $3, 'receipt', $4)`,
      [product_id, location_id, quantity, req.params.id]
    );

    await client.query('COMMIT');
    return res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

// Ολοκλήρωση παραλαβής
router.post('/receipts/:id/complete', async (req, res) => {
  await query(
    `UPDATE receipts SET status='completed', completed_at=NOW() WHERE id=$1`,
    [req.params.id]
  );
  return res.json({ success: true });
});

// Λίστα ανοιχτών παραλαβών
router.get('/receipts', async (_req, res) => {
  const result = await query(
    `SELECT r.*,
      COUNT(ri.id) as item_count,
      COUNT(ri.id) FILTER (WHERE ri.scanned_at IS NOT NULL) as scanned_count
     FROM receipts r
     LEFT JOIN receipt_items ri ON ri.receipt_id = r.id
     WHERE r.status = 'open'
     GROUP BY r.id
     ORDER BY r.created_at DESC`
  );
  return res.json(result.rows);
});

export default router;
