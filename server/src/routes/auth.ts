import { Router, Request, Response, NextFunction } from 'express'
import bcrypt from 'bcrypt'
import { query } from '../db'

const router = Router()

export interface AuthUser {
  id: number
  username: string
  full_name: string
  can_orders: boolean
  can_receipts: boolean
  can_stock: boolean
  is_admin: boolean
}

declare module 'express-session' {
  interface SessionData { user?: AuthUser }
}

declare global {
  namespace Express {
    interface Request { user?: AuthUser }
  }
}

router.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body
  const fail = (msg: string) => res.redirect(`/?error=${encodeURIComponent(msg)}`)

  if (!username || !password) return fail('Συμπλήρωσε username και password')

  const result = await query(`SELECT * FROM users WITH (NOLOCK) WHERE username = $1`, [username])
  const user = result.rows[0]
  if (!user) return fail('Λάθος στοιχεία')

  const valid = await bcrypt.compare(password, user.password_hash as string)
  if (!valid) return fail('Λάθος στοιχεία')

  const payload: AuthUser = {
    id: user.id as number,
    username: user.username as string,
    full_name: user.full_name as string,
    can_orders: !!user.can_orders,
    can_receipts: !!user.can_receipts,
    can_stock: !!user.can_stock,
    is_admin: !!user.is_admin,
  }

  req.session.user = payload
  req.session.save(() => res.redirect('/'))
})

router.post('/logout', (req: Request, res: Response) => {
  req.session.destroy(() => res.redirect('/'))
})

router.get('/me', (req: Request, res: Response) => {
  if (!req.session.user) return res.status(401).json({ error: 'Απαιτείται σύνδεση' })
  res.json(req.session.user)
})

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user) return res.status(401).json({ error: 'Απαιτείται σύνδεση' })
  req.user = req.session.user
  next()
}

export default router
