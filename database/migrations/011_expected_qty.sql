-- Προσθήκη expected_qty σε receipt_items για παραλαβές βάσει αναμονής προμηθευτή
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='receipt_items' AND COLUMN_NAME='expected_qty')
  ALTER TABLE receipt_items ADD expected_qty DECIMAL(10,2) NULL;
