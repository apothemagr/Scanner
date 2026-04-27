import sql from 'mssql'
import { getEcomPool, query } from '../db'

export interface EcomProduct {
  sku: string
  name: string
  barcode: string | null
  supplier_sku: string | null
  brand: string | null
  supplier: string | null
  unit: string
  ecom_stock: number
  url: string | null
}

const BASE_SELECT = `
  SELECT CAST(ReferenceCode AS NVARCHAR(50)) AS sku,
         Model AS name,
         EAN AS barcode,
         SKU AS supplier_sku,
         Brand AS brand,
         Supplier AS supplier,
         StockQty AS ecom_stock,
         URL AS url
  FROM ecomProductPickingView WITH (NOLOCK)
`

function mapRow(row: Record<string, unknown>): EcomProduct {
  return {
    sku: String(row.sku || '').trim(),
    name: String(row.name || ''),
    barcode: (row.barcode as string) || null,
    supplier_sku: (row.supplier_sku as string) || null,
    brand: (row.brand as string) || null,
    supplier: (row.supplier as string) || null,
    unit: 'τεμ.',
    ecom_stock: Number(row.ecom_stock) || 0,
    url: (row.url as string) || null,
  }
}

export async function getProductBySku(sku: string): Promise<EcomProduct | null> {
  if (!sku) return null
  const pool = await getEcomPool()
  const r = await pool.request()
    .input('sku', sql.NVarChar, String(sku).trim())
    .query(`${BASE_SELECT} WHERE CAST(ReferenceCode AS NVARCHAR(50)) = @sku`)
  return r.recordset[0] ? mapRow(r.recordset[0]) : null
}

export async function getProductByBarcodeOrSku(value: string): Promise<EcomProduct | null> {
  if (!value) return null
  const pool = await getEcomPool()
  const v = String(value).trim()
  const r = await pool.request()
    .input('v', sql.NVarChar, v)
    .query(`${BASE_SELECT} WHERE EAN = @v OR SKU = @v OR CAST(ReferenceCode AS NVARCHAR(50)) = @v`)
  if (r.recordset[0]) return mapRow(r.recordset[0])

  // Δεν βρέθηκε στο ecom — έλεγχος custom barcode aliases
  const alias = await query(`SELECT sku FROM barcode_aliases WITH (NOLOCK) WHERE barcode = $1`, [v])
  if (alias.rows.length > 0) {
    return getProductBySku(String(alias.rows[0].sku))
  }
  return null
}

export async function getProductsBySkus(skus: string[]): Promise<Map<string, EcomProduct>> {
  const map = new Map<string, EcomProduct>()
  const cleaned = Array.from(new Set(skus.filter(Boolean).map(s => String(s).trim())))
  if (cleaned.length === 0) return map

  const pool = await getEcomPool()
  // batch in groups of 1000
  for (let i = 0; i < cleaned.length; i += 1000) {
    const batch = cleaned.slice(i, i + 1000)
    const placeholders = batch.map((_, idx) => `@s${idx}`).join(',')
    const req = pool.request()
    batch.forEach((s, idx) => req.input(`s${idx}`, sql.NVarChar, s))
    const r = await req.query(`${BASE_SELECT} WHERE CAST(ReferenceCode AS NVARCHAR(50)) IN (${placeholders})`)
    for (const row of r.recordset) {
      const p = mapRow(row)
      map.set(p.sku, p)
    }
  }
  return map
}

export async function getDistinctBrands(): Promise<string[]> {
  const pool = await getEcomPool()
  const r = await pool.request().query(
    `SELECT DISTINCT Brand FROM ecomProductPickingView WITH (NOLOCK)
     WHERE Brand IS NOT NULL AND Brand != '' ORDER BY Brand`
  )
  return r.recordset.map(x => String(x.Brand))
}

export async function getDistinctSuppliers(): Promise<string[]> {
  const pool = await getEcomPool()
  const r = await pool.request().query(
    `SELECT DISTINCT Supplier FROM ecomProductPickingView WITH (NOLOCK)
     WHERE Supplier IS NOT NULL AND Supplier != '' ORDER BY Supplier`
  )
  return r.recordset.map(x => String(x.Supplier))
}

export interface ProductFilter {
  q?: string
  sku?: string
  brand?: string
  supplier?: string
  limit?: number
}

export async function filterProducts(f: ProductFilter): Promise<EcomProduct[]> {
  const pool = await getEcomPool()
  const where: string[] = []
  const req = pool.request()
  if (f.q && f.q.trim()) {
    where.push('Model LIKE @q')
    req.input('q', sql.NVarChar, `%${f.q.trim()}%`)
  }
  if (f.sku && f.sku.trim()) {
    where.push('CAST(ReferenceCode AS NVARCHAR(50)) LIKE @sku')
    req.input('sku', sql.NVarChar, `%${f.sku.trim()}%`)
  }
  if (f.brand && f.brand.trim()) {
    where.push('Brand = @brand')
    req.input('brand', sql.NVarChar, f.brand.trim())
  }
  if (f.supplier && f.supplier.trim()) {
    where.push('Supplier = @supplier')
    req.input('supplier', sql.NVarChar, f.supplier.trim())
  }
  if (where.length === 0) return []
  const limit = Math.min(f.limit || 500, 2000)
  req.input('lim', sql.Int, limit)
  const r = await req.query(
    `SELECT TOP (@lim)
        CAST(ReferenceCode AS NVARCHAR(50)) AS sku,
        Model AS name, EAN AS barcode, SKU AS supplier_sku,
        Brand AS brand, Supplier AS supplier,
        StockQty AS ecom_stock, URL AS url
     FROM ecomProductPickingView WITH (NOLOCK)
     WHERE ${where.join(' AND ')}
     ORDER BY Model`
  )
  return r.recordset.map(mapRow)
}

export async function searchProducts(q: string, field: 'name' | 'sku' | 'supplier_sku', limit = 10): Promise<EcomProduct[]> {
  if (!q || q.trim().length < 2) return []
  const pool = await getEcomPool()
  const like = `%${q.trim()}%`
  const col = field === 'sku'
    ? 'CAST(ReferenceCode AS NVARCHAR(50))'
    : field === 'supplier_sku'
      ? 'SKU'
      : 'Model'
  const r = await pool.request()
    .input('q', sql.NVarChar, like)
    .input('lim', sql.Int, limit)
    .query(`SELECT TOP (@lim)
            CAST(ReferenceCode AS NVARCHAR(50)) AS sku,
            Model AS name, EAN AS barcode, SKU AS supplier_sku,
            Brand AS brand, Supplier AS supplier,
            StockQty AS ecom_stock, URL AS url
            FROM ecomProductPickingView WITH (NOLOCK)
            WHERE ${col} LIKE @q
            ORDER BY ${col}`)
  return r.recordset.map(mapRow)
}
