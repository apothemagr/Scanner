# Scanner — Warehouse Management App

## Stack
- **Frontend**: React + Vite + TypeScript — `client/` (port 5173)
- **Backend**: Node.js + Express + TypeScript — `server/` (port 3001)
- **Database**: **SQL Server** (mssql package) — ΟΧΙ PostgreSQL
- **GitHub**: https://github.com/apothemagr/Scanner

## Εκκίνηση (2 παράθυρα cmd)
```
# Backend
cd C:\Scanner_project\server
npm run dev

# Frontend
cd C:\Scanner_project\client
npm run dev
```
Από κινητό: `http://{IP_PC}:5173` (βρες IP με `ipconfig`)

## SQL Server connections (.env)
- **Local dev**: `localhost\SQLEXPRESS`, port 1433, DB: `scanner_db`, user: `sa`, pass: `scan`
- **Entersoft (παραγωγή)**: `192.168.199.33`, DB: `APOTHEMA`, user: `sa`, pass: `Ares4th!`
- Δημιουργία πινάκων: `database/create-tables.sql`
- TCP/IP ενεργοποιήθηκε μέσω registry (MSSQL17.SQLEXPRESS), port 1433 static

## Κανόνες SQL (SQL Server syntax — πάντα)
- `RETURNING *` → `OUTPUT INSERTED.*`
- `ON CONFLICT` → `MERGE ... WHEN MATCHED / NOT MATCHED`
- `NOW()` → `GETDATE()`
- `LIMIT N` → `TOP N` (πριν τις στήλες)
- `ILIKE` → `LIKE`
- `json_agg(...)` → correlated subquery με `FOR JSON PATH`
- `FILTER (WHERE x)` → `SUM(CASE WHEN x THEN 1 ELSE 0 END)`
- `GROUP BY p.id` → πρέπει να αναφέρονται ΟΛΑ τα non-aggregated columns
- Params: `$1,$2` → αυτόματα `@p1,@p2` μέσω wrapper στο `src/db.ts`
- **Πάντα** `WITH (NOLOCK)` σε κάθε πίνακα σε SELECT

## db.ts — helper functions
- `query(sql, params)` — απλό query, $N → @pN αυτόματα
- `withTransaction(async (t) => { ... })` — transaction
- `parseJsonCol(value)` — parse FOR JSON PATH result
- `closePool()` — για scripts

## Entersoft sync (κάθε 30")
- View: `CS_ACS_Pickup` στη βάση APOTHEMA
- Columns: ADCode, ADRegistrationDate, WebOrderID, ProductID, ProductQTY, route, modifieddate, TransporterCode, TransporterName
- Φίλτρο: μόνο σημερινές (ADRegistrationDate = GETDATE())
- TransporterCode `0000001` → pickup, αλλιώς → courier
- Mapping: ADCode→entersoft_so_id, WebOrderID→customer_name, modifieddate→print_date
- Ώρα στη λίστα: `created_at` (UTC) — ώρα που μπήκε στο local σύστημα

## Import scripts
```
# Προϊόντα
cd server && npx tsx scripts/import-products.ts C:\path\to\Products.xlsx

# Παραγγελίες από Excel
cd server && npx tsx scripts/import-orders.ts C:\path\to\Orders.xlsx

# Θέσεις αποθήκης (μία φορά)
cd server && npx tsx scripts/setup-locations.ts
```

## Project structure
```
Scanner_project/
├── client/src/
│   ├── components/BarcodeScanner.tsx   # Camera + manual input
│   └── pages/
│       ├── ScanIn.tsx                  # Παραλαβή προϊόντων
│       ├── ScanOut.tsx                 # Picking παραγγελιών
│       └── Stock.tsx                   # Απόθεμα αποθήκης
├── server/src/
│   ├── db.ts                           # mssql connection pool + helpers
│   ├── index.ts                        # Express app + sync intervals
│   ├── routes/                         # products, locations, stock, scanIn, scanOut
│   └── sync/sync-entersoft.ts          # Entersoft sync job
├── database/create-tables.sql          # T-SQL schema (IF NOT EXISTS)
└── CLAUDE.md
```

## Επόμενο βήμα
Ροή παραλαβών (ScanIn): scan document barcode → δημιουργία receipt → scan προϊόντων → finalize → push stock στο ecom (webProduct.StockQty) → τοποθέτηση σε ράφι
