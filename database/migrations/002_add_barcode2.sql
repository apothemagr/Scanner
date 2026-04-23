-- Προσθήκη δεύτερου barcode για προϊόντα που αποτελούνται από 2 δέματα (π.χ. κλιματιστικά)
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode2 VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_products_barcode2 ON products(barcode2);
