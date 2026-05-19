-- Fix Product-Inventory Stock Sync
-- This script will:
-- 1. Add ProductID column if it doesn't exist
-- 2. Link existing products
-- 3. Verify the links

PRINT '=== Fixing Product-Inventory Stock Sync ===';
PRINT '';

-- Step 1: Add ProductID column if it doesn't exist
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'InventoryProducts'
    AND COLUMN_NAME = 'ProductID'
)
BEGIN
    PRINT 'Step 1: Adding ProductID column to InventoryProducts...';
    ALTER TABLE [dbo].[InventoryProducts]
    ADD ProductID INT NULL;
    
    IF OBJECT_ID('dbo.Products', 'U') IS NOT NULL
    BEGIN
        ALTER TABLE [dbo].[InventoryProducts]
        ADD CONSTRAINT FK_InventoryProducts_ProductID 
            FOREIGN KEY (ProductID) 
            REFERENCES Products(ProductID) 
            ON DELETE SET NULL;
        
        CREATE INDEX IX_InventoryProducts_ProductID ON InventoryProducts(ProductID);
        PRINT '✓ ProductID column and foreign key added.';
    END
    ELSE
    BEGIN
        PRINT '✓ ProductID column added (Products table not found, skipping foreign key).';
    END
END
ELSE
BEGIN
    PRINT 'Step 1: ProductID column already exists.';
END
GO

-- Step 2: Link products by name
PRINT '';
PRINT 'Step 2: Linking products by name...';
UPDATE ip
SET ip.ProductID = p.ProductID
FROM InventoryProducts ip
INNER JOIN Products p ON ip.Name = p.Name
WHERE ip.ProductID IS NULL
  AND p.IsActive = 1
  AND ip.IsActive = 1;

DECLARE @linkedCount INT;
SELECT @linkedCount = @@ROWCOUNT;
PRINT '✓ Linked ' + CAST(@linkedCount AS VARCHAR(10)) + ' products by name.';
GO

-- Step 3: Show current sync status
PRINT '';
PRINT 'Step 3: Current Product-Inventory Links:';
SELECT 
    p.ProductID,
    p.Name as ProductName,
    p.StockQuantity as Products_Stock,
    ip.InventoryProductID,
    ip.ProductID as InventoryProducts_ProductID,
    ip.AvailableQuantity as Inventory_Available,
    CASE 
        WHEN ip.ProductID = p.ProductID THEN '✓ SYNCED'
        WHEN ip.ProductID IS NULL THEN '✗ NOT LINKED'
        ELSE '✗ MISMATCH'
    END as SyncStatus
FROM Products p
LEFT JOIN InventoryProducts ip ON ip.ProductID = p.ProductID
WHERE p.IsActive = 1
ORDER BY p.ProductID;
GO

-- Step 4: Show products that need manual linking
PRINT '';
PRINT 'Step 4: Products that need manual linking (different names):';
SELECT 
    p.ProductID,
    p.Name as ProductName,
    p.StockQuantity as Products_Stock,
    ip.InventoryProductID,
    ip.Name as InventoryProductName,
    ip.AvailableQuantity as Inventory_Available
FROM Products p
CROSS JOIN InventoryProducts ip
WHERE p.IsActive = 1
  AND ip.IsActive = 1
  AND ip.ProductID IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM InventoryProducts ip2 
      WHERE ip2.ProductID = p.ProductID
  )
ORDER BY p.Name, ip.Name;
GO

PRINT '';
PRINT '=== Fix Complete ===';
PRINT 'After running this script, refresh the Products page to see synced stock.';

