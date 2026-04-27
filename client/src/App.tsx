import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
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

  return (
    <div className="app">
      <main className="app-main">
        <Routes>
          {user.can_receipts && <Route path="/" element={<ScanIn />} />}
          {user.can_orders && <Route path="/scan-out" element={<ScanOut />} />}
          {user.can_stock && <Route path="/stock" element={<Stock />} />}
          {user.can_stock && <Route path="/transfer" element={<Transfer />} />}
          {user.can_stock && <Route path="/print-label" element={<PrintLabel />} />}
          {user.can_stock && <Route path="/reports" element={<Reports />} />}
          {user.can_stock && <Route path="/find" element={<Find />} />}
          {user.is_admin && <Route path="/admin" element={<Admin />} />}
          <Route path="*" element={
            <div style={{ padding: 32, textAlign: 'center', color: '#888' }}>
              <p>Δεν έχεις πρόσβαση σε αυτή τη σελίδα.</p>
            </div>
          } />
        </Routes>
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
