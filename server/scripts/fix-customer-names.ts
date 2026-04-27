import sql from 'mssql'
import { query, closePool } from '../src/db'
import dotenv from 'dotenv'
dotenv.config({ path: 'C:\\Scanner_project\\server\\.env' })

async function main() {
  // Βρες τις σημερινές τοπικές παραγγελίες
  const local = await query(
    `SELECT entersoft_so_id FROM pickings WITH (NOLOCK)
     WHERE CAST(invoice_date AS DATE) = CAST(GETDATE() AS DATE)`
  )
  const localIds = local.rows.map(r => r.entersoft_so_id as string)

  if (localIds.length === 0) {
    console.log('Δεν υπάρχουν τοπικές παραγγελίες.')
    await closePool()
    return
  }

  console.log(`Τοπικές παραγγελίες: ${localIds.length}`)

  // Φέρε CustomerName μόνο για αυτά τα IDs από Entersoft
  const esPool = await new sql.ConnectionPool({
    server: process.env.ENTERSOFT_DB_SERVER!,
    database: process.env.ENTERSOFT_DB_NAME!,
    user: process.env.ENTERSOFT_DB_USER!,
    password: process.env.ENTERSOFT_DB_PASSWORD!,
    port: 1433,
    options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
  }).connect()

  const inList = localIds.map(id => `'${id.replace(/'/g, "''")}'`).join(',')
  const result = await esPool.request().query<{ ADCode: string; CustomerName: string }>(
    `SELECT DISTINCT ADCode, CustomerName FROM CS_ACS_Pickup WITH (NOLOCK)
     WHERE ADCode IN (${inList})
       AND CustomerName IS NOT NULL AND CustomerName != ''`
  )
  await esPool.close()

  const rows = Array.from(result.recordset)
  console.log(`Βρέθηκαν ${rows.length} αντιστοιχίες στο Entersoft`)

  let updated = 0
  for (const row of rows) {
    const res = await query(
      `UPDATE pickings SET customer_name = $1
       WHERE entersoft_so_id = $2 AND customer_name != $1`,
      [row.CustomerName.trim(), row.ADCode.trim()]
    )
    if (res.rowCount > 0) updated++
  }

  console.log(`Ενημερώθηκαν: ${updated} παραγγελίες`)
  await closePool()
}

main().catch(e => { console.error(e); process.exit(1) })
