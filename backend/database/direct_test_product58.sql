-- Direct test of the exact query used in routes.js for ProductID 58
-- This will show what the query actually returns

SELECT 
    p.ProductID,
    p.Name,
    p.StockQuantity,
    -- This is the EXACT query from routes.js
    CAST(COALESCE(
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
        -- Use JOIN result
        COALESCE(ip.AvailableQuantity, 0),
        -- Final fallback
        p.StockQuantity,
        0
    ) AS INT) as AvailableStock,
    -- Show what each subquery returns
    (SELECT TOP 1 ip_pid.AvailableQuantity
     FROM InventoryProducts ip_pid 
     WHERE ip_pid.ProductID = p.ProductID 
       AND ip_pid.IsActive = 1
     ORDER BY ip_pid.InventoryProductID) as Subquery1_ProductID,
    (SELECT TOP 1 ip_iid.AvailableQuantity
     FROM InventoryProducts ip_iid 
     WHERE ip_iid.InventoryProductID = p.ProductID 
       AND ip_iid.IsActive = 1
     ORDER BY ip_iid.InventoryProductID) as Subquery2_InventoryProductID,
    ip.AvailableQuantity as JOIN_Result,
    ip.ProductID as JOIN_ProductID,
    ip.InventoryProductID as JOIN_InventoryProductID
FROM Products p
LEFT JOIN InventoryProducts ip ON ip.ProductID = p.ProductID AND ip.IsActive = 1
WHERE p.ProductID = 58
  AND p.IsActive = 1;

-- Expected: AvailableStock should be 22
-- If it's 21, one of the subqueries is returning NULL when it shouldn't

