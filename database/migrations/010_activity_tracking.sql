-- Προσθήκη user tracking στις κινήσεις stock + index για queries
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='stock_movements' AND COLUMN_NAME='created_by')
  ALTER TABLE stock_movements ADD created_by INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_sm_created_at' AND object_id=OBJECT_ID('stock_movements'))
  CREATE INDEX idx_sm_created_at ON stock_movements(created_at DESC);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='idx_sm_user' AND object_id=OBJECT_ID('stock_movements'))
  CREATE INDEX idx_sm_user ON stock_movements(created_by);
