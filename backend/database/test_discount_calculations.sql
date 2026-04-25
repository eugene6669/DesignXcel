-- =============================================
-- Test Script: Calculate Discounts for Orders
-- =============================================
-- This script demonstrates how to fetch and calculate discounts
-- from ProductDiscounts and Products tables for orders
-- =============================================

-- =============================================
-- 1. View ProductDiscounts Table Structure
-- =============================================
SELECT 
    pd.DiscountID,
    pd.ProductID,
    p.Name AS ProductName,
    pd.DiscountType,
    pd.DiscountValue,
    pd.StartDate,
    pd.EndDate,
    pd.IsActive,
    p.Price AS OriginalPrice
FROM ProductDiscounts pd
INNER JOIN Products p ON pd.ProductID = p.ProductID
WHERE pd.IsActive = 1
ORDER BY pd.ProductID, pd.StartDate DESC;
GO

-- =============================================
-- 2. Calculate Discounts for Recent Orders
-- =============================================
-- This query calculates discounts by comparing original price with purchase price
SELECT 
    o.OrderID,
    o.ReferenceNumber,
    o.OrderDate,
    o.Status,
    o.TotalAmount,
    
    -- Calculate total discounts for this order
    ISNULL((
        SELECT SUM(
            CASE 
                -- If variation exists and has price, use variation price
                WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
                THEN (pv.Price - oi.PriceAtPurchase) * oi.Quantity
                -- Otherwise use product price
                ELSE (ISNULL(p.Price, 0) - oi.PriceAtPurchase) * oi.Quantity
            END
        )
        FROM OrderItems oi
        LEFT JOIN Products p ON oi.ProductID = p.ProductID
        LEFT JOIN ProductVariations pv ON oi.VariationID = pv.VariationID
        WHERE oi.OrderID = o.OrderID
            -- Only count items where original price > purchase price (discount applied)
            AND (
                CASE 
                    WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
                    THEN pv.Price
                    ELSE ISNULL(p.Price, 0)
                END
            ) > oi.PriceAtPurchase
    ), 0) AS TotalDiscounts,
    
    -- Count items with discounts
    ISNULL((
        SELECT COUNT(*)
        FROM OrderItems oi
        LEFT JOIN Products p ON oi.ProductID = p.ProductID
        LEFT JOIN ProductVariations pv ON oi.VariationID = pv.VariationID
        WHERE oi.OrderID = o.OrderID
            AND (
                CASE 
                    WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
                    THEN pv.Price
                    ELSE ISNULL(p.Price, 0)
                END
            ) > oi.PriceAtPurchase
    ), 0) AS ItemsWithDiscounts
    
FROM Orders o
WHERE o.Status != 'Pending'
    AND o.OrderDate >= DATEADD(DAY, -30, GETDATE())  -- Last 30 days
ORDER BY o.OrderDate DESC;
GO

-- =============================================
-- 3. Detailed Discount Breakdown by Order Item
-- =============================================
SELECT 
    o.OrderID,
    o.OrderDate,
    oi.OrderItemID,
    p.Name AS ProductName,
    pv.VariationName,
    oi.Quantity,
    
    -- Original price
    CASE 
        WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
        THEN pv.Price
        ELSE ISNULL(p.Price, 0)
    END AS OriginalPrice,
    
    -- Price at purchase
    oi.PriceAtPurchase,
    
    -- Discount per unit
    CASE 
        WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
        THEN (pv.Price - oi.PriceAtPurchase)
        ELSE (ISNULL(p.Price, 0) - oi.PriceAtPurchase)
    END AS DiscountPerUnit,
    
    -- Total discount for this item
    (
        CASE 
            WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
            THEN (pv.Price - oi.PriceAtPurchase)
            ELSE (ISNULL(p.Price, 0) - oi.PriceAtPurchase)
        END * oi.Quantity
    ) AS TotalDiscount,
    
    -- Check if there was an active discount at time of purchase
    CASE 
        WHEN pd.DiscountID IS NOT NULL THEN 'Yes'
        ELSE 'No'
    END AS HadActiveDiscount,
    pd.DiscountType AS DiscountType,
    pd.DiscountValue AS DiscountValue
    
FROM Orders o
INNER JOIN OrderItems oi ON o.OrderID = oi.OrderID
LEFT JOIN Products p ON oi.ProductID = p.ProductID
LEFT JOIN ProductVariations pv ON oi.VariationID = pv.VariationID
LEFT JOIN ProductDiscounts pd ON oi.ProductID = pd.ProductID
    AND pd.IsActive = 1
    AND o.OrderDate BETWEEN pd.StartDate AND pd.EndDate
WHERE o.Status != 'Pending'
    AND o.OrderDate >= DATEADD(DAY, -30, GETDATE())  -- Last 30 days
    AND (
        CASE 
            WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
            THEN pv.Price
            ELSE ISNULL(p.Price, 0)
        END
    ) > oi.PriceAtPurchase  -- Only show items with discounts
ORDER BY o.OrderDate DESC, o.OrderID, oi.OrderItemID;
GO

-- =============================================
-- 4. Discount Summary by Date Range
-- =============================================
DECLARE @dateFrom DATE = DATEADD(DAY, -30, GETDATE());
DECLARE @dateTo DATE = GETDATE();

SELECT 
    COUNT(DISTINCT o.OrderID) AS TotalOrders,
    COUNT(DISTINCT CASE 
        WHEN discountData.TotalDiscount > 0 THEN o.OrderID 
    END) AS OrdersWithDiscounts,
    SUM(discountData.TotalDiscount) AS TotalDiscountsAmount,
    AVG(CASE 
        WHEN discountData.TotalDiscount > 0 THEN discountData.TotalDiscount 
    END) AS AverageDiscountPerOrder,
    MIN(discountData.TotalDiscount) AS MinDiscount,
    MAX(discountData.TotalDiscount) AS MaxDiscount
FROM Orders o
OUTER APPLY (
    SELECT SUM(
        CASE 
            WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
            THEN (pv.Price - oi.PriceAtPurchase) * oi.Quantity
            ELSE (ISNULL(p.Price, 0) - oi.PriceAtPurchase) * oi.Quantity
        END
    ) AS TotalDiscount
    FROM OrderItems oi
    LEFT JOIN Products p ON oi.ProductID = p.ProductID
    LEFT JOIN ProductVariations pv ON oi.VariationID = pv.VariationID
    WHERE oi.OrderID = o.OrderID
        AND (
            CASE 
                WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
                THEN pv.Price
                ELSE ISNULL(p.Price, 0)
            END
        ) > oi.PriceAtPurchase
) AS discountData
WHERE o.Status != 'Pending'
    AND CAST(o.OrderDate AS DATE) BETWEEN @dateFrom AND @dateTo;
GO

-- =============================================
-- 5. Products with Active Discounts
-- =============================================
SELECT 
    p.ProductID,
    p.Name AS ProductName,
    p.Price AS OriginalPrice,
    pd.DiscountType,
    pd.DiscountValue,
    CASE 
        WHEN pd.DiscountType = 'percentage' THEN 
            p.Price * (1 - pd.DiscountValue / 100)
        WHEN pd.DiscountType = 'fixed' THEN 
            p.Price - pd.DiscountValue
        ELSE p.Price
    END AS DiscountedPrice,
    CASE 
        WHEN pd.DiscountType = 'percentage' THEN 
            p.Price * (pd.DiscountValue / 100)
        WHEN pd.DiscountType = 'fixed' THEN 
            pd.DiscountValue
        ELSE 0
    END AS DiscountAmount,
    pd.StartDate,
    pd.EndDate,
    CASE 
        WHEN GETDATE() BETWEEN pd.StartDate AND pd.EndDate THEN 'Active'
        WHEN GETDATE() < pd.StartDate THEN 'Scheduled'
        ELSE 'Expired'
    END AS DiscountStatus
FROM Products p
INNER JOIN ProductDiscounts pd ON p.ProductID = pd.ProductID
WHERE pd.IsActive = 1
ORDER BY pd.StartDate DESC;
GO

-- =============================================
-- 6. Verify Discount Calculations
-- =============================================
-- This query helps verify that discount calculations are correct
-- by comparing calculated discounts with actual price differences
SELECT 
    o.OrderID,
    o.OrderDate,
    COUNT(*) AS ItemsInOrder,
    SUM(
        CASE 
            WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
            THEN (pv.Price - oi.PriceAtPurchase) * oi.Quantity
            ELSE (ISNULL(p.Price, 0) - oi.PriceAtPurchase) * oi.Quantity
        END
    ) AS CalculatedDiscount,
    SUM(oi.PriceAtPurchase * oi.Quantity) AS TotalPaid,
    SUM(
        CASE 
            WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
            THEN pv.Price * oi.Quantity
            ELSE ISNULL(p.Price, 0) * oi.Quantity
        END
    ) AS TotalOriginalPrice,
    o.TotalAmount AS OrderTotalAmount
FROM Orders o
INNER JOIN OrderItems oi ON o.OrderID = oi.OrderID
LEFT JOIN Products p ON oi.ProductID = p.ProductID
LEFT JOIN ProductVariations pv ON oi.VariationID = pv.VariationID
WHERE o.Status != 'Pending'
    AND o.OrderDate >= DATEADD(DAY, -7, GETDATE())  -- Last 7 days
GROUP BY o.OrderID, o.OrderDate, o.TotalAmount
HAVING SUM(
    CASE 
        WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
        THEN (pv.Price - oi.PriceAtPurchase) * oi.Quantity
        ELSE (ISNULL(p.Price, 0) - oi.PriceAtPurchase) * oi.Quantity
    END
) > 0  -- Only show orders with discounts
ORDER BY o.OrderDate DESC;
GO

