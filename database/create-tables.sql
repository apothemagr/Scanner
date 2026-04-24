-- ============================================================
-- Scanner App — SQL Server Schema
-- Εκτέλεση σε SQL Server Management Studio ή sqlcmd
-- Αλλάζεις το DB_NAME αν χρειάζεται
-- ============================================================

USE [scanner_db]   -- ή το όνομα της κοινής βάσης σου
GO

-- ============================================================
-- products
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'products')
BEGIN
  CREATE TABLE [dbo].[products] (
    [id]           INT            IDENTITY(1,1) NOT NULL,
    [sku]          VARCHAR(100)   NOT NULL,
    [name]         NVARCHAR(500)  NOT NULL,
    [barcode]      VARCHAR(100)   NULL,
    [barcode2]     VARCHAR(100)   NULL,
    [unit]         NVARCHAR(20)   NOT NULL CONSTRAINT [DF_products_unit] DEFAULT (N'τεμ'),
    [needs_label]  BIT            NOT NULL CONSTRAINT [DF_products_needs_label] DEFAULT (0),
    [entersoft_id] INT            NULL,
    [brand]        NVARCHAR(100)  NULL,
    [supplier]     NVARCHAR(100)  NULL,
    [site_url]     NVARCHAR(1000) NULL,
    [created_at]   DATETIME       NOT NULL CONSTRAINT [DF_products_created_at] DEFAULT (GETDATE()),
    [updated_at]   DATETIME       NOT NULL CONSTRAINT [DF_products_updated_at] DEFAULT (GETDATE()),
    CONSTRAINT [PK_products] PRIMARY KEY CLUSTERED ([id] ASC),
    CONSTRAINT [UQ_products_sku] UNIQUE ([sku])
  )
  PRINT 'Δημιουργήθηκε: products'
END
GO

-- ============================================================
-- locations
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'locations')
BEGIN
  CREATE TABLE [dbo].[locations] (
    [id]          INT           IDENTITY(1,1) NOT NULL,
    [code]        VARCHAR(50)   NOT NULL,
    [type]        VARCHAR(20)   NOT NULL CONSTRAINT [DF_locations_type] DEFAULT ('shelf'),
    [description] NVARCHAR(500) NULL,
    [is_active]   BIT           NOT NULL CONSTRAINT [DF_locations_is_active] DEFAULT (1),
    [created_at]  DATETIME      NOT NULL CONSTRAINT [DF_locations_created_at] DEFAULT (GETDATE()),
    CONSTRAINT [PK_locations] PRIMARY KEY CLUSTERED ([id] ASC),
    CONSTRAINT [UQ_locations_code] UNIQUE ([code])
  )
  PRINT 'Δημιουργήθηκε: locations'
END
GO

-- ============================================================
-- stock
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'stock')
BEGIN
  CREATE TABLE [dbo].[stock] (
    [id]          INT            IDENTITY(1,1) NOT NULL,
    [product_id]  INT            NOT NULL,
    [location_id] INT            NOT NULL,
    [quantity]    DECIMAL(10, 3) NOT NULL CONSTRAINT [DF_stock_quantity] DEFAULT (0),
    [updated_at]  DATETIME       NOT NULL CONSTRAINT [DF_stock_updated_at] DEFAULT (GETDATE()),
    CONSTRAINT [PK_stock] PRIMARY KEY CLUSTERED ([id] ASC),
    CONSTRAINT [UQ_stock_product_location] UNIQUE ([product_id], [location_id]),
    CONSTRAINT [FK_stock_product]  FOREIGN KEY ([product_id])  REFERENCES [products]([id]),
    CONSTRAINT [FK_stock_location] FOREIGN KEY ([location_id]) REFERENCES [locations]([id])
  )
  PRINT 'Δημιουργήθηκε: stock'
END
GO

-- ============================================================
-- stock_movements
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'stock_movements')
BEGIN
  CREATE TABLE [dbo].[stock_movements] (
    [id]             INT            IDENTITY(1,1) NOT NULL,
    [product_id]     INT            NOT NULL,
    [location_id]    INT            NOT NULL,
    [type]           VARCHAR(10)    NOT NULL,   -- 'in' | 'out'
    [quantity]       DECIMAL(10, 3) NOT NULL,
    [reference_type] VARCHAR(50)    NULL,       -- 'receipt' | 'picking' | 'quick_receipt' | 'unpick'
    [reference_id]   INT            NULL,
    [created_at]     DATETIME       NOT NULL CONSTRAINT [DF_stock_movements_created_at] DEFAULT (GETDATE()),
    CONSTRAINT [PK_stock_movements] PRIMARY KEY CLUSTERED ([id] ASC),
    CONSTRAINT [FK_sm_product]  FOREIGN KEY ([product_id])  REFERENCES [products]([id]),
    CONSTRAINT [FK_sm_location] FOREIGN KEY ([location_id]) REFERENCES [locations]([id])
  )
  PRINT 'Δημιουργήθηκε: stock_movements'
END
GO

-- ============================================================
-- receipts
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'receipts')
BEGIN
  CREATE TABLE [dbo].[receipts] (
    [id]              INT           IDENTITY(1,1) NOT NULL,
    [entersoft_po_id] VARCHAR(100)  NULL,
    [supplier_name]   NVARCHAR(200) NULL,
    [created_by]      NVARCHAR(100) NULL,
    [status]          VARCHAR(20)   NOT NULL CONSTRAINT [DF_receipts_status] DEFAULT ('open'),
    [created_at]      DATETIME      NOT NULL CONSTRAINT [DF_receipts_created_at] DEFAULT (GETDATE()),
    [completed_at]    DATETIME      NULL,
    CONSTRAINT [PK_receipts] PRIMARY KEY CLUSTERED ([id] ASC)
  )
  PRINT 'Δημιουργήθηκε: receipts'
END
GO

-- ============================================================
-- receipt_items
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'receipt_items')
BEGIN
  CREATE TABLE [dbo].[receipt_items] (
    [id]           INT            IDENTITY(1,1) NOT NULL,
    [receipt_id]   INT            NOT NULL,
    [product_id]   INT            NULL,
    [expected_qty] DECIMAL(10, 3) NOT NULL CONSTRAINT [DF_ri_expected_qty] DEFAULT (0),
    [received_qty] DECIMAL(10, 3) NOT NULL CONSTRAINT [DF_ri_received_qty] DEFAULT (0),
    [location_id]  INT            NULL,
    [scanned_at]   DATETIME       NULL,
    CONSTRAINT [PK_receipt_items] PRIMARY KEY CLUSTERED ([id] ASC),
    CONSTRAINT [FK_ri_receipt]  FOREIGN KEY ([receipt_id])  REFERENCES [receipts]([id]),
    CONSTRAINT [FK_ri_product]  FOREIGN KEY ([product_id])  REFERENCES [products]([id]),
    CONSTRAINT [FK_ri_location] FOREIGN KEY ([location_id]) REFERENCES [locations]([id])
  )
  PRINT 'Δημιουργήθηκε: receipt_items'
END
GO

-- ============================================================
-- pickings
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'pickings')
BEGIN
  CREATE TABLE [dbo].[pickings] (
    [id]               INT           IDENTITY(1,1) NOT NULL,
    [entersoft_so_id]  VARCHAR(100)  NOT NULL,
    [customer_name]    NVARCHAR(200) NULL,
    [transporter]      NVARCHAR(100) NULL,
    [order_type]       VARCHAR(20)   NOT NULL CONSTRAINT [DF_pickings_order_type] DEFAULT ('courier'),
    [voucher_qty]      INT           NOT NULL CONSTRAINT [DF_pickings_voucher_qty] DEFAULT (1),
    [invoice_date]     DATETIME      NULL,
    [print_date]       DATETIME      NULL,
    [status]           VARCHAR(20)   NOT NULL CONSTRAINT [DF_pickings_status] DEFAULT ('open'),
    [created_at]       DATETIME      NOT NULL CONSTRAINT [DF_pickings_created_at] DEFAULT (GETDATE()),
    [completed_at]     DATETIME      NULL,
    CONSTRAINT [PK_pickings] PRIMARY KEY CLUSTERED ([id] ASC),
    CONSTRAINT [UQ_pickings_so_id] UNIQUE ([entersoft_so_id])
  )
  PRINT 'Δημιουργήθηκε: pickings'
END
GO

-- ============================================================
-- picking_items
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'picking_items')
BEGIN
  CREATE TABLE [dbo].[picking_items] (
    [id]           INT            IDENTITY(1,1) NOT NULL,
    [picking_id]   INT            NOT NULL,
    [product_id]   INT            NULL,
    [sku]          VARCHAR(100)   NULL,
    [location_id]  INT            NULL,
    [required_qty] DECIMAL(10, 3) NOT NULL CONSTRAINT [DF_pi_required_qty] DEFAULT (0),
    [picked_qty]   DECIMAL(10, 3) NOT NULL CONSTRAINT [DF_pi_picked_qty]   DEFAULT (0),
    [scanned_at]   DATETIME       NULL,
    CONSTRAINT [PK_picking_items] PRIMARY KEY CLUSTERED ([id] ASC),
    CONSTRAINT [FK_pi_picking]  FOREIGN KEY ([picking_id])  REFERENCES [pickings]([id]),
    CONSTRAINT [FK_pi_product]  FOREIGN KEY ([product_id])  REFERENCES [products]([id]),
    CONSTRAINT [FK_pi_location] FOREIGN KEY ([location_id]) REFERENCES [locations]([id])
  )
  PRINT 'Δημιουργήθηκε: picking_items'
END
GO

PRINT '=== Ολοκλήρωση δημιουργίας πινάκων ==='
