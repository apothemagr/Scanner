import sql from 'mssql'
import dotenv from 'dotenv'
dotenv.config({ path: 'C:\\Scanner_project\\server\\.env' })

const local = await new sql.ConnectionPool({
  server: process.env.DB_SERVER, database: process.env.DB_NAME,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, port: 1433,
  options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
}).connect()

const es = await new sql.ConnectionPool({
  server: process.env.ENTERSOFT_DB_SERVER, database: process.env.ENTERSOFT_DB_NAME,
  user: process.env.ENTERSOFT_DB_USER, password: process.env.ENTERSOFT_DB_PASSWORD, port: 1433,
  options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
}).connect()

const localRows = await local.request().query(
  `SELECT entersoft_so_id FROM pickings WITH (NOLOCK)
   WHERE CAST(invoice_date AS DATE) = CAST(GETDATE() AS DATE)`
)
const ids = localRows.recordset.map(r => r.entersoft_so_id)
console.log(`Σημερινές: ${ids.length}`)

if (ids.length > 0) {
  const inList = ids.map(id => `'${id.replace(/'/g, "''")}'`).join(',')
  const r = await es.request().query(
    `SELECT ADCode, MIN(DateCreated) AS DateCreated FROM CS_ACS_Pickup WITH (NOLOCK)
     WHERE ADCode IN (${inList}) AND DateCreated IS NOT NULL
     GROUP BY ADCode`
  )
  let updated = 0
  for (const row of r.recordset) {
    const u = await local.request()
      .input('d', sql.DateTime, row.DateCreated)
      .input('c', sql.NVarChar, String(row.ADCode).trim())
      .query(`UPDATE pickings SET invoice_date = @d WHERE entersoft_so_id = @c AND invoice_date != @d`)
    if (u.rowsAffected[0] > 0) updated++
  }
  console.log(`Ενημερώθηκαν invoice_date: ${updated}`)
}

await es.close()
await local.close()
