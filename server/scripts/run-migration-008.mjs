import sql from 'mssql'
import fs from 'fs'
import dotenv from 'dotenv'
dotenv.config({ path: 'C:\\Scanner_project\\server\\.env' })

const p = await new sql.ConnectionPool({
  server: process.env.DB_SERVER, database: process.env.DB_NAME,
  user: process.env.DB_USER, password: process.env.DB_PASSWORD, port: 1433,
  options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
}).connect()

const file = fs.readFileSync('C:\\Scanner_project\\database\\migrations\\008_sku_refactor.sql', 'utf8')
const batches = file.split(/^\s*GO\s*$/im).map(s => s.trim()).filter(Boolean)

for (let i = 0; i < batches.length; i++) {
  console.log(`Batch ${i+1}/${batches.length}...`)
  await p.request().batch(batches[i])
}

console.log('Migration complete.')
await p.close()
