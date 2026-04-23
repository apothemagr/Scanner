import { Routes, Route, Link, useLocation } from 'react-router-dom'
import ScanIn from './pages/ScanIn'
import ScanOut from './pages/ScanOut'
import Stock from './pages/Stock'
import './App.css'

function App() {
  const location = useLocation()

  return (
    <div className="app">
      <main className="app-main">
        <Routes>
          <Route path="/" element={<ScanIn />} />
          <Route path="/scan-out" element={<ScanOut />} />
          <Route path="/stock" element={<Stock />} />
        </Routes>
      </main>
      <nav className="app-footer">
        <Link to="/" className={location.pathname === '/' ? 'active' : ''}>
          <span className="nav-icon">📥</span>
          <span className="nav-label">Παραλαβή</span>
        </Link>
        <Link to="/scan-out" className={location.pathname === '/scan-out' ? 'active' : ''}>
          <span className="nav-icon">📦</span>
          <span className="nav-label">Picking</span>
        </Link>
        <Link to="/stock" className={location.pathname === '/stock' ? 'active' : ''}>
          <span className="nav-icon">📋</span>
          <span className="nav-label">Απόθεμα</span>
        </Link>
      </nav>
    </div>
  )
}

export default App
