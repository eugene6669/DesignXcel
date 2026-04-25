-- Add status quantity columns to ProductInventory table for 1 row per product
-- This allows storing all status quantities in a single row instead of multiple rows

-- Add quantity columns for each status if they don't exist
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'ProductInventory' 
    AND COLUMN_NAME = 'AvailableQuantity'
)
BEGIN
    ALTER TABLE [dbo].[ProductInventory]
    ADD AvailableQuantity INT NOT NULL DEFAULT 0;
    
    PRINT 'AvailableQuantity column added.';
END
GO

IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'ProductInventory' 
    AND COLUMN_NAME = 'DamagedQuantity'
)
BEGIN
    ALTER TABLE [dbo].[ProductInventory]
    ADD DamagedQuantity INT NOT NULL DEFAULT 0;
    
    PRINT 'DamagedQuantity column added.';
END
GO

IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'ProductInventory' 
    AND COLUMN_NAME = 'ReturnedQuantity'
)
BEGIN
    ALTER TABLE [dbo].[ProductInventory]
    ADD ReturnedQuantity INT NOT NULL DEFAULT 0;
    
    PRINT 'ReturnedQuantity column added.';
END
GO

IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'ProductInventory' 
    AND COLUMN_NAME = 'RepairedQuantity'
)
BEGIN
    ALTER TABLE [dbo].[ProductInventory]
    ADD RepairedQuantity INT NOT NULL DEFAULT 0;
    
    PRINT 'RepairedQuantity column added.';
END
GO

IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'ProductInventory' 
    AND COLUMN_NAME = 'DisposedQuantity'
)
BEGIN
    ALTER TABLE [dbo].[ProductInventory]
    ADD DisposedQuantity INT NOT NULL DEFAULT 0;
    
    PRINT 'DisposedQuantity column added.';
END
GO

-- Consolidate existing rows into 1 row per product
-- This will aggregate quantities by status for each product
BEGIN TRANSACTION;

-- Create a temporary table with consolidated data
SELECT 
    CASE 
        WHEN ProductID IS NOT NULL THEN ProductID
        ELSE InventoryProductID
    END as ProductIdentifier,
    MAX(ProductID) as ProductID,
    MAX(InventoryProductID) as InventoryProductID,
    SUM(CASE WHEN InventoryStatus = 'available' THEN Quantity ELSE 0 END) as AvailableQty,
    SUM(CASE WHEN InventoryStatus = 'damaged' THEN Quantity ELSE 0 END) as DamagedQty,
    SUM(CASE WHEN InventoryStatus = 'returned' THEN Quantity ELSE 0 END) as ReturnedQty,
    SUM(CASE WHEN InventoryStatus = 'repaired' THEN Quantity ELSE 0 END) as RepairedQty,
    SUM(CASE WHEN InventoryStatus = 'disposed' THEN Quantity ELSE 0 END) as DisposedQty,
    MAX(ImageURL) as ImageURL,
    MAX(Dimensions) as Dimensions,
    MAX(Location) as Location,
    MAX(Notes) as Notes,
    MAX(DateAdded) as DateAdded,
    MAX(CreatedBy) as CreatedBy,
    MAX(UpdatedBy) as UpdatedBy
INTO #ConsolidatedInventory
FROM ProductInventory
WHERE IsActive = 1
GROUP BY 
    CASE 
        WHEN ProductID IS NOT NULL THEN ProductID
        ELSE InventoryProductID
    END;

-- Delete all existing rows
DELETE FROM ProductInventory WHERE IsActive = 1;

-- Insert consolidated rows
INSERT INTO ProductInventory 
    (ProductID, InventoryProductID, InventoryStatus, Quantity, AvailableQuantity, DamagedQuantity, ReturnedQuantity, RepairedQuantity, DisposedQuantity, ImageURL, Dimensions, Location, Notes, DateAdded, CreatedBy, UpdatedBy, IsActive)
SELECT 
    ProductID,
    InventoryProductID,
    CASE 
        WHEN AvailableQty > 0 THEN 'available'
        WHEN RepairedQty > 0 THEN 'repaired'
        WHEN DamagedQty > 0 THEN 'damaged'
        WHEN ReturnedQty > 0 THEN 'returned'
        WHEN DisposedQty > 0 THEN 'disposed'
        ELSE 'available'
    END as InventoryStatus,
    AvailableQty + RepairedQty as Quantity, -- Total = Available + Repaired
    AvailableQty,
    DamagedQty,
    ReturnedQty,
    RepairedQty,
    DisposedQty,
    ImageURL,
    Dimensions,
    Location,
    Notes,
    DateAdded,
    CreatedBy,
    UpdatedBy,
    1 as IsActive
FROM #ConsolidatedInventory;

-- Drop temporary table
DROP TABLE #ConsolidatedInventory;

COMMIT TRANSACTION;

PRINT 'ProductInventory consolidated to 1 row per product.';
GO

