-- Πίνακας για custom barcodes που συνδέονται με SKU.
-- Χρήση: όταν ένα προϊόν έρχεται με barcode που δεν είναι στο ecom view,
-- ο χρήστης το συνδέει χειροκίνητα με υπάρχον SKU. Επόμενα scans το αναγνωρίζουν.
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='barcode_aliases')
BEGIN
  CREATE TABLE barcode_aliases (
    id INT IDENTITY(1,1) PRIMARY KEY,
    barcode VARCHAR(100) NOT NULL,
    sku VARCHAR(50) NOT NULL,
    created_at DATETIME DEFAULT GETDATE(),
    created_by INT NULL
  );
  CREATE UNIQUE INDEX uq_barcode_aliases_barcode ON barcode_aliases(barcode);
  CREATE INDEX idx_barcode_aliases_sku ON barcode_aliases(sku);
END
