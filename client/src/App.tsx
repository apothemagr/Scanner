import { Routes, Route, Link, useLocation } from 'react-router-dom'
import ScanIn from './pages/ScanIn'
import ScanOut from './pages/ScanOut'
import Stock from './pages/Stock'
import './App.css'

function App() {
  const location = useLocation()

  return (
    <div className="app">
      <header className="app-header">
        <h1>Αποθήκη</h1>
        <nav>
          <Link to="/" className={location.pathname === '/' ? 'active' : ''}>Παραλαβή</Link>
          <Link to="/scan-out" className={location.pathname === '/scan-out' ? 'active' : ''}>Picking</Link>
          <Link to="/stock" className={location.pathname === '/stock' ? 'active' : ''}>Απόθεμα</Link>
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<ScanIn />} />
          <Route path="/scan-out" element={<ScanOut />} />
          <Route path="/stock" element={<Stock />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
