-- Add status quantity columns to InventoryProductVariations table
-- These columns track the status breakdown of variation quantities

-- Add AvailableQuantity column if it doesn't exist
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'InventoryProductVariations'
    AND COLUMN_NAME = 'AvailableQuantity'
)
BEGIN
    ALTER TABLE [dbo].[InventoryProductVariations]
    ADD AvailableQuantity INT NOT NULL DEFAULT 0;
    PRINT 'AvailableQuantity column added to InventoryProductVariations table.';
END
ELSE
BEGIN
    PRINT 'AvailableQuantity column already exists in InventoryProductVariations table.';
END
GO

-- Add DamagedQuantity column if it doesn't exist
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'InventoryProductVariations'
    AND COLUMN_NAME = 'DamagedQuantity'
)
BEGIN
    ALTER TABLE [dbo].[InventoryProductVariations]
    ADD DamagedQuantity INT NOT NULL DEFAULT 0;
    PRINT 'DamagedQuantity column added to InventoryProductVariations table.';
END
ELSE
BEGIN
    PRINT 'DamagedQuantity column already exists in InventoryProductVariations table.';
END
GO

-- Add ReturnedQuantity column if it doesn't exist
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'InventoryProductVariations'
    AND COLUMN_NAME = 'ReturnedQuantity'
)
BEGIN
    ALTER TABLE [dbo].[InventoryProductVariations]
    ADD ReturnedQuantity INT NOT NULL DEFAULT 0;
    PRINT 'ReturnedQuantity column added to InventoryProductVariations table.';
END
ELSE
BEGIN
    PRINT 'ReturnedQuantity column already exists in InventoryProductVariations table.';
END
GO

-- Add RepairedQuantity column if it doesn't exist
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'InventoryProductVariations'
    AND COLUMN_NAME = 'RepairedQuantity'
)
BEGIN
    ALTER TABLE [dbo].[InventoryProductVariations]
    ADD RepairedQuantity INT NOT NULL DEFAULT 0;
    PRINT 'RepairedQuantity column added to InventoryProductVariations table.';
END
ELSE
BEGIN
    PRINT 'RepairedQuantity column already exists in InventoryProductVariations table.';
END
GO

-- Add DisposedQuantity column if it doesn't exist
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'InventoryProductVariations'
    AND COLUMN_NAME = 'DisposedQuantity'
)
BEGIN
    ALTER TABLE [dbo].[InventoryProductVariations]
    ADD DisposedQuantity INT NOT NULL DEFAULT 0;
    PRINT 'DisposedQuantity column added to InventoryProductVariations table.';
END
ELSE
BEGIN
    PRINT 'DisposedQuantity column already exists in InventoryProductVariations table.';
END
GO

-- Add Notes column if it doesn't exist
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'InventoryProductVariations'
    AND COLUMN_NAME = 'Notes'
)
BEGIN
    ALTER TABLE [dbo].[InventoryProductVariations]
    ADD Notes NVARCHAR(MAX) NULL;
    PRINT 'Notes column added to InventoryProductVariations table.';
END
ELSE
BEGIN
    PRINT 'Notes column already exists in InventoryProductVariations table.';
END
GO

-- Initialize existing variations: Set AvailableQuantity = Quantity, others = 0
UPDATE [dbo].[InventoryProductVariations]
SET AvailableQuantity = Quantity,
    DamagedQuantity = 0,
    ReturnedQuantity = 0,
    RepairedQuantity = 0,
    DisposedQuantity = 0
WHERE AvailableQuantity = 0 AND DamagedQuantity = 0 AND ReturnedQuantity = 0 
  AND RepairedQuantity = 0 AND DisposedQuantity = 0;
GO

PRINT 'Status columns added to InventoryProductVariations table successfully.';

