-- Προσθήκη supplier_sku (κωδικός προϊόντος στον προμηθευτή) στα products
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('products') AND name = 'supplier_sku'
)
BEGIN
    ALTER TABLE products ADD supplier_sku NVARCHAR(100) NULL;
    PRINT 'Προστέθηκε: products.supplier_sku';
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('products') AND name = 'idx_products_supplier_sku'
)
BEGIN
    CREATE INDEX idx_products_supplier_sku ON products(supplier_sku);
    PRINT 'Δημιουργήθηκε: idx_products_supplier_sku';
END
GO
