import * as XLSX from 'xlsx'
import { query, withTransaction, closePool } from '../src/db'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.join(__dirname, '../.env') })

interface OrderRow {
  'Order No': string
  Name: string
  Transporter: string
  InvoiceDate: number | Date
  PrintDate: number | Date
  Code: string | number
  Weight: number
  QTY: number
  'Voucher QTY': number
}

function excelDateToISO(val: number | Date | undefined): string | null {
  if (!val) return null
  if (val instanceof Date) return val.toISOString()
  const d = XLSX.SSF.parse_date_code(val as number)
  if (!d) return null
  return new Date(d.y, d.m - 1, d.d, d.H, d.M, d.S).toISOString()
}

async function importOrders() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('Χρήση: npx tsx scripts/import-orders.ts <path-to-xlsx>')
    process.exit(1)
  }

  const wb = XLSX.readFile(filePath)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<OrderRow>(sheet, { raw: true })
  console.log(`Βρέθηκαν ${rows.length} γραμμές`)

  const orderMap = new Map<string, OrderRow[]>()
  for (const row of rows) {
    const key = String(row['Order No']).trim()
    if (!orderMap.has(key)) orderMap.set(key, [])
    orderMap.get(key)!.push(row)
  }
  console.log(`Παραγγελίες: ${orderMap.size}`)

  let inserted = 0, skipped = 0, errors = 0

  for (const [orderNo, lines] of orderMap.entries()) {
    const first = lines[0]
    const transporter = String(first.Transporter || '').trim()
    const orderType = transporter === 'PickUp' ? 'pickup' : 'courier'

    try {
      // Check outside transaction (faster skip)
      const existing = await query(
        `SELECT id FROM pickings WHERE entersoft_so_id = $1`, [orderNo]
      )
      if (existing.rows.length > 0) {
        skipped++
        continue
      }

      await withTransaction(async (t) => {
        const pickingRes = await t.query(
          `INSERT INTO pickings
            (entersoft_so_id, customer_name, transporter, order_type, voucher_qty,
             invoice_date, print_date, status)
           OUTPUT INSERTED.id
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'open')`,
          [
            orderNo,
            String(first.Name || '').trim(),
            transporter,
            orderType,
            Number(first['Voucher QTY']) || 1,
            excelDateToISO(first.InvoiceDate as number),
            excelDateToISO(first.PrintDate as number),
          ]
        )
        const pickingId = pickingRes.rows[0].id

        for (const line of lines) {
          const sku = String(line.Code).trim()
          const productRes = await t.query(
            `SELECT id FROM products WHERE sku = $1`, [sku]
          )
          const productId = productRes.rows[0]?.id || null

          let locationId: number | null = null
          if (productId) {
            const locRes = await t.query(
              `SELECT TOP 1 location_id FROM stock
               WHERE product_id = $1 AND quantity >= $2
               ORDER BY quantity DESC`,
              [productId, Number(line.QTY) || 1]
            )
            locationId = locRes.rows[0]?.location_id || null
          }

          await t.query(
            `INSERT INTO picking_items (picking_id, product_id, sku, location_id, required_qty)
             VALUES ($1, $2, $3, $4, $5)`,
            [pickingId, productId, sku, locationId, Number(line.QTY) || 1]
          )
        }
      })

      inserted++
    } catch (e) {
      console.error(`Σφάλμα στην παραγγελία ${orderNo}:`, e)
      errors++
    }
  }

  await closePool()
  console.log(`✓ Εισήχθησαν: ${inserted} | Παραλείφθηκαν: ${skipped} | Σφάλματα: ${errors}`)
}

importOrders()
