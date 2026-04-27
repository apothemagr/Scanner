import sql from 'mssql'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })

const pool = await new sql.ConnectionPool({
  server: process.env.DB_SERVER || 'localhost\\SQLEXPRESS',
  database: process.env.DB_NAME || 'scanner_db',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'scan',
  port: 1433,
  options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
}).connect()

const r = await pool.request().query(
  `SELECT TOP 15 entersoft_so_id, customer_name, CAST(invoice_date AS NVARCHAR(50)) AS inv_date
   FROM pickings WITH (NOLOCK) ORDER BY created_at DESC`
)

for (const row of r.recordset) {
  console.log(`${row.entersoft_so_id} | ${row.customer_name} | ${row.inv_date}`)
}

await pool.close()
