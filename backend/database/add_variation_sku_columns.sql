-- SKU on variations only (parent InventoryProducts / catalog Products have no SKU)
-- Fixes Msg 2627: UNIQUE on InventoryProducts.SKU allows only one NULL in SQL Server

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'InventoryProductVariations' AND COLUMN_NAME = 'SKU'
)
BEGIN
    ALTER TABLE [dbo].[InventoryProductVariations] ADD SKU NVARCHAR(100) NULL;
    PRINT 'Added SKU to InventoryProductVariations';
END
GO

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'ProductVariations' AND COLUMN_NAME = 'SKU'
)
BEGIN
    ALTER TABLE [dbo].[ProductVariations] ADD SKU NVARCHAR(100) NULL;
    PRINT 'Added SKU to ProductVariations';
END
GO

-- Drop parent UNIQUE(SKU) — multiple NULL parent rows are required
IF EXISTS (
    SELECT 1 FROM sys.key_constraints
    WHERE name = N'UQ_InventoryProducts_SKU' AND parent_object_id = OBJECT_ID(N'dbo.InventoryProducts')
)
BEGIN
    ALTER TABLE [dbo].[InventoryProducts] DROP CONSTRAINT UQ_InventoryProducts_SKU;
    PRINT 'Dropped UQ_InventoryProducts_SKU';
END
GO

IF EXISTS (
    SELECT 1 FROM sys.key_constraints
    WHERE name = N'UQ_Products_SKU' AND parent_object_id = OBJECT_ID(N'dbo.Products')
)
BEGIN
    ALTER TABLE [dbo].[Products] DROP CONSTRAINT UQ_Products_SKU;
    PRINT 'Dropped UQ_Products_SKU';
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_Products_SKU_NotNull' AND object_id = OBJECT_ID(N'dbo.Products')
)
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX UX_Products_SKU_NotNull
    ON [dbo].[Products](SKU) WHERE SKU IS NOT NULL;
    PRINT 'Created UX_Products_SKU_NotNull';
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_InventoryProductVariations_SKU' AND object_id = OBJECT_ID(N'dbo.InventoryProductVariations')
)
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX UX_InventoryProductVariations_SKU
    ON [dbo].[InventoryProductVariations](SKU) WHERE SKU IS NOT NULL;
    PRINT 'Created UX_InventoryProductVariations_SKU';
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_ProductVariations_SKU' AND object_id = OBJECT_ID(N'dbo.ProductVariations')
)
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX UX_ProductVariations_SKU
    ON [dbo].[ProductVariations](SKU) WHERE SKU IS NOT NULL;
    PRINT 'Created UX_ProductVariations_SKU';
END
GO

-- Safe to clear parent SKUs after constraints are dropped
UPDATE [dbo].[InventoryProducts] SET SKU = NULL WHERE SKU IS NOT NULL;
GO

UPDATE p
SET p.SKU = NULL, p.UpdatedAt = GETDATE()
FROM [dbo].[Products] p
INNER JOIN [dbo].[InventoryProducts] ip ON ip.ProductID = p.ProductID AND ip.IsActive = 1
WHERE p.SKU IS NOT NULL;
GO

PRINT 'Variation SKU migration complete.';
