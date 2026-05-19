# How to Fetch Discounts for Orders in Sales Reports

## Overview
This document explains how to fetch discount information from `dbo.ProductDiscounts` and `dbo.Products` tables to calculate discounts for orders in sales reports.

## Database Structure

### ProductDiscounts Table
The `ProductDiscounts` table stores active discounts for products:
- `DiscountID` - Primary key
- `ProductID` - Foreign key to Products table
- `DiscountType` - 'percentage' or 'fixed'
- `DiscountValue` - The discount amount (percentage or fixed amount)
- `StartDate` - When discount starts
- `EndDate` - When discount ends
- `IsActive` - Whether discount is active

### Products Table
- `ProductID` - Primary key
- `Price` - Original product price

### OrderItems Table
- `OrderItemID` - Primary key
- `OrderID` - Foreign key to Orders table
- `ProductID` - Foreign key to Products table
- `VariationID` - Foreign key to ProductVariations (nullable)
- `Quantity` - Quantity purchased
- `PriceAtPurchase` - Price at time of purchase (may include discount)

### Orders Table
- `OrderID` - Primary key
- `OrderDate` - When order was placed
- `TotalAmount` - Total order amount

## Method 1: Calculate Discounts from OrderItems (Recommended)

This method calculates discounts by comparing the original price with the purchase price:

```sql
-- Calculate discounts for all order items
SELECT 
    oi.OrderID,
    oi.OrderItemID,
    oi.ProductID,
    oi.VariationID,
    oi.Quantity,
    oi.PriceAtPurchase,
    
    -- Get original price (from variation if exists, otherwise from product)
    CASE 
        WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
        THEN pv.Price
        ELSE ISNULL(p.Price, 0)
    END AS OriginalPrice,
    
    -- Calculate discount per unit
    CASE 
        WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
        THEN (pv.Price - oi.PriceAtPurchase)
        ELSE (ISNULL(p.Price, 0) - oi.PriceAtPurchase)
    END AS DiscountPerUnit,
    
    -- Calculate total discount for this item
    (
        CASE 
            WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
            THEN (pv.Price - oi.PriceAtPurchase)
            ELSE (ISNULL(p.Price, 0) - oi.PriceAtPurchase)
        END * oi.Quantity
    ) AS TotalDiscount
    
FROM OrderItems oi
LEFT JOIN Products p ON oi.ProductID = p.ProductID
LEFT JOIN ProductVariations pv ON oi.VariationID = pv.VariationID
WHERE oi.OrderID IN (
    -- Your order IDs here
    SELECT OrderID FROM Orders WHERE OrderDate BETWEEN @dateFrom AND @dateTo
)
```

## Method 2: Fetch Active Discounts at Time of Purchase

This method checks if there was an active discount when the order was placed:

```sql
-- Get order items with discount information at time of purchase
SELECT 
    oi.OrderID,
    oi.OrderItemID,
    oi.ProductID,
    oi.VariationID,
    oi.Quantity,
    oi.PriceAtPurchase,
    o.OrderDate,
    
    -- Get active discount at time of purchase
    pd.DiscountID,
    pd.DiscountType,
    pd.DiscountValue,
    pd.StartDate AS DiscountStartDate,
    pd.EndDate AS DiscountEndDate,
    
    -- Get original price
    CASE 
        WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
        THEN pv.Price
        ELSE ISNULL(p.Price, 0)
    END AS OriginalPrice,
    
    -- Calculate discount amount based on discount type
    CASE 
        WHEN pd.DiscountID IS NOT NULL THEN
            CASE 
                WHEN pd.DiscountType = 'percentage' THEN
                    (CASE 
                        WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
                        THEN pv.Price
                        ELSE ISNULL(p.Price, 0)
                    END * pd.DiscountValue / 100)
                WHEN pd.DiscountType = 'fixed' THEN
                    pd.DiscountValue
                ELSE 0
            END
        ELSE 0
    END AS DiscountAmount,
    
    -- Calculate total discount for this item
    (
        CASE 
            WHEN pd.DiscountID IS NOT NULL THEN
                CASE 
                    WHEN pd.DiscountType = 'percentage' THEN
                        (CASE 
                            WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
                            THEN pv.Price
                            ELSE ISNULL(p.Price, 0)
                        END * pd.DiscountValue / 100)
                    WHEN pd.DiscountType = 'fixed' THEN
                        pd.DiscountValue
                    ELSE 0
                END
            ELSE 0
        END * oi.Quantity
    ) AS TotalDiscount
    
FROM OrderItems oi
INNER JOIN Orders o ON oi.OrderID = o.OrderID
LEFT JOIN Products p ON oi.ProductID = p.ProductID
LEFT JOIN ProductVariations pv ON oi.VariationID = pv.VariationID
LEFT JOIN ProductDiscounts pd ON oi.ProductID = pd.ProductID
    AND pd.IsActive = 1
    AND o.OrderDate BETWEEN pd.StartDate AND pd.EndDate
WHERE o.OrderDate BETWEEN @dateFrom AND @dateTo
```

## Method 3: Aggregate Total Discounts per Order

This query calculates total discounts for each order:

```sql
-- Calculate total discounts per order
SELECT 
    o.OrderID,
    o.OrderDate,
    o.TotalAmount,
    
    -- Sum of all discounts for this order
    SUM(
        CASE 
            WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
            THEN (pv.Price - oi.PriceAtPurchase) * oi.Quantity
            ELSE (ISNULL(p.Price, 0) - oi.PriceAtPurchase) * oi.Quantity
        END
    ) AS TotalDiscounts,
    
    -- Count of items with discounts
    SUM(
        CASE 
            WHEN (
                CASE 
                    WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
                    THEN pv.Price
                    ELSE ISNULL(p.Price, 0)
                END
            ) > oi.PriceAtPurchase THEN 1
            ELSE 0
        END
    ) AS ItemsWithDiscounts
    
FROM Orders o
INNER JOIN OrderItems oi ON o.OrderID = oi.OrderID
LEFT JOIN Products p ON oi.ProductID = p.ProductID
LEFT JOIN ProductVariations pv ON oi.VariationID = pv.VariationID
WHERE o.OrderDate BETWEEN @dateFrom AND @dateTo
    AND o.Status != 'Pending'
GROUP BY o.OrderID, o.OrderDate, o.TotalAmount
ORDER BY o.OrderDate DESC
```

## Integration with Sales Reports

### Updated Sales Report Query with Discounts

Here's how to integrate discount calculation into the sales report:

```sql
-- Sales Report with Discount Calculation
SELECT 
    o.OrderID,
    o.ReferenceNumber,
    c.FullName AS CustomerName,
    c.Email AS CustomerEmail,
    o.OrderDate,
    o.Status,
    o.TotalAmount,
    
    -- Calculate subtotal (before tax)
    ISNULL(o.TotalAmount, 0) - ISNULL(o.DeliveryCost, 0) - ISNULL(o.ExtraDeliveryFee, 0) - ISNULL(o.TaxAmount, 0) AS Subtotal,
    
    -- Calculate total discounts for this order
    ISNULL((
        SELECT SUM(
            CASE 
                WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
                THEN (pv.Price - oi.PriceAtPurchase) * oi.Quantity
                ELSE (ISNULL(p.Price, 0) - oi.PriceAtPurchase) * oi.Quantity
            END
        )
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
    ), 0) AS TotalDiscounts,
    
    ISNULL(o.DeliveryCost, 0) AS DeliveryCost,
    ISNULL(o.ExtraDeliveryFee, 0) AS ExtraDeliveryFee,
    ISNULL(o.TaxAmount, 0) AS TaxAmount,
    o.PaymentMethod,
    (SELECT COUNT(*) FROM OrderItems oi WHERE oi.OrderID = o.OrderID) AS TotalItems
    
FROM Orders o
INNER JOIN Customers c ON o.CustomerID = c.CustomerID
WHERE o.Status != 'Pending'
    AND o.OrderDate BETWEEN @dateFrom AND @dateTo
ORDER BY o.OrderDate DESC
```

## JavaScript Implementation for Sales Reports

Here's how to update the sales report route in `routes.js`:

```javascript
// In the sales report route, after fetching order items:

// Calculate discounts from OrderItems
const discountQuery = `
    SELECT 
        oi.OrderID,
        SUM(
            CASE 
                WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
                THEN (pv.Price - oi.PriceAtPurchase) * oi.Quantity
                ELSE (ISNULL(p.Price, 0) - oi.PriceAtPurchase) * oi.Quantity
            END
        ) AS TotalDiscount
    FROM OrderItems oi
    LEFT JOIN Products p ON oi.ProductID = p.ProductID
    LEFT JOIN ProductVariations pv ON oi.VariationID = pv.VariationID
    WHERE oi.OrderID IN (${orderIdParams})
        AND (
            CASE 
                WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
                THEN pv.Price
                ELSE ISNULL(p.Price, 0)
            END
        ) > oi.PriceAtPurchase
    GROUP BY oi.OrderID
`;

const discountResult = await pool.request().query(discountQuery);

// Create a map of OrderID to TotalDiscount
const discountMap = {};
discountResult.recordset.forEach(row => {
    discountMap[row.OrderID] = parseFloat(row.TotalDiscount || 0);
});

// Add discount information to each order in the result
result.recordset.forEach(order => {
    order.TotalDiscounts = discountMap[order.OrderID] || 0;
});
```

## Notes

1. **PriceAtPurchase**: This column in OrderItems stores the actual price paid, which may already include discounts.

2. **Original Price**: Get from:
   - `ProductVariations.Price` if a variation was purchased
   - `Products.Price` if no variation

3. **Discount Calculation**: 
   - Discount = Original Price - PriceAtPurchase
   - Total Discount = Discount × Quantity

4. **Active Discounts**: When checking ProductDiscounts, ensure:
   - `IsActive = 1`
   - `OrderDate BETWEEN StartDate AND EndDate`

5. **Performance**: For large datasets, consider:
   - Indexing on `OrderItems.OrderID`, `OrderItems.ProductID`, `OrderItems.VariationID`
   - Indexing on `ProductDiscounts.ProductID`, `ProductDiscounts.IsActive`, `ProductDiscounts.StartDate`, `ProductDiscounts.EndDate`

## Example: Get Discount Summary

```sql
-- Get discount summary for a date range
SELECT 
    COUNT(DISTINCT o.OrderID) AS OrdersWithDiscounts,
    SUM(
        CASE 
            WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
            THEN (pv.Price - oi.PriceAtPurchase) * oi.Quantity
            ELSE (ISNULL(p.Price, 0) - oi.PriceAtPurchase) * oi.Quantity
        END
    ) AS TotalDiscountsAmount,
    AVG(
        CASE 
            WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
            THEN (pv.Price - oi.PriceAtPurchase) * oi.Quantity
            ELSE (ISNULL(p.Price, 0) - oi.PriceAtPurchase) * oi.Quantity
        END
    ) AS AverageDiscountPerOrder
FROM Orders o
INNER JOIN OrderItems oi ON o.OrderID = oi.OrderID
LEFT JOIN Products p ON oi.ProductID = p.ProductID
LEFT JOIN ProductVariations pv ON oi.VariationID = pv.VariationID
WHERE o.OrderDate BETWEEN @dateFrom AND @dateTo
    AND o.Status != 'Pending'
    AND (
        CASE 
            WHEN oi.VariationID IS NOT NULL AND pv.Price IS NOT NULL 
            THEN pv.Price
            ELSE ISNULL(p.Price, 0)
        END
    ) > oi.PriceAtPurchase
```

