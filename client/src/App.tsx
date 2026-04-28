import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import type React from 'react'
import { AuthProvider, useAuth } from './auth'
import ScanIn from './pages/ScanIn'
import ScanOut from './pages/ScanOut'
import Stock from './pages/Stock'
import Transfer from './pages/Transfer'
import PrintLabel from './pages/PrintLabel'
import Reports from './pages/Reports'
import Find from './pages/Find'
import Admin from './pages/Admin'
import Login from './pages/Login'
import './App.css'

function AppInner() {
  const { user, loading, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [showSettings, setShowSettings] = useState(false)

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', fontSize: '2rem' }}>⏳</div>
  if (!user) return <Login />

  // Keep-alive: όλες οι σελίδες παραμένουν mounted ώστε να διατηρείται state/scroll
  // όταν ο χρήστης αλλάζει tab. Μόνο η ενεργή είναι visible.
  const path = location.pathname
  const knownPaths = ['/', '/scan-out', '/stock', '/transfer', '/print-label', '/reports', '/find', '/admin']
  const isUnknown = !knownPaths.includes(path)
  const pane = (visible: boolean): React.CSSProperties => ({
    display: visible ? 'flex' : 'none',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
  })

  return (
    <div className={`app${path === '/find' ? ' app--fullwidth' : ''}`}>
      <main className="app-main">
        {user.can_receipts && <div style={pane(path === '/')}><ScanIn /></div>}
        {user.can_orders && <div style={pane(path === '/scan-out')}><ScanOut /></div>}
        {user.can_stock && <div style={pane(path === '/stock')}><Stock /></div>}
        {user.can_stock && <div style={pane(path === '/transfer')}><Transfer /></div>}
        {user.can_stock && <div style={pane(path === '/print-label')}><PrintLabel /></div>}
        {user.can_stock && <div style={pane(path === '/reports')}><Reports /></div>}
        {user.can_stock && <div style={pane(path === '/find')}><Find /></div>}
        {user.is_admin && <div style={pane(path === '/admin')}><Admin /></div>}
        {isUnknown && (
          <div style={{ padding: 32, textAlign: 'center', color: '#888' }}>
            <p>Δεν έχεις πρόσβαση σε αυτή τη σελίδα.</p>
          </div>
        )}
      </main>
      {location.pathname !== '/find' && (
      <nav className="app-footer">
        {user.can_receipts && (
          <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
            <span className="nav-icon">📥</span>
            <span className="nav-label">Παραλαβή</span>
          </Link>
        )}
        {user.can_orders && (
          <Link to="/scan-out" className={location.pathname === '/scan-out' ? 'active' : ''}>
            <span className="nav-icon">📦</span>
            <span className="nav-label">Picking</span>
          </Link>
        )}
        {user.can_stock && (
          <Link to="/stock" className={location.pathname === '/stock' ? 'active' : ''}>
            <span className="nav-icon">📋</span>
            <span className="nav-label">Απόθεμα</span>
          </Link>
        )}
        {user.can_stock && (
          <Link to="/transfer" className={location.pathname === '/transfer' ? 'active' : ''}>
            <span className="nav-icon">🔁</span>
            <span className="nav-label">Μετακίνηση</span>
          </Link>
        )}
        <button onClick={() => setShowSettings(true)} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          color: location.pathname === '/admin' ? 'white' : 'rgba(255,255,255,0.5)',
          background: 'none', border: 'none',
          padding: '6px 4px', borderRadius: 10, cursor: 'pointer', flex: 1, minWidth: 0,
        }}>
          <span className="nav-icon">⚙️</span>
          <span className="nav-label">Ρυθμίσεις</span>
        </button>

        {showSettings && (
          <>
            <div className="popup-overlay" onClick={() => setShowSettings(false)} />
            <div className="popup" style={{ gap: 12 }}>
              <button className="popup-close" onClick={() => setShowSettings(false)}>✕</button>
              <div className="popup-name">Ρυθμίσεις</div>
              {user.can_stock && (
                <button className="btn-secondary" style={{ width: '100%', fontSize: '1rem' }}
                  onClick={() => { setShowSettings(false); navigate('/find') }}>
                  🔍 Εύρεση Προϊόντος (Desktop)
                </button>
              )}
              {user.can_stock && (
                <button className="btn-secondary" style={{ width: '100%', fontSize: '1rem' }}
                  onClick={() => { setShowSettings(false); navigate('/reports') }}>
                  📊 Αναφορές
                </button>
              )}
              {user.is_admin && (
                <button className="btn-secondary" style={{ width: '100%', fontSize: '1rem' }}
                  onClick={() => { setShowSettings(false); navigate('/admin') }}>
                  👤 Διαχείριση Χρηστών
                </button>
              )}
              <button className="btn-primary" style={{ width: '100%', fontSize: '1rem', background: '#dc3545' }}
                onClick={() => { if (confirm('Αποσύνδεση από το σύστημα;')) logout() }}>
                🚪 Έξοδος
              </button>
            </div>
          </>
        )}
      </nav>
      )}
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}

export default App
