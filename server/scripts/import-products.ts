import * as XLSX from 'xlsx'
import { pool } from '../src/db'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.join(__dirname, '../.env') })

async function importProducts() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('Χρήση: npx tsx scripts/import-products.ts <path-to-xlsx>')
    process.exit(1)
  }

  console.log(`Διάβασμα αρχείου: ${filePath}`)
  const wb = XLSX.readFile(filePath, { codepage: 1253 })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<{
    Code: string | number
    EAN: string | number
    Brand: string
    Supplier: string
    Model: string
    BP: number
    'Stock HQ': number
  }>(sheet)

  console.log(`Βρέθηκαν ${rows.length} προϊόντα. Ξεκινάει import...`)

  let inserted = 0
  let updated = 0
  let errors = 0

  for (const row of rows) {
    const sku = String(row.Code || '').trim()
    const name = String(row.Model || '').trim()
    const brand = String(row.Brand || '').trim() || null
    const supplier = String(row.Supplier || '').trim() || null
    const eanRaw = row.EAN ? String(row.EAN).trim() : null
    const eanParts = eanRaw?.includes('/') ? eanRaw.split('/') : [eanRaw]
    const ean  = eanParts[0] && eanParts[0].length >= 8 ? eanParts[0] : null
    const ean2 = eanParts[1] && eanParts[1].length >= 8 ? eanParts[1] : null
    const hasBarcode = !!ean

    if (!sku || !name) { errors++; continue }

    try {
      const existing = await pool.query('SELECT id FROM products WHERE sku = $1', [sku])

      if (existing.rows.length > 0) {
        await pool.query(
          `UPDATE products
             SET name=$1, barcode=$2, barcode2=$3, needs_label=$4,
                 brand=$5, supplier=$6, updated_at=NOW()
           WHERE sku=$7`,
          [name, ean, ean2, !hasBarcode, brand, supplier, sku]
        )
        updated++
      } else {
        await pool.query(
          `INSERT INTO products (sku, name, barcode, barcode2, needs_label, brand, supplier, unit)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'τεμ')`,
          [sku, name, ean, ean2, !hasBarcode, brand, supplier]
        )
        inserted++
      }
    } catch (e) {
      console.error(`Σφάλμα στο SKU ${sku}:`, e)
      errors++
    }
  }

  console.log(`\n✅ Ολοκληρώθηκε!`)
  console.log(`   Νέα προϊόντα: ${inserted}`)
  console.log(`   Ενημερώθηκαν: ${updated}`)
  console.log(`   Σφάλματα:     ${errors}`)

  await pool.end()
}

importProducts().catch(console.error)
