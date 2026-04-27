-- Migration: Replace product_id (int FK) with sku (varchar) across all tables
-- After this migration the local 'products' table is no longer authoritative;
-- product info is fetched from ecom (webapothema.dbo.ecomProductPickingView).

-- 1. Drop foreign keys and dependent constraints
IF OBJECT_ID('FK_pi_product', 'F') IS NOT NULL ALTER TABLE picking_items DROP CONSTRAINT FK_pi_product;
IF OBJECT_ID('FK_stock_product', 'F') IS NOT NULL ALTER TABLE stock DROP CONSTRAINT FK_stock_product;
IF OBJECT_ID('FK_sm_product', 'F') IS NOT NULL ALTER TABLE stock_movements DROP CONSTRAINT FK_sm_product;
IF OBJECT_ID('FK_ri_product', 'F') IS NOT NULL ALTER TABLE receipt_items DROP CONSTRAINT FK_ri_product;
IF OBJECT_ID('UQ_stock_product_location', 'UQ') IS NOT NULL ALTER TABLE stock DROP CONSTRAINT UQ_stock_product_location;

-- 2. Add sku column where it does not exist
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='stock' AND COLUMN_NAME='sku')
  ALTER TABLE stock ADD sku VARCHAR(50) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='stock_movements' AND COLUMN_NAME='sku')
  ALTER TABLE stock_movements ADD sku VARCHAR(50) NULL;
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='receipt_items' AND COLUMN_NAME='sku')
  ALTER TABLE receipt_items ADD sku VARCHAR(50) NULL;
GO

-- 3. Backfill sku from products
UPDATE s SET s.sku = p.sku FROM stock s JOIN products p ON p.id = s.product_id WHERE s.sku IS NULL;
UPDATE sm SET sm.sku = p.sku FROM stock_movements sm JOIN products p ON p.id = sm.product_id WHERE sm.sku IS NULL;
UPDATE ri SET ri.sku = p.sku FROM receipt_items ri JOIN products p ON p.id = ri.product_id WHERE ri.sku IS NULL;
UPDATE pi SET pi.sku = p.sku FROM picking_items pi JOIN products p ON p.id = pi.product_id WHERE pi.sku IS NULL AND pi.product_id IS NOT NULL;
GO

-- 4. Drop product_id columns
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='stock' AND COLUMN_NAME='product_id')
  ALTER TABLE stock DROP COLUMN product_id;
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='stock_movements' AND COLUMN_NAME='product_id')
  ALTER TABLE stock_movements DROP COLUMN product_id;
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='receipt_items' AND COLUMN_NAME='product_id')
  ALTER TABLE receipt_items DROP COLUMN product_id;
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='picking_items' AND COLUMN_NAME='product_id')
  ALTER TABLE picking_items DROP COLUMN product_id;
GO

-- 5. Indexes on sku
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_stock_sku' AND object_id=OBJECT_ID('stock'))
  CREATE INDEX idx_stock_sku ON stock(sku);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_sm_sku' AND object_id=OBJECT_ID('stock_movements'))
  CREATE INDEX idx_sm_sku ON stock_movements(sku);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_ri_sku' AND object_id=OBJECT_ID('receipt_items'))
  CREATE INDEX idx_ri_sku ON receipt_items(sku);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_pi_sku' AND object_id=OBJECT_ID('picking_items'))
  CREATE INDEX idx_pi_sku ON picking_items(sku);

-- 6. Re-create unique constraint on stock (one row per sku/location)
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE name='UQ_stock_sku_location')
  ALTER TABLE stock ADD CONSTRAINT UQ_stock_sku_location UNIQUE (sku, location_id);
