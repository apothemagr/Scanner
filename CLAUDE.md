# Scanner - Warehouse Management App

## Project Overview
Warehouse scanning app για διαχείριση αποθήκης. Αντικαθιστά χειροκίνητες διαδικασίες με barcode scanning.

## Business Context
- 1848 SKUs στη βάση δεδομένων
- ERP: Entersoft Expert (integration προγραμματισμένο για Φάση 2)
- Devices: Android phones + Zebra TC21 handheld scanners (PWA σε browser)
- Courier voucher + παραστατικό εκτυπώνεται από Entersoft (δεν αλλάζει)

## Core Workflows

### Scan In (Παραλαβή από Προμηθευτή)
1. Αποθηκάριος ανοίγει νέα παραλαβή
2. Σκανάρει κάθε προϊόν (κάμερα ή handheld scanner)
3. Επιλέγει/επιβεβαιώνει θέση αποθήκης
4. Αν προϊόν δεν έχει barcode → εκτύπωση label (TODO)
5. Entersoft ενημερώνεται αυτόματα (Φάση 2)

### Scan Out (Picking Παραγγελιών)
1. Λίστα παραγγελιών έτοιμων για dispatch (από Entersoft - ήδη τιμολογημένες)
2. Αποθηκάριος βλέπει: προϊόν + θέση + ποσότητα
3. Πηγαίνει στη θέση, σκανάρει προϊόν
4. Σύστημα επιβεβαιώνει ✓ ή ✗ λάθος προϊόν
5. Βάζει σε μαρσίπιο με παραστατικό (voucher εξωτερικά)
6. Παλέτα → φορτηγό

## Warehouse Location System
- Ράφια: `R-{στήλη}{αριθμός}-{επίπεδο}` π.χ. `R-A1-02`
- Παλέτες: `P-{αριθμός}` π.χ. `P-007` (μπορεί να έχουν μικτά είδη)

## Tech Stack
- **Frontend**: React PWA (Vite + TypeScript)
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL 17 (local: `scanner_db`, user: `postgres`, pass: `postgres`)
- **Labels**: ZPL (Zebra printers) + PDF fallback (TODO)
- **ERP Integration**: Entersoft Expert REST API (Φάση 2)

## Project Structure
```
Scanner_project/
├── client/                        # React PWA (port 5173)
│   └── src/
│       ├── components/
│       │   └── BarcodeScanner.tsx # Camera (BarcodeDetector API) + handheld input
│       └── pages/
│           ├── ScanIn.tsx         # Παραλαβή προϊόντων
│           ├── ScanOut.tsx        # Picking παραγγελιών
│           └── Stock.tsx          # Απόθεμα αποθήκης
├── server/                        # Node.js API (port 3001)
│   └── src/routes/
│       ├── products.ts            # lookup barcode/barcode2/SKU
│       ├── locations.ts           # θέσεις αποθήκης
│       ├── stock.ts               # απόθεμα
│       ├── scanIn.ts              # παραλαβές
│       └── scanOut.ts             # picking
│   └── scripts/
│       └── import-products.ts     # one-time import από Excel
├── database/migrations/
│   ├── 001_initial_schema.sql     # βασικό schema
│   └── 002_add_barcode2.sql       # δεύτερο barcode για διπλά δέματα
└── CLAUDE.md
```

## Database Schema (key tables)
- `products`: sku, name, barcode, barcode2 (για EAN/EAN), needs_label, unit
- `locations`: code (R-A1-02 / P-007), type (shelf/pallet/floor)
- `stock`: product_id, location_id, quantity
- `receipts` + `receipt_items`: Scan In sessions
- `pickings` + `picking_items`: Scan Out sessions
- `stock_movements`: ιστορικό όλων των κινήσεων

## Barcode Logic
- Προϊόντα με `EAN/EAN` format → αποθηκεύεται στο `barcode` και `barcode2`
- Lookup ψάχνει: `barcode OR barcode2 OR sku`
- 1660 προϊόντα με barcode, 134 χωρίς (needs_label=true), 54 με διπλό barcode
- `barcode2` χωρίς UNIQUE constraint (ίδια εξωτερική μονάδα σε πολλά προϊόντα)

## Scanner Component (BarcodeScanner.tsx)
- **Camera mode**: Native BarcodeDetector API + getUserMedia με zoom x3
- **Input mode**: Text input για handheld scanners (keyboard wedge)
- **Persistent**: localStorage αποθηκεύει την προτίμηση ανά συσκευή
- StrictMode αφαιρέθηκε (προκαλούσε double camera init)

## Running Locally
```bash
cd C:\Scanner_project
npm run dev        # ξεκινά server (3001) + client (5173) μαζί
```
Από κινητό στο ίδιο δίκτυο: http://192.168.1.54:5174

## Import Products από Excel
```bash
cd server
npx tsx scripts/import-products.ts "path/to/Products.xlsx"
```
Columns: Code, EAN (υποστηρίζει EAN/EAN), Brand, Model, Stock HQ

## TODO (Φάση 2)
- [ ] Entersoft Expert API integration (sync orders & stock)
- [ ] Εκτύπωση labels για προϊόντα χωρίς barcode (134 προϊόντα)
- [ ] Admin panel: διαχείριση θέσεων αποθήκης
- [ ] Reports / ιστορικό κινήσεων
- [ ] Deploy σε production server
