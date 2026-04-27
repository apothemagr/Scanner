import { Router } from 'express'
import { getEcomPool } from '../db'

const router = Router()

// Λίστα προμηθευτών με ενεργές αναμονές
router.get('/suppliers', async (_req, res) => {
  const pool = await getEcomPool()
  const r = await pool.request().query(
    `SELECT Supplier AS supplier,
        COUNT(*) AS sku_count,
        CAST(SUM(OpenQty) AS INT) AS expected_units
     FROM ecomProductPickingView WITH (NOLOCK)
     WHERE OpenQty > 0 AND Supplier IS NOT NULL AND Supplier != ''
     GROUP BY Supplier
     ORDER BY Supplier`
  )
  return res.json(r.recordset)
})

// Είδη προμηθευτή με expected qty
router.get('/items', async (req, res) => {
  const supplier = String(req.query.supplier || '').trim()
  if (!supplier) return res.status(400).json({ error: 'Λείπει supplier' })
  const pool = await getEcomPool()
  const r = await pool.request()
    .input('s', supplier)
    .query(
      `SELECT CAST(ReferenceCode AS NVARCHAR(50)) AS sku,
          Model AS name, EAN AS barcode, SKU AS supplier_sku,
          Brand AS brand, CAST(OpenQty AS INT) AS expected_qty,
          CAST(StockQty AS INT) AS ecom_stock, URL AS url
       FROM ecomProductPickingView WITH (NOLOCK)
       WHERE Supplier = @s AND OpenQty > 0
       ORDER BY Model`
    )
  return res.json(r.recordset)
})

export default router
