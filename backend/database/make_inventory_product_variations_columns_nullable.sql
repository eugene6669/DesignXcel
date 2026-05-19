-- Make InventoryProductID nullable to support both ProductID and InventoryProductID
-- The CHECK constraint ensures only one is set

-- Make InventoryProductID nullable
IF EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'InventoryProductVariations'
    AND COLUMN_NAME = 'InventoryProductID'
    AND IS_NULLABLE = 'NO'
)
BEGIN
    ALTER TABLE [dbo].[InventoryProductVariations]
    ALTER COLUMN InventoryProductID INT NULL;
    PRINT 'InventoryProductID column made nullable.';
END
ELSE
BEGIN
    PRINT 'InventoryProductID column is already nullable or does not exist.';
END
GO

-- Verify the CHECK constraint exists (it should ensure only one is set)
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

