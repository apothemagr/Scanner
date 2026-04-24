import sql from 'mssql'
import dotenv from 'dotenv'

dotenv.config()

const config: sql.config = {
  server: process.env.DB_SERVER || 'localhost',
  database: process.env.DB_NAME || 'scanner_db',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT) || 1433,
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
}

let _pool: sql.ConnectionPool | null = null

async function getPool(): Promise<sql.ConnectionPool> {
  if (!_pool || !_pool.connected) {
    _pool = await new sql.ConnectionPool(config).connect()
  }
  return _pool
}

// Converts $1, $2, ... placeholders to @p1, @p2, ...
function toMssql(text: string): string {
  return text.replace(/\$(\d+)/g, (_, n) => `@p${n}`)
}

function bindParams(request: sql.Request, params: unknown[]) {
  params.forEach((param, i) => {
    const name = `p${i + 1}`
    if (param === null || param === undefined) {
      request.input(name, sql.NVarChar(sql.MAX), null)
    } else if (typeof param === 'boolean') {
      request.input(name, sql.Bit, param ? 1 : 0)
    } else if (typeof param === 'number') {
      if (Number.isInteger(param)) {
        request.input(name, sql.Int, param)
      } else {
        request.input(name, sql.Decimal(18, 5), param)
      }
    } else if (param instanceof Date) {
      request.input(name, sql.DateTime, param)
    } else {
      request.input(name, sql.NVarChar(sql.MAX), String(param))
    }
  })
}

export interface QueryResult {
  rows: Record<string, unknown>[]
  rowCount: number
}

export async function query(text: string, params?: unknown[]): Promise<QueryResult> {
  const pool = await getPool()
  const request = pool.request()
  if (params) bindParams(request, params)
  const result = await request.query(toMssql(text))
  return {
    rows: result.recordset ? Array.from(result.recordset) : [],
    rowCount: result.rowsAffected.reduce((a, b) => a + b, 0),
  }
}

export interface TxClient {
  query(text: string, params?: unknown[]): Promise<QueryResult>
}

export async function withTransaction<T>(fn: (t: TxClient) => Promise<T>): Promise<T> {
  const pool = await getPool()
  const tx = new sql.Transaction(pool)
  await tx.begin()

  const client: TxClient = {
    async query(text: string, params?: unknown[]): Promise<QueryResult> {
      const request = new sql.Request(tx)
      if (params) bindParams(request, params)
      const result = await request.query(toMssql(text))
      return {
        rows: result.recordset ? Array.from(result.recordset) : [],
        rowCount: result.rowsAffected.reduce((a, b) => a + b, 0),
      }
    },
  }

  try {
    const result = await fn(client)
    await tx.commit()
    return result
  } catch (e) {
    await tx.rollback()
    throw e
  }
}

export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.close()
    _pool = null
  }
}

// Parse FOR JSON PATH result — SQL Server returns a JSON string from subqueries
export function parseJsonCol<T = Record<string, unknown>>(value: unknown): T[] | null {
  if (!value) return null
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T[] } catch { return null }
  }
  if (Array.isArray(value)) return value as T[]
  return null
}
