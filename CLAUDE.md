# Scanner - Warehouse Management App

## Project Overview
Warehouse scanning app για διαχείριση αποθήκης. Αντικαθιστά χειροκίνητες διαδικασίες με barcode scanning.

## Business Context
- ~1000 SKUs στην αποθήκη
- ERP: Entersoft Expert (integration για orders & stock sync)
- Devices: Android phones + Zebra TC21 handheld scanners (PWA σε browser)
- Courier voucher + παραστατικό εκτυπώνεται από Entersoft (δεν αλλάζει)

## Core Workflows

### Scan In (Παραλαβή από Προμηθευτή)
1. Αποθηκάριος ανοίγει Purchase Order από Entersoft
2. Scanάρει κάθε προϊόν
3. Επιλέγει/επιβεβαιώνει θέση αποθήκης
4. Αν προϊόν δεν έχει barcode → εκτύπωση label
5. Entersoft ενημερώνεται αυτόματα

### Scan Out (Picking Παραγγελιών)
1. Λίστα παραγγελιών έτοιμων για dispatch (από Entersoft - ήδη τιμολογημένες)
2. Αποθηκάριος βλέπει: προϊόν + θέση + ποσότητα
3. Πηγαίνει στη θέση, scanάρει προϊόν
4. Σύστημα επιβεβαιώνει ✓ ή ✗ λάθος προϊόν
5. Βάζει σε μαρσίπιο με παραστατικό (voucher εξωτερικά)
6. Παλέτα → φορτηγό

## Warehouse Location System
- Ράφια: `R-{στήλη}{αριθμός}-{επίπεδο}` π.χ. `R-A1-02`
- Παλέτες: `P-{αριθμός}` π.χ. `P-007` (μπορεί να έχουν μικτά είδη)

## Tech Stack
- **Frontend**: React PWA (Vite + TypeScript)
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL
- **Labels**: ZPL (Zebra printers) + PDF fallback
- **ERP Integration**: Entersoft Expert REST API

## Project Structure
```
Scanner_project/
├── client/          # React PWA
├── server/          # Node.js API
├── database/        # SQL migrations
└── CLAUDE.md
```

## Key Design Decisions
- PWA (not native app) → works on any Android device without installation
- Entersoft handles invoicing/vouchers — scanner app only handles physical warehouse operations
- Locations must be labeled physically with stickers before going live
- Items without EAN/QR get printed labels with internal barcodes

## Development Notes
- UI must work with large touch targets (handheld scanners have small screens)
- Barcode input should work via hardware scanner (keyboard wedge input)
- Greek language UI
