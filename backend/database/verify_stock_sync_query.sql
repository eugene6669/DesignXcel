-- Verify the stock sync query for a specific product
-- Replace @ProductID with the actual ProductID you want to test (e.g., 58)

DECLARE @ProductID INT = 58; -- Change this to test different products

PRINT 'Testing stock sync query for ProductID: ' + CAST(@ProductID AS VARCHAR(10));
PRINT '';

-- Test the exact query logic used in the Products page
SELECT 
    p.ProductID,
    p.Name as ProductName,
    p.StockQuantity as Products_StockQuantity,
    -- This is the exact query from routes.js
    COALESCE(
        -- Primary: Check via ProductID link
        (SELECT TOP 1 COALESCE(ip_pid.AvailableQuantity, 0)
         FROM InventoryProducts ip_pid 
         WHERE ip_pid.ProductID = p.ProductID 
           AND ip_pid.IsActive = 1
         ORDER BY ip_pid.InventoryProductID),
        -- Fallback: Check via InventoryProductID
        (SELECT TOP 1 COALESCE(ip_iid.AvailableQuantity, 0)
         FROM InventoryProducts ip_iid 
         WHERE ip_iid.InventoryProductID = p.ProductID 
           AND ip_iid.IsActive = 1
         ORDER BY ip_iid.InventoryProductID),
        -- Final fallback
        p.StockQuantity,
        0
    ) as Calculated_AvailableStock,
    -- Show what the subquery finds
    (SELECT TOP 1 ip_pid.AvailableQuantity
     FROM InventoryProducts ip_pid 
     WHERE ip_pid.ProductID = p.ProductID 
       AND ip_pid.IsActive = 1
     ORDER BY ip_pid.InventoryProductID) as Subquery_Result,
    -- Show linked inventory product
    ip.InventoryProductID,
    ip.ProductID as InventoryProducts_ProductID,
    ip.AvailableQuantity as Inventory_AvailableQuantity
FROM Products p
LEFT JOIN InventoryProducts ip ON ip.ProductID = p.ProductID AND ip.IsActive = 1
WHERE p.ProductID = @ProductID
  AND p.IsActive = 1;

PRINT '';
PRINT 'Expected: Calculated_AvailableStock should equal Inventory_AvailableQuantity (22)';
PRINT 'If it shows Products_StockQuantity (21), the subquery is not finding the linked product.';

