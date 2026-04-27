import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import JsBarcode from 'jsbarcode'
import { API, authFetch } from '../api'

interface ProductInfo {
  sku: string
  name: string
  brand: string | null
}

export default function PrintLabel() {
  const [params] = useSearchParams()
  const sku = params.get('sku') || ''
  const [info, setInfo] = useState<ProductInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!sku) { setError('Λείπει SKU'); return }
    authFetch(`${API}/products/${encodeURIComponent(sku)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error)
        else setInfo({ sku: data.sku, name: data.name, brand: data.brand })
      })
      .catch(() => setError('Σφάλμα φόρτωσης'))
  }, [sku])

  useEffect(() => {
    if (!info || !svgRef.current) return
    try {
      JsBarcode(svgRef.current, info.sku, {
        format: 'CODE128',
        width: 2,
        height: 60,
        displayValue: true,
        fontSize: 14,
        margin: 4,
      })
    } catch (e) {
      setError('Αποτυχία rendering: ' + String(e))
    }
  }, [info])

  if (error) return <div style={{ padding: 24 }}>⚠ {error}</div>
  if (!info) return <div style={{ padding: 24 }}>Φόρτωση...</div>

  return (
    <div style={{ padding: 16, fontFamily: 'sans-serif' }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { margin: 4mm; }
          body { background: white !important; }
          .label { page-break-after: always; }
        }
        .label {
          border: 1px solid #ccc;
          padding: 8px;
          width: 60mm;
          margin: 8px auto;
          text-align: center;
          font-family: sans-serif;
        }
        .label-name { font-size: 11px; font-weight: 600; line-height: 1.2;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
          overflow: hidden; margin-bottom: 4px; }
        .label-brand { font-size: 9px; color: #666; margin-bottom: 4px; }
      `}</style>

      <div className="no-print" style={{ marginBottom: 16, display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button onClick={() => window.print()} style={{ padding: '10px 20px', fontSize: 16, fontWeight: 700, background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          🖨 Εκτύπωση
        </button>
        <button onClick={() => window.close()} style={{ padding: '10px 20px', fontSize: 16, background: '#f0f0f0', border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer' }}>
          Κλείσιμο
        </button>
      </div>

      <div className="label">
        {info.brand && <div className="label-brand">{info.brand}</div>}
        <div className="label-name">{info.name}</div>
        <svg ref={svgRef} />
      </div>
    </div>
  )
}
