-- Update ProductInventory table to support InventoryProductID
-- This allows ProductInventory to reference either Products or InventoryProducts

-- Add InventoryProductID column if it doesn't exist
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'ProductInventory' 
    AND COLUMN_NAME = 'InventoryProductID'
)
BEGIN
    ALTER TABLE [dbo].[ProductInventory]
    ADD InventoryProductID INT NULL;
    
    PRINT 'Added InventoryProductID column to ProductInventory table.';
END
ELSE
BEGIN
    PRINT 'InventoryProductID column already exists in ProductInventory table.';
END
GO

-- Add foreign key constraint for InventoryProductID if it doesn't exist
IF EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'ProductInventory' 
    AND COLUMN_NAME = 'InventoryProductID'
)
AND NOT EXISTS (
    SELECT * FROM sys.foreign_keys 
    WHERE name = 'FK_ProductInventory_InventoryProductID'
)
BEGIN
    ALTER TABLE [dbo].[ProductInventory]
    ADD CONSTRAINT FK_ProductInventory_InventoryProductID 
    FOREIGN KEY (InventoryProductID) REFERENCES InventoryProducts(InventoryProductID);
    
    PRINT 'Added foreign key constraint for InventoryProductID.';
END
ELSE
BEGIN
    PRINT 'Foreign key constraint for InventoryProductID already exists or column does not exist.';
END
GO

-- Add index for InventoryProductID if it doesn't exist
IF EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'ProductInventory' 
    AND COLUMN_NAME = 'InventoryProductID'
)
AND NOT EXISTS (
    SELECT * FROM sys.indexes 
    WHERE name = 'IX_ProductInventory_InventoryProductID' 
    AND object_id = OBJECT_ID('dbo.ProductInventory')
)
BEGIN
    CREATE INDEX IX_ProductInventory_InventoryProductID ON ProductInventory(InventoryProductID);
    
    PRINT 'Added index for InventoryProductID.';
END
ELSE
BEGIN
    PRINT 'Index for InventoryProductID already exists or column does not exist.';
END
GO

-- Make ProductID nullable if it's not already
IF EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'ProductInventory' 
    AND COLUMN_NAME = 'ProductID'
    AND IS_NULLABLE = 'NO'
)
BEGIN
    -- First, drop the NOT NULL constraint by altering the column
    ALTER TABLE [dbo].[ProductInventory]
    ALTER COLUMN ProductID INT NULL;
    
    PRINT 'Made ProductID nullable in ProductInventory table.';
END
ELSE
BEGIN
    PRINT 'ProductID is already nullable or does not exist.';
END
GO

-- Add check constraint to ensure only one product reference exists
IF NOT EXISTS (
    SELECT * FROM sys.check_constraints 
    WHERE name = 'CK_ProductInventory_ProductReference'
)
AND EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'ProductInventory' 
    AND COLUMN_NAME = 'InventoryProductID'
)
BEGIN
    ALTER TABLE [dbo].[ProductInventory]
    ADD CONSTRAINT CK_ProductInventory_ProductReference CHECK (
        (ProductID IS NOT NULL AND InventoryProductID IS NULL) OR 
        (ProductID IS NULL AND InventoryProductID IS NOT NULL)
    );
    
    PRINT 'Added check constraint to ensure only one product reference exists.';
END
ELSE
BEGIN
    PRINT 'Check constraint already exists or InventoryProductID column does not exist.';
END
GO

