-- Product workflow: planned (Products Listing) → built (Inventory) → storefront (Storefront page)
IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'dbo.InventoryProducts') AND name = 'ListingStage'
)
BEGIN
    ALTER TABLE dbo.InventoryProducts
    ADD ListingStage NVARCHAR(20) NOT NULL
        CONSTRAINT DF_InventoryProducts_ListingStage DEFAULT ('built');
END
GO

UPDATE dbo.InventoryProducts
SET ListingStage = 'built'
WHERE ListingStage IS NULL OR ListingStage = '';
GO

-- Rows with no variations yet are treated as planned listings
UPDATE ip
SET ip.ListingStage = 'planned'
FROM dbo.InventoryProducts ip
WHERE ip.IsActive = 1
  AND ip.ListingStage = 'built'
  AND NOT EXISTS (
      SELECT 1 FROM dbo.InventoryProductVariations v
      WHERE v.InventoryProductID = ip.InventoryProductID AND v.IsActive = 1
  );
GO
