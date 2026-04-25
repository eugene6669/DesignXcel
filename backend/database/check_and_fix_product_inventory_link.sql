-- Check and fix the link between Products and InventoryProducts
-- This script helps diagnose and fix syncing issues

-- Step 1: Check if ProductID column exists in InventoryProducts
IF EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'InventoryProducts'
    AND COLUMN_NAME = 'ProductID'
)
BEGIN
    PRINT 'ProductID column exists in InventoryProducts.';
    
    -- Show current links
    PRINT 'Current links between Products and InventoryProducts:';
    SELECT 
        p.ProductID as Products_ProductID,
        p.Name as ProductName,
        ip.InventoryProductID,
        ip.ProductID as InventoryProducts_ProductID,
        ip.Name as InventoryProductName,
        ip.AvailableQuantity,
        CASE 
            WHEN ip.ProductID = p.ProductID THEN 'LINKED'
            ELSE 'NOT LINKED'
        END as LinkStatus
    FROM Products p
    LEFT JOIN InventoryProducts ip ON ip.ProductID = p.ProductID
    WHERE p.IsActive = 1
    ORDER BY p.ProductID;
    
    -- Link products by name if not already linked
    UPDATE ip
    SET ip.ProductID = p.ProductID
    FROM InventoryProducts ip
    INNER JOIN Products p ON ip.Name = p.Name
    WHERE ip.ProductID IS NULL
      AND p.IsActive = 1
      AND ip.IsActive = 1;
    
    DECLARE @linkedCount INT;
    SELECT @linkedCount = @@ROWCOUNT;
    PRINT 'Linked ' + CAST(@linkedCount AS VARCHAR(10)) + ' products by name.';
END
ELSE
BEGIN
    PRINT 'ProductID column does NOT exist in InventoryProducts.';
    PRINT 'Please run add_productid_to_inventory_products.sql first.';
END
GO

-- Step 2: Show products that should be linked but aren't
PRINT '';
PRINT 'Products that might need linking (same name):';
SELECT 
    p.ProductID,
    p.Name as ProductName,
    p.StockQuantity as Products_Stock,
    ip.InventoryProductID,
    ip.Name as InventoryProductName,
    ip.AvailableQuantity as Inventory_Available
FROM Products p
LEFT JOIN InventoryProducts ip ON ip.Name = p.Name
WHERE p.IsActive = 1
  AND ip.IsActive = 1
  AND (
    -- Check if ProductID column exists
    NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'InventoryProducts' AND COLUMN_NAME = 'ProductID')
    OR
    -- Or if ProductID column exists but is not linked
    (EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_NAME = 'InventoryProducts' AND COLUMN_NAME = 'ProductID')
     AND (ip.ProductID IS NULL OR ip.ProductID != p.ProductID))
  )
ORDER BY p.Name;
GO

PRINT '';
PRINT 'Diagnostic script completed.';

