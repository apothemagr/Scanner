export default function Login() {
  const params = new URLSearchParams(window.location.search)
  const error = params.get('error')

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100dvh', background: '#f0f2f5', padding: '24px',
    }}>
      <div style={{
        background: 'white', borderRadius: 16, padding: '32px 24px',
        width: '100%', maxWidth: 380, boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
        display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📦</div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1a1a2e' }}>Scanner</h1>
          <p style={{ fontSize: '0.85rem', color: '#888', marginTop: 4 }}>Σύνδεση στο σύστημα</p>
        </div>

        <form method="POST" action="/api/auth/login" autoComplete="on"
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            className="scan-input"
            id="username" name="username" type="text"
            placeholder="Username"
            autoComplete="username"
            autoCapitalize="none"
            autoFocus
          />
          <input
            className="scan-input"
            id="password" name="password" type="password"
            placeholder="Password"
            autoComplete="current-password"
          />
          {error && (
            <div style={{ background: '#f8d7da', color: '#721c24', padding: '10px 14px', borderRadius: 8, fontSize: '0.9rem', fontWeight: 600 }}>
              {decodeURIComponent(error)}
            </div>
          )}
          <button className="btn-primary" type="submit" style={{ marginTop: 4 }}>
            Σύνδεση
          </button>
        </form>
      </div>
    </div>
  )
}
