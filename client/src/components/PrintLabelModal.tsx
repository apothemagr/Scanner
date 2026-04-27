import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import JsBarcode from 'jsbarcode'
import { API, authFetch } from '../api'

interface ProductInfo {
  sku: string
  name: string
  brand: string | null
}

interface Props {
  sku: string
  onClose: () => void
}

export default function PrintLabelModal({ sku, onClose }: Props) {
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

  const handlePrint = () => {
    if (!info || !svgRef.current) return
    const svgMarkup = svgRef.current.outerHTML
    const w = window.open('', '_blank', 'width=400,height=300')
    if (!w) { alert('Επιτρέψτε popups για εκτύπωση'); return }
    w.document.write(`
      <html><head><title>Label ${info.sku}</title>
      <style>
        @page { margin: 4mm; }
        body { margin: 0; font-family: sans-serif; }
        .label { padding: 8px; width: 60mm; text-align: center; }
        .label-brand { font-size: 9px; color: #666; margin-bottom: 4px; }
        .label-name { font-size: 11px; font-weight: 600; line-height: 1.2;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
          overflow: hidden; margin-bottom: 4px; }
      </style></head><body>
        <div class="label">
          ${info.brand ? `<div class="label-brand">${info.brand}</div>` : ''}
          <div class="label-name">${info.name}</div>
          ${svgMarkup}
        </div>
        <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500); };<\/script>
      </body></html>
    `)
    w.document.close()
  }

  return createPortal(
    <>
      <div className="popup-overlay" onClick={onClose} style={{ zIndex: 9998 }} />
      <div className="popup" style={{ gap: 12, zIndex: 9999 }}>
        <button className="popup-close" onClick={onClose}>✕</button>
        <div className="popup-name">Εκτύπωση Label</div>
        {error ? (
          <div style={{ color: '#dc3545', textAlign: 'center' }}>⚠ {error}</div>
        ) : !info ? (
          <div style={{ textAlign: 'center', color: '#666' }}>Φόρτωση...</div>
        ) : (
          <>
            <div style={{
              border: '1px solid #ddd', borderRadius: 6, padding: 10,
              textAlign: 'center', background: '#fff', maxWidth: '100%',
            }}>
              {info.brand && <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>{info.brand}</div>}
              <div style={{
                fontSize: 13, fontWeight: 600, lineHeight: 1.2, marginBottom: 6,
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}>{info.name}</div>
              <svg ref={svgRef} style={{ maxWidth: '100%' }} />
            </div>
            <button className="btn-primary" onClick={handlePrint}>🖨 Εκτύπωση</button>
          </>
        )}
      </div>
    </>,
    document.body
  )
}
