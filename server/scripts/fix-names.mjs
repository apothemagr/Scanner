import sql from 'mssql'
import dotenv from 'dotenv'
dotenv.config({ path: 'C:\\Scanner_project\\server\\.env' })

const localCfg = {
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME || 'scanner_db',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'scan',
  port: Number(process.env.DB_PORT) || 1433,
  options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
}

const esCfg = {
  server: process.env.ENTERSOFT_DB_SERVER,
  database: process.env.ENTERSOFT_DB_NAME,
  user: process.env.ENTERSOFT_DB_USER,
  password: process.env.ENTERSOFT_DB_PASSWORD,
  port: 1433,
  options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
}

console.log('Σύνδεση στη local βάση...')
const local = await new sql.ConnectionPool(localCfg).connect()

const localRows = await local.request().query(
  `SELECT entersoft_so_id FROM pickings WITH (NOLOCK)
   WHERE CAST(invoice_date AS DATE) = CAST(GETDATE() AS DATE)`
)
const ids = localRows.recordset.map(r => r.entersoft_so_id)
console.log(`Τοπικές παραγγελίες σήμερα: ${ids.length}`)

if (ids.length === 0) { await local.close(); process.exit(0) }

console.log('Σύνδεση στο Entersoft...')
const es = await new sql.ConnectionPool(esCfg).connect()

const inList = ids.map(id => `'${id.replace(/'/g, "''")}'`).join(',')
const esRows = await es.request().query(
  `SELECT DISTINCT ADCode, CustomerName, DateCreated FROM CS_ACS_Pickup WITH (NOLOCK)
   WHERE ADCode IN (${inList})
     AND CustomerName IS NOT NULL AND CustomerName != ''`
)
console.log(`Βρέθηκαν ${esRows.recordset.length} εγγραφές στο Entersoft`)
await es.close()

let updated = 0
for (const row of esRows.recordset) {
  const name = String(row.CustomerName).trim()
  const code = String(row.ADCode).trim()
  const r = await local.request()
    .input('name', sql.NVarChar, name)
    .input('code', sql.NVarChar, code)
    .query(`UPDATE pickings SET customer_name = @name
            WHERE entersoft_so_id = @code AND customer_name != @name`)
  if (r.rowsAffected[0] > 0) {
    updated++
    console.log(`  ✓ ${code} → ${name}`)
  }
}

console.log(`\nΕνημερώθηκαν: ${updated} παραγγελίες`)
await local.close()
