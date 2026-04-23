import { pool } from '../src/db'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

dotenv.config({ path: path.join(__dirname, '../.env') })

async function setupLocations() {
  const locations: { code: string; type: string; description: string }[] = []

  // Ράφια: R-{Σειρά}{Στήλη}-{Επίπεδο}
  // Σειρές A, B, C | Στήλες 01-10 | Επίπεδα 1-4
  const rows = ['A', 'B', 'C']
  const cols = 10
  const levels = 4
  for (const row of rows) {
    for (let col = 1; col <= cols; col++) {
      for (let lvl = 1; lvl <= levels; lvl++) {
        const code = `R-${row}${String(col).padStart(2, '0')}-${lvl}`
        locations.push({ code, type: 'shelf', description: `Ράφι Σειρά ${row}, Στήλη ${col}, Επίπεδο ${lvl}` })
      }
    }
  }

  // Παλέτες: P-001 έως P-150
  for (let i = 1; i <= 150; i++) {
    const code = `P-${String(i).padStart(3, '0')}`
    locations.push({ code, type: 'pallet', description: `Παλέτα ${i}` })
  }

  // Πάτωμα: F-01 έως F-30
  for (let i = 1; i <= 30; i++) {
    const code = `F-${String(i).padStart(2, '0')}`
    locations.push({ code, type: 'floor', description: `Πάτωμα ${i}` })
  }

  console.log(`Εισαγωγή ${locations.length} θέσεων...`)

  let inserted = 0
  let skipped = 0
  for (const loc of locations) {
    try {
      await pool.query(
        `INSERT INTO locations (code, type, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (code) DO NOTHING`,
        [loc.code, loc.type, loc.description]
      )
      inserted++
    } catch {
      skipped++
    }
  }

  console.log(`✅ Εισήχθησαν: ${inserted} | Υπήρχαν ήδη: ${skipped}`)

  // Παράγω εκτυπώσιμη σελίδα με QR codes
  generatePrintPage(locations)
  await pool.end()
}

function generatePrintPage(locations: { code: string; type: string }[]) {
  const html = `<!DOCTYPE html>
<html lang="el">
<head>
<meta charset="UTF-8">
<title>Ταμπέλες Αποθήκης</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; background: #fff; }
  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    padding: 10px;
  }
  .label {
    border: 2px solid #333;
    border-radius: 6px;
    padding: 8px;
    text-align: center;
    page-break-inside: avoid;
    background: #fff;
  }
  .label.shelf  { border-color: #1a1a2e; }
  .label.pallet { border-color: #e67e22; }
  .label.floor  { border-color: #27ae60; }
  .qr { width: 80px; height: 80px; margin: 0 auto 4px; }
  .code { font-size: 13px; font-weight: 900; letter-spacing: 1px; }
  .type { font-size: 9px; color: #666; margin-top: 2px; }
  @media print {
    .grid { gap: 4px; padding: 6px; }
    @page { margin: 8mm; }
  }
  .section-title {
    font-size: 16px; font-weight: bold; padding: 12px 10px 4px;
    border-bottom: 2px solid #333; margin: 10px 0 6px;
  }
</style>
<script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"></script>
</head>
<body>

<div style="padding:10px; display:flex; justify-content:space-between; align-items:center;">
  <h1 style="font-size:18px;">Ταμπέλες Αποθήκης — ${locations.length} θέσεις</h1>
  <button onclick="window.print()" style="padding:8px 16px;font-size:14px;cursor:pointer;">🖨️ Εκτύπωση</button>
</div>

<div class="section-title">📦 Ράφια (${locations.filter(l => l.type === 'shelf').length} θέσεις)</div>
<div class="grid" id="shelves"></div>

<div class="section-title">🏗️ Παλέτες (${locations.filter(l => l.type === 'pallet').length} θέσεις)</div>
<div class="grid" id="pallets"></div>

<div class="section-title">🟩 Πάτωμα (${locations.filter(l => l.type === 'floor').length} θέσεις)</div>
<div class="grid" id="floor"></div>

<script>
const locations = ${JSON.stringify(locations)};

async function renderLabels() {
  for (const loc of locations) {
    const container = document.getElementById(
      loc.type === 'shelf' ? 'shelves' : loc.type === 'pallet' ? 'pallets' : 'floor'
    );
    const div = document.createElement('div');
    div.className = 'label ' + loc.type;

    const canvas = document.createElement('canvas');
    canvas.className = 'qr';
    await QRCode.toCanvas(canvas, loc.code, { width: 80, margin: 1 });

    const code = document.createElement('div');
    code.className = 'code';
    code.textContent = loc.code;

    const type = document.createElement('div');
    type.className = 'type';
    type.textContent = loc.type === 'shelf' ? 'ΡΑΦΙ' : loc.type === 'pallet' ? 'ΠΑΛΕΤΑ' : 'ΠΑΤΩΜΑ';

    div.appendChild(canvas);
    div.appendChild(code);
    div.appendChild(type);
    container.appendChild(div);
  }
}
renderLabels();
</script>
</body>
</html>`

  const outPath = path.join(__dirname, '../../location-labels.html')
  fs.writeFileSync(outPath, html)
  console.log(`📄 Εκτυπώσιμη σελίδα: ${outPath}`)
  console.log(`   Άνοιξε το αρχείο στον browser και πάτα Εκτύπωση.`)
}

setupLocations().catch(console.error)
