import express from 'express'
import cors from 'cors'
import session from 'express-session'
import dotenv from 'dotenv'
import productsRouter from './routes/products'
import locationsRouter from './routes/locations'
import stockRouter from './routes/stock'
import scanInRouter from './routes/scanIn'
import scanOutRouter from './routes/scanOut'
import transfersRouter from './routes/transfers'
import reportsRouter from './routes/reports'
import expectationsRouter from './routes/expectations'
import authRouter, { requireAuth } from './routes/auth'
import usersRouter from './routes/users'
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

app.use(cors({ origin: true, credentials: true }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(session({
  secret: process.env.SESSION_SECRET || 'scanner_session_secret_2024',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 },
}))

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.use('/api/auth', authRouter)
app.use('/api/users', usersRouter)
app.use('/api/products', requireAuth, productsRouter)
app.use('/api/locations', requireAuth, locationsRouter)
app.use('/api/stock', requireAuth, stockRouter)
app.use('/api/scan-in', requireAuth, scanInRouter)
app.use('/api/scan-out', requireAuth, scanOutRouter)
app.use('/api/transfers', requireAuth, transfersRouter)
app.use('/api/reports', requireAuth, reportsRouter)
app.use('/api/expectations', requireAuth, expectationsRouter)

// Serve React app in production
import path from 'path'
const clientDist = path.join(__dirname, '../../client/dist')
app.use(express.static(clientDist))
app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')))

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Scanner API running on http://0.0.0.0:${PORT}`)
})
