import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import productsRouter from './routes/products'
import locationsRouter from './routes/locations'
import stockRouter from './routes/stock'
import scanInRouter from './routes/scanIn'
import scanOutRouter from './routes/scanOut'
import { syncUrls } from '../scripts/sync-urls'
import { syncEntersoft } from './sync/sync-entersoft'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Sync URLs κάθε 24 ώρες
syncUrls().catch(console.error)
setInterval(() => syncUrls().catch(console.error), 24 * 60 * 60 * 1000)

// Sync παραγγελιών από Entersoft κάθε 30 δευτερόλεπτα
syncEntersoft().catch(console.error)
setInterval(() => syncEntersoft().catch(console.error), 30 * 1000)

app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.use('/api/products', productsRouter)
app.use('/api/locations', locationsRouter)
app.use('/api/stock', stockRouter)
app.use('/api/scan-in', scanInRouter)
app.use('/api/scan-out', scanOutRouter)

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Scanner API running on http://0.0.0.0:${PORT}`)
})
