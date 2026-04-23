-- Products
CREATE TABLE IF NOT EXISTS products (
  id          SERIAL PRIMARY KEY,
  sku         VARCHAR(100) UNIQUE NOT NULL,
  name        VARCHAR(255) NOT NULL,
  barcode     VARCHAR(100) UNIQUE,          -- EAN/QR (NULL αν δεν έχει)
  unit        VARCHAR(20) DEFAULT 'τεμ',
  needs_label BOOLEAN DEFAULT FALSE,        -- TRUE αν δεν έχει barcode
  entersoft_id VARCHAR(100),               -- ID στο Entersoft
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- Θέσεις αποθήκης
CREATE TABLE IF NOT EXISTS locations (
  id          SERIAL PRIMARY KEY,
  code        VARCHAR(50) UNIQUE NOT NULL,  -- π.χ. R-A1-02, P-007
  type        VARCHAR(20) NOT NULL CHECK (type IN ('shelf', 'pallet', 'floor')),
  description VARCHAR(255),
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Απόθεμα ανά θέση
CREATE TABLE IF NOT EXISTS stock (
  id          SERIAL PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  location_id INTEGER NOT NULL REFERENCES locations(id),
  quantity    DECIMAL(10,3) NOT NULL DEFAULT 0,
  updated_at  TIMESTAMP DEFAULT NOW(),
  UNIQUE(product_id, location_id)
);

-- Παραλαβές (Scan In sessions)
CREATE TABLE IF NOT EXISTS receipts (
  id              SERIAL PRIMARY KEY,
  entersoft_po_id VARCHAR(100),             -- Purchase Order ID από Entersoft
  supplier_name   VARCHAR(255),
  status          VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'completed', 'cancelled')),
  created_by      VARCHAR(100),
  completed_at    TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS receipt_items (
  id          SERIAL PRIMARY KEY,
  receipt_id  INTEGER NOT NULL REFERENCES receipts(id),
  product_id  INTEGER NOT NULL REFERENCES products(id),
  location_id INTEGER REFERENCES locations(id),
  expected_qty DECIMAL(10,3),
  received_qty DECIMAL(10,3) DEFAULT 0,
  scanned_at  TIMESTAMP
);

-- Picking (Scan Out sessions)
CREATE TABLE IF NOT EXISTS pickings (
  id              SERIAL PRIMARY KEY,
  entersoft_so_id VARCHAR(100),             -- Sales Order ID από Entersoft
  customer_name   VARCHAR(255),
  status          VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  created_by      VARCHAR(100),
  completed_at    TIMESTAMP,
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS picking_items (
  id          SERIAL PRIMARY KEY,
  picking_id  INTEGER NOT NULL REFERENCES pickings(id),
  product_id  INTEGER NOT NULL REFERENCES products(id),
  location_id INTEGER REFERENCES locations(id),
  required_qty DECIMAL(10,3) NOT NULL,
  picked_qty   DECIMAL(10,3) DEFAULT 0,
  scanned_at   TIMESTAMP
);

-- Ιστορικό κινήσεων αποθήκης
CREATE TABLE IF NOT EXISTS stock_movements (
  id          SERIAL PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id),
  location_id INTEGER NOT NULL REFERENCES locations(id),
  type        VARCHAR(20) NOT NULL CHECK (type IN ('in', 'out', 'transfer', 'adjustment')),
  quantity    DECIMAL(10,3) NOT NULL,
  reference_type VARCHAR(20),               -- 'receipt' ή 'picking'
  reference_id   INTEGER,
  notes       TEXT,
  created_by  VARCHAR(100),
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_stock_product ON stock(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_location ON stock(location_id);
CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_movements_created ON stock_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
