-- Test script to verify product-inventory linking and stock sync
-- Run this to see what's happening with the links

PRINT '=== Testing Product-Inventory Linking ===';
PRINT '';

-- Check if ProductID column exists
IF EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'InventoryProducts'
    AND COLUMN_NAME = 'ProductID'
)
BEGIN
    PRINT '✓ ProductID column EXISTS in InventoryProducts';
    PRINT '';
    
    -- Show all linked products
    PRINT 'Linked Products (via ProductID):';
    SELECT 
        p.ProductID,
        p.Name as ProductName,
        p.StockQuantity as Products_Stock,
        ip.InventoryProductID,
        ip.ProductID as InventoryProducts_ProductID,
        ip.Name as InventoryProductName,
        ip.AvailableQuantity as Inventory_Available,
        CASE 
            WHEN ip.ProductID = p.ProductID THEN '✓ LINKED'
            ELSE '✗ NOT LINKED'
        END as LinkStatus
    FROM Products p
    LEFT JOIN InventoryProducts ip ON ip.ProductID = p.ProductID
    WHERE p.IsActive = 1
    ORDER BY p.ProductID;
    
    PRINT '';
    PRINT 'Products that should be linked but are NOT:';
    SELECT 
        p.ProductID,
        p.Name as ProductName,
        p.StockQuantity as Products_Stock
    FROM Products p
    WHERE p.IsActive = 1
      AND NOT EXISTS (
          SELECT 1 FROM InventoryProducts ip 
          WHERE ip.ProductID = p.ProductID AND ip.IsActive = 1
      );
END
ELSE
BEGIN
    PRINT '✗ ProductID column does NOT exist in InventoryProducts';
    PRINT 'Please run: add_productid_to_inventory_products.sql';
    PRINT '';
    
    -- Show products that might need linking by name
    PRINT 'Potential links (by name):';
    SELECT 
        p.ProductID,
        p.Name as ProductName,
        p.StockQuantity as Products_Stock,
        ip.InventoryProductID,
        ip.Name as InventoryProductName,
        ip.AvailableQuantity as Inventory_Available
    FROM Products p
    INNER JOIN InventoryProducts ip ON ip.Name = p.Name
    WHERE p.IsActive = 1 AND ip.IsActive = 1
    ORDER BY p.Name;
END
GO

PRINT '';
PRINT '=== Test Complete ===';

