import sql from 'mssql'
import { query, withTransaction } from '../db'

// Ξεχωριστό connection pool για τον Entersoft server
let _esPool: sql.ConnectionPool | null = null

async function getEsPool(): Promise<sql.ConnectionPool> {
  if (!_esPool || !_esPool.connected) {
    _esPool = await new sql.ConnectionPool({
      server: process.env.ENTERSOFT_DB_SERVER!,
      database: process.env.ENTERSOFT_DB_NAME!,
      user: process.env.ENTERSOFT_DB_USER!,
      password: process.env.ENTERSOFT_DB_PASSWORD!,
      port: 1433,
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
      },
      pool: { max: 3, min: 0, idleTimeoutMillis: 30000 },
    }).connect()
  }
  return _esPool
}

interface PickupRow {
  ADCode: string
  ADRegistrationDate: Date
  WebOrderID: string
  ProductID: string
  ProductQTY: number
  route: string | null
  modifieddate: Date | null
  TransporterCode: string
  TransporterName: string
}

export async function syncEntersoft() {
  try {
    const esPool = await getEsPool()

    // Διάβασε μόνο παραγγελίες με σημερινή ημερομηνία
    const result = await esPool.request().query<PickupRow>(
      `SELECT ADCode, ADRegistrationDate, WebOrderID, ProductID, ProductQTY,
              route, modifieddate, TransporterCode, TransporterName
       FROM CS_ACS_Pickup
       WHERE CAST(ADRegistrationDate AS DATE) = CAST(GETDATE() AS DATE)`
    )
    const rows: PickupRow[] = Array.from(result.recordset)

    if (rows.length === 0) return

    // Ομαδοποίηση ανά παραγγελία (ADCode)
    const orderMap = new Map<string, PickupRow[]>()
    for (const row of rows) {
      const key = String(row.ADCode).trim()
      if (!orderMap.has(key)) orderMap.set(key, [])
      orderMap.get(key)!.push(row)
    }

    let inserted = 0, updated = 0

    for (const [adCode, lines] of orderMap.entries()) {
      const first = lines[0]

      try {
        // Έλεγχος αν υπάρχει ήδη η παραγγελία
        const existing = await query(
          `SELECT id FROM pickings WHERE entersoft_so_id = $1`, [adCode]
        )

        let pickingId: number

        if (existing.rows.length === 0) {
          // Νέα παραγγελία — insert
          const ins = await query(
            `INSERT INTO pickings
              (entersoft_so_id, customer_name, transporter, order_type,
               voucher_qty, invoice_date, status)
             OUTPUT INSERTED.id
             VALUES ($1, $2, $3, $4, $5, $6, 'open')`,
            [
              adCode,
              String(first.WebOrderID || '').trim(),
              String(first.TransporterName || '').trim(),
              'courier',
              1,
              first.ADRegistrationDate,
            ]
          )
          pickingId = ins.rows[0].id as number
          inserted++
        } else {
          pickingId = existing.rows[0].id as number
          updated++
        }

        // Upsert γραμμές (picking_items) — προσθήκη νέων μόνο
        for (const line of lines) {
          const sku = String(line.ProductID).trim()

          // Βρες product_id αν υπάρχει στη local βάση
          const prodRes = await query(
            `SELECT id FROM products WHERE sku = $1`, [sku]
          )
          const productId = prodRes.rows[0]?.id || null

          // Βρες best location αν υπάρχει stock
          let locationId: number | null = null
          if (productId) {
            const locRes = await query(
              `SELECT TOP 1 location_id FROM stock
               WHERE product_id = $1 AND quantity >= $2
               ORDER BY quantity DESC`,
              [productId, Number(line.ProductQTY) || 1]
            )
            locationId = locRes.rows[0]?.location_id || null
          }

          // Insert μόνο αν δεν υπάρχει ήδη αυτή η γραμμή
          await query(
            `IF NOT EXISTS (
               SELECT 1 FROM picking_items
               WHERE picking_id = $1 AND sku = $2
             )
             INSERT INTO picking_items
               (picking_id, product_id, sku, location_id, required_qty)
             VALUES ($1, $3, $2, $4, $5)`,
            [pickingId, sku, productId, locationId, Number(line.ProductQTY) || 1]
          )
        }
      } catch (e) {
        console.error(`[sync-entersoft] Σφάλμα στο ${adCode}:`, e)
      }
    }

    if (inserted > 0 || updated > 0) {
      console.log(`[sync-entersoft] +${inserted} νέες | ${updated} υπάρχουσες | ${orderMap.size} σύνολο`)
    }
  } catch (e) {
    console.error('[sync-entersoft] Σφάλμα σύνδεσης:', (e as Error).message)
  }
}
