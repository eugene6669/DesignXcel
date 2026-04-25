-- Update InventoryProductVariations table to support both InventoryProducts and Products tables
-- Add ProductID column and update constraints

-- Add ProductID column if it doesn't exist
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'InventoryProductVariations'
    AND COLUMN_NAME = 'ProductID'
)
BEGIN
    ALTER TABLE [dbo].[InventoryProductVariations]
    ADD ProductID INT NULL;
    PRINT 'ProductID column added to InventoryProductVariations table.';
END
ELSE
BEGIN
    PRINT 'ProductID column already exists in InventoryProductVariations table.';
END
GO

-- Add foreign key constraint for ProductID if it doesn't exist
IF NOT EXISTS (
    SELECT * FROM sys.foreign_keys
    WHERE name = 'FK_InventoryProductVariations_ProductID'
)
BEGIN
    ALTER TABLE [dbo].[InventoryProductVariations]
    ADD CONSTRAINT FK_InventoryProductVariations_ProductID 
        FOREIGN KEY (ProductID) 
        REFERENCES Products(ProductID) 
        ON DELETE CASCADE;
    PRINT 'Foreign key constraint FK_InventoryProductVariations_ProductID added.';
END
ELSE
BEGIN
    PRINT 'Foreign key constraint FK_InventoryProductVariations_ProductID already exists.';
END
GO

-- Add CHECK constraint to ensure only one of ProductID or InventoryProductID is set
IF NOT EXISTS (
    SELECT * FROM sys.check_constraints
    WHERE name = 'CK_InventoryProductVariations_ProductReference'
)
BEGIN
    ALTER TABLE [dbo].[InventoryProductVariations]
    ADD CONSTRAINT CK_InventoryProductVariations_ProductReference
        CHECK (
            (ProductID IS NOT NULL AND InventoryProductID IS NULL) OR
            (ProductID IS NULL AND InventoryProductID IS NOT NULL)
        );
    PRINT 'CHECK constraint CK_InventoryProductVariations_ProductReference added.';
END
ELSE
BEGIN
    PRINT 'CHECK constraint CK_InventoryProductVariations_ProductReference already exists.';
END
GO

-- Add index for ProductID
IF NOT EXISTS (
    SELECT * FROM sys.indexes
    WHERE name = 'IX_InventoryProductVariations_ProductID'
)
BEGIN
    CREATE INDEX IX_InventoryProductVariations_ProductID ON InventoryProductVariations(ProductID);
    PRINT 'Index IX_InventoryProductVariations_ProductID created.';
END
ELSE
BEGIN
    PRINT 'Index IX_InventoryProductVariations_ProductID already exists.';
END
GO

