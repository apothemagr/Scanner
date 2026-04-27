import { createContext, useContext, useState, useEffect } from 'react'
import type { ReactNode } from 'react'

export interface AuthUser {
  id: number
  username: string
  full_name: string
  can_orders: boolean
  can_receipts: boolean
  can_stock: boolean
  is_admin: boolean
}

interface AuthCtx {
  user: AuthUser | null
  loading: boolean
  logout: () => void
}

const Ctx = createContext<AuthCtx>(null!)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { setUser(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const logout = () => {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
      .finally(() => { setUser(null); window.location.href = '/' })
  }

  return <Ctx.Provider value={{ user, loading, logout }}>{children}</Ctx.Provider>
}

export function useAuth() { return useContext(Ctx) }
