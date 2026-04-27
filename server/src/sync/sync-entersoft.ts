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
  DateCreated: Date
  CustomerName: string
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

    // Διάβασε μόνο παραγγελίες με σημερινή ημερομηνία δημιουργίας
    const result = await esPool.request().query<PickupRow>(
      `SELECT ADCode, DateCreated, CustomerName, WebOrderID, ProductID, ProductQTY,
              route, modifieddate, TransporterCode, TransporterName
       FROM CS_ACS_Pickup WITH (NOLOCK)
       WHERE CAST(DateCreated AS DATE) = CAST(GETDATE() AS DATE)`
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
          `SELECT id FROM pickings WITH (NOLOCK) WHERE entersoft_so_id = $1`, [adCode]
        )

        let pickingId: number

        if (existing.rows.length === 0) {
          // Νέα παραγγελία — insert
          const ins = await query(
            `INSERT INTO pickings
              (entersoft_so_id, customer_name, web_order_id, transporter, order_type,
               voucher_qty, invoice_date, print_date, status)
             OUTPUT INSERTED.id
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'open')`,
            [
              adCode,
              String(first.CustomerName || first.WebOrderID || '').trim(),
              String(first.WebOrderID || '').trim() || null,
              String(first.TransporterName || '').trim(),
              String(first.TransporterCode).trim() === '0000001' ? 'pickup' : 'courier',
              1,
              first.DateCreated,
              first.modifieddate || null,
            ]
          )
          pickingId = ins.rows[0].id as number
          inserted++
        } else {
          pickingId = existing.rows[0].id as number
          const newName = String(first.CustomerName || '').trim()
          if (newName) {
            await query(
              `UPDATE pickings SET customer_name = $1 WHERE id = $2 AND customer_name != $1`,
              [newName, pickingId]
            )
          }
          const webId = String(first.WebOrderID || '').trim()
          if (webId) {
            await query(
              `UPDATE pickings SET web_order_id = $1 WHERE id = $2 AND (web_order_id IS NULL OR web_order_id != $1)`,
              [webId, pickingId]
            )
          }
          if (first.DateCreated) {
            await query(
              `UPDATE pickings SET invoice_date = $1 WHERE id = $2 AND invoice_date != $1`,
              [first.DateCreated, pickingId]
            )
          }
          updated++
        }

        // Upsert γραμμές (picking_items) — προσθήκη νέων μόνο
        for (const line of lines) {
          const sku = String(line.ProductID).trim()

          // Βρες best location αν υπάρχει stock
          const locRes = await query(
            `SELECT TOP 1 location_id FROM stock WITH (NOLOCK)
             WHERE sku = $1 AND quantity >= $2
             ORDER BY quantity DESC`,
            [sku, Number(line.ProductQTY) || 1]
          )
          const locationId = locRes.rows[0]?.location_id || null

          // Insert μόνο αν δεν υπάρχει ήδη αυτή η γραμμή
          await query(
            `IF NOT EXISTS (
               SELECT 1 FROM picking_items WITH (NOLOCK)
               WHERE picking_id = $1 AND sku = $2
             )
             INSERT INTO picking_items
               (picking_id, sku, location_id, required_qty)
             VALUES ($1, $2, $3, $4)`,
            [pickingId, sku, locationId, Number(line.ProductQTY) || 1]
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
