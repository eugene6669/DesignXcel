-- Per-variation 3D model and thumbnail gallery (inventory + CMS)

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'InventoryProductVariations' AND COLUMN_NAME = 'Model3D'
)
BEGIN
    ALTER TABLE [dbo].[InventoryProductVariations] ADD Model3D NVARCHAR(500) NULL;
    PRINT 'Added Model3D to InventoryProductVariations';
END
GO

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'InventoryProductVariations' AND COLUMN_NAME = 'ThumbnailURLs'
)
BEGIN
    ALTER TABLE [dbo].[InventoryProductVariations] ADD ThumbnailURLs NVARCHAR(MAX) NULL;
    PRINT 'Added ThumbnailURLs to InventoryProductVariations';
END
GO

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'ProductVariations' AND COLUMN_NAME = 'Model3D'
)
BEGIN
    ALTER TABLE [dbo].[ProductVariations] ADD Model3D NVARCHAR(500) NULL;
    PRINT 'Added Model3D to ProductVariations';
END
GO

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'ProductVariations' AND COLUMN_NAME = 'ThumbnailURLs'
)
BEGIN
    ALTER TABLE [dbo].[ProductVariations] ADD ThumbnailURLs NVARCHAR(MAX) NULL;
    PRINT 'Added ThumbnailURLs to ProductVariations';
END
GO
