-- Quick test: Check if ProductID 58 will sync correctly
-- This tests the exact query logic

SELECT 
    p.ProductID,
    p.Name,
    p.StockQuantity as Products_Stock,
    -- Subquery (primary method)
    (SELECT TOP 1 ip.AvailableQuantity
     FROM InventoryProducts ip 
     WHERE ip.ProductID = p.ProductID 
       AND ip.IsActive = 1) as Inventory_Available,
    -- Expected result
    COALESCE(
        (SELECT TOP 1 ip.AvailableQuantity
         FROM InventoryProducts ip 
         WHERE ip.ProductID = p.ProductID 
           AND ip.IsActive = 1),
        p.StockQuantity,
        0
    ) as Should_Show_This,
    -- Current Products.StockQuantity (what it might be showing)
    p.StockQuantity as Currently_Showing
FROM Products p
WHERE p.ProductID = 58
  AND p.IsActive = 1;

-- Expected: Should_Show_This should be 22, not 21
-- If Currently_Showing is 21, the query is not working

