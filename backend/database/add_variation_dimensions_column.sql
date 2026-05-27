-- Per-variation dimensions (L × W × H in cm), stored as JSON on InventoryProductVariations
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.InventoryProductVariations') AND name = 'Dimensions'
)
BEGIN
    ALTER TABLE dbo.InventoryProductVariations ADD Dimensions NVARCHAR(MAX) NULL;
    PRINT 'Added Dimensions to InventoryProductVariations';
END
GO
