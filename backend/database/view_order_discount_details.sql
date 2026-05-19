-- =============================================
-- View Detailed Discount Breakdown for a Specific Order
-- =============================================
-- This query shows item-by-item discount details for OrderID 1
-- =============================================

-- Detailed breakdown of discounts for OrderID 1
SELECT 
    o.OrderID,
    o.ReferenceNumber,
    o.OrderDate,
    o.Status,
    o.TotalAmount,
    
    -- Order Item Details
    oi.OrderItemID,
    p.ProductID,
    p.Name AS ProductName,
    p.Price AS ProductOriginalPrice,
    pv.VariationID,
    pv.VariationName,
    pv.Price AS VariationOriginalPrice,
    
    -- Price Information
    CASE 
        WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
        THEN pv.Price
        ELSE ISNULL(p.Price, 0)
    END AS OriginalPrice,
    
    oi.PriceAtPurchase,
    oi.Quantity,
    
    -- Discount Calculation
    CASE 
        WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
        THEN (pv.Price - oi.PriceAtPurchase)
        ELSE (ISNULL(p.Price, 0) - oi.PriceAtPurchase)
    END AS DiscountPerUnit,
    
    (
        CASE 
            WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
            THEN (pv.Price - oi.PriceAtPurchase)
            ELSE (ISNULL(p.Price, 0) - oi.PriceAtPurchase)
        END * oi.Quantity
    ) AS ItemTotalDiscount,
    
    -- Original total vs paid total
    (
        CASE 
            WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
            THEN pv.Price
            ELSE ISNULL(p.Price, 0)
        END * oi.Quantity
    ) AS OriginalItemTotal,
    
    (oi.PriceAtPurchase * oi.Quantity) AS PaidItemTotal,
    
    -- Active Discount Information
    pd.DiscountID,
    pd.DiscountType,
    pd.DiscountValue,
    pd.StartDate AS DiscountStartDate,
    pd.EndDate AS DiscountEndDate,
    CASE 
        WHEN pd.DiscountID IS NOT NULL THEN 'Yes'
        ELSE 'No'
    END AS HadActiveDiscount
    
FROM Orders o
INNER JOIN OrderItems oi ON o.OrderID = oi.OrderID
LEFT JOIN Products p ON oi.ProductID = p.ProductID
LEFT JOIN ProductVariations pv ON oi.VariationID = pv.VariationID
LEFT JOIN ProductDiscounts pd ON oi.ProductID = pd.ProductID
    AND pd.IsActive = 1
    AND o.OrderDate BETWEEN pd.StartDate AND pd.EndDate
WHERE o.OrderID = 1  -- Change this to the OrderID you want to view
ORDER BY oi.OrderItemID;
GO

-- =============================================
-- Summary for OrderID 1
-- =============================================
SELECT 
    o.OrderID,
    o.ReferenceNumber,
    o.OrderDate,
    o.Status,
    o.TotalAmount,
    
    -- Calculate totals
    SUM(
        CASE 
            WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
            THEN (pv.Price - oi.PriceAtPurchase) * oi.Quantity
            ELSE (ISNULL(p.Price, 0) - oi.PriceAtPurchase) * oi.Quantity
        END
    ) AS TotalDiscounts,
    
    SUM(oi.PriceAtPurchase * oi.Quantity) AS TotalPaid,
    
    SUM(
        CASE 
            WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
            THEN pv.Price * oi.Quantity
            ELSE ISNULL(p.Price, 0) * oi.Quantity
        END
    ) AS TotalOriginalPrice,
    
    COUNT(*) AS TotalItems,
    COUNT(CASE 
        WHEN (
            CASE 
                WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
                THEN pv.Price
                ELSE ISNULL(p.Price, 0)
            END
        ) > oi.PriceAtPurchase THEN 1 
    END) AS ItemsWithDiscounts,
    
    -- Verify calculation
    SUM(
        CASE 
            WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
            THEN pv.Price * oi.Quantity
            ELSE ISNULL(p.Price, 0) * oi.Quantity
        END
    ) - SUM(oi.PriceAtPurchase * oi.Quantity) AS DiscountVerification
    
FROM Orders o
INNER JOIN OrderItems oi ON o.OrderID = oi.OrderID
LEFT JOIN Products p ON oi.ProductID = p.ProductID
LEFT JOIN ProductVariations pv ON oi.VariationID = pv.VariationID
WHERE o.OrderID = 1  -- Change this to the OrderID you want to view
GROUP BY o.OrderID, o.ReferenceNumber, o.OrderDate, o.Status, o.TotalAmount;
GO

