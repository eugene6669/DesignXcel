-- Add inventory tracking columns to InventoryProducts table
-- This replaces the need for a separate ProductInventory table

-- Add inventory status columns if they don't exist
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'InventoryProducts'
    AND COLUMN_NAME = 'AvailableQuantity'
)
BEGIN
    ALTER TABLE [dbo].[InventoryProducts]
    ADD AvailableQuantity INT NOT NULL DEFAULT 0;
    PRINT 'AvailableQuantity column added to InventoryProducts table.';
END
ELSE
BEGIN
    PRINT 'AvailableQuantity column already exists in InventoryProducts table.';
END
GO

IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'InventoryProducts'
    AND COLUMN_NAME = 'DamagedQuantity'
)
BEGIN
    ALTER TABLE [dbo].[InventoryProducts]
    ADD DamagedQuantity INT NOT NULL DEFAULT 0;
    PRINT 'DamagedQuantity column added to InventoryProducts table.';
END
ELSE
BEGIN
    PRINT 'DamagedQuantity column already exists in InventoryProducts table.';
END
GO

IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'InventoryProducts'
    AND COLUMN_NAME = 'ReturnedQuantity'
)
BEGIN
    ALTER TABLE [dbo].[InventoryProducts]
    ADD ReturnedQuantity INT NOT NULL DEFAULT 0;
    PRINT 'ReturnedQuantity column added to InventoryProducts table.';
END
ELSE
BEGIN
    PRINT 'ReturnedQuantity column already exists in InventoryProducts table.';
END
GO

IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'InventoryProducts'
    AND COLUMN_NAME = 'RepairedQuantity'
)
BEGIN
    ALTER TABLE [dbo].[InventoryProducts]
    ADD RepairedQuantity INT NOT NULL DEFAULT 0;
    PRINT 'RepairedQuantity column added to InventoryProducts table.';
END
ELSE
BEGIN
    PRINT 'RepairedQuantity column already exists in InventoryProducts table.';
END
GO

IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'InventoryProducts'
    AND COLUMN_NAME = 'DisposedQuantity'
)
BEGIN
    ALTER TABLE [dbo].[InventoryProducts]
    ADD DisposedQuantity INT NOT NULL DEFAULT 0;
    PRINT 'DisposedQuantity column added to InventoryProducts table.';
END
ELSE
BEGIN
    PRINT 'DisposedQuantity column already exists in InventoryProducts table.';
END
GO

IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'InventoryProducts'
    AND COLUMN_NAME = 'InventoryStatus'
)
BEGIN
    ALTER TABLE [dbo].[InventoryProducts]
    ADD InventoryStatus NVARCHAR(50) NULL DEFAULT 'available';
    PRINT 'InventoryStatus column added to InventoryProducts table.';
END
ELSE
BEGIN
    PRINT 'InventoryStatus column already exists in InventoryProducts table.';
END
GO

IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'InventoryProducts'
    AND COLUMN_NAME = 'InventoryNotes'
)
BEGIN
    ALTER TABLE [dbo].[InventoryProducts]
    ADD InventoryNotes NVARCHAR(MAX) NULL;
    PRINT 'InventoryNotes column added to InventoryProducts table.';
END
ELSE
BEGIN
    PRINT 'InventoryNotes column already exists in InventoryProducts table.';
END
GO

-- Note: Data migration from ProductInventory will be handled separately
-- This script only adds the columns to InventoryProducts

