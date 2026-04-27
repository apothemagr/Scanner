import { Router } from 'express'
import bcrypt from 'bcrypt'
import { query } from '../db'
import { requireAuth } from './auth'

const router = Router()

const adminOnly = (req: any, res: any, next: any) => {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Απαιτούνται δικαιώματα admin' })
  next()
}

router.get('/', requireAuth, adminOnly, async (_req, res) => {
  const r = await query(`SELECT id, username, full_name, can_orders, can_receipts, can_stock, is_admin, created_at FROM users WITH (NOLOCK) ORDER BY full_name`)
  return res.json(r.rows)
})

router.post('/', requireAuth, adminOnly, async (req, res) => {
  const { username, password, full_name, can_orders, can_receipts, can_stock, is_admin } = req.body
  if (!username || !password) return res.status(400).json({ error: 'Username και password απαιτούνται' })
  const hash = await bcrypt.hash(password, 10)
  try {
    const r = await query(
      `INSERT INTO users (username, password_hash, full_name, can_orders, can_receipts, can_stock, is_admin)
       OUTPUT INSERTED.id, INSERTED.username, INSERTED.full_name, INSERTED.can_orders, INSERTED.can_receipts, INSERTED.can_stock, INSERTED.is_admin
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [username, hash, full_name || null, !!can_orders, !!can_receipts, !!can_stock, !!is_admin]
    )
    return res.status(201).json(r.rows[0])
  } catch {
    return res.status(400).json({ error: 'Το username υπάρχει ήδη' })
  }
})

router.patch('/:id', requireAuth, adminOnly, async (req, res) => {
  const { full_name, can_orders, can_receipts, can_stock, is_admin, password } = req.body
  if (password) {
    const hash = await bcrypt.hash(password, 10)
    await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, Number(req.params.id)])
  }
  await query(
    `UPDATE users SET full_name=$1, can_orders=$2, can_receipts=$3, can_stock=$4, is_admin=$5 WHERE id=$6`,
    [full_name || null, !!can_orders, !!can_receipts, !!can_stock, !!is_admin, Number(req.params.id)]
  )
  return res.json({ success: true })
})

router.delete('/:id', requireAuth, adminOnly, async (req, res) => {
  await query(`DELETE FROM users WHERE id = $1`, [Number(req.params.id)])
  return res.json({ success: true })
})

export default router
