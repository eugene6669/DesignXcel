-- ListingStage on InventoryProducts supports: planned | built | retail
-- planned  = catalog-only (Products Listing), no stock
-- built    = manufactured in inventory (materials consumed on build)
-- retail     = buy-to-sell, stock added directly, no raw materials

-- No schema change required (ListingStage is NVARCHAR(20)).
-- This script documents the retail value and ensures the column exists.

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

PRINT 'ListingStage supports: planned, built, retail';
GO
