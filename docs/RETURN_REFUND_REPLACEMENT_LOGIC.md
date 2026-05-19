# Return, Refund, and Replacement Logic - Sales Report & Inventory Impact

## Current System Behavior

### 1. **When Customer Submits Return Request**

**Status Change:** `Status = 'Returned'`

**Inventory Update (Happens Immediately):**
- **If ReturnType = 'damage':**
  - Items added to `DamagedQuantity` 
  - Items added to `ReturnedQuantity`
  - Items NOT added back to `AvailableQuantity` (damaged items can't be resold)
  
- **If ReturnType = 'other' (non-damage):**
  - Items added to `AvailableQuantity` (can be resold)
  - Items added to `ReturnedQuantity`

**Sales Report Impact:**
- Order appears in sales report with status "Returned"
- Revenue is still counted (not yet deducted)

---

### 2. **When Admin Approves Return Request**

**Status:** Remains `'Returned'` (or changes to `'Processing'` for replacement)

**Inventory:** No additional changes (already updated when return was submitted)

**Sales Report Impact:**
- Order still appears in sales report
- Revenue still counted

---

### 3. **When Admin Processes REFUND**

**Status Change:** `Status = 'Cancelled'`

**Inventory:** No changes (already updated when return was submitted)

**Financial Impact:**
- Money refunded to customer via Stripe
- Refund amount = Subtotal - ReturnShippingFee
- Original delivery fees are NOT refunded

**Sales Report Impact:**
- Order is EXCLUDED from sales report (status = 'Cancelled')
- Revenue is effectively deducted from total sales
- **Issue:** Sales report doesn't explicitly show refunds as negative revenue

---

### 4. **When Admin Processes REPLACEMENT**

**Status Change:** `Status = 'Processing'` (for return delivery to seller)

**Inventory Update:**
- Items are added to `DamagedQuantity` (regardless of original return type)
- This is correct for office furniture - returned items for replacement are typically damaged

**Sales Report Impact:**
- Order status changes to 'Processing', so it's excluded from sales report
- **Issue:** Original sale is removed from sales report, but replacement order (if created) should be tracked separately

---

## Current Issues & Recommendations

### Issue 1: Sales Report Doesn't Track Net Sales Properly

**Current Behavior:**
- Completed orders = Counted as sales
- Returned orders = Counted as sales (until refunded)
- Cancelled orders (refunded) = Excluded from sales

**Problem:**
- Sales report shows gross sales, not net sales
- Refunded orders disappear from report but don't show as negative revenue
- No clear visibility of refunds vs replacements

**Recommendation:**
1. **Add Refund Tracking Column:**
   - Add `IsRefunded` boolean column to Orders table
   - Set to `true` when refund is processed
   - Keep status as 'Returned' but mark as refunded

2. **Update Sales Report Query:**
   ```sql
   -- Calculate Net Sales
   SELECT 
       SUM(CASE WHEN Status = 'Completed' THEN TotalAmount ELSE 0 END) AS GrossSales,
       SUM(CASE WHEN IsRefunded = 1 THEN TotalAmount ELSE 0 END) AS TotalRefunds,
       SUM(CASE WHEN Status = 'Completed' THEN TotalAmount ELSE 0 END) - 
       SUM(CASE WHEN IsRefunded = 1 THEN RefundAmount ELSE 0 END) AS NetSales
   FROM Orders
   WHERE Status IN ('Completed', 'Returned')
   ```

3. **Add Refund Report Section:**
   - Show total refunds separately
   - Show net sales (gross - refunds)
   - Track refund reasons

---

### Issue 2: Replacement Orders Not Tracked

**Current Behavior:**
- Replacement order status changes to 'Processing'
- Original order disappears from sales report
- No new order created for replacement

**Problem:**
- Can't track replacement orders separately
- Don't know if replacement was fulfilled

**Recommendation:**
1. **Create Replacement Order:**
   - When replacement is approved, create a new order with status 'Processing'
   - Link to original order via `OriginalOrderID` or `ReplacementForOrderID`
   - Track replacement orders separately in reports

2. **Update Sales Report:**
   - Show original order as "Returned - Replacement"
   - Show replacement order as separate line item
   - Calculate net: Original sale - (if replacement fails, then refund)

---

### Issue 3: Inventory Tracking for Refunds vs Replacements

**Current Behavior:**
- Inventory updated when return is submitted (correct)
- For refunds: Items stay in inventory (damaged or available)
- For replacements: Items added to damaged inventory again (duplicate?)

**Problem:**
- Replacement processing adds items to damaged inventory again
- But items were already added when return was submitted

**Recommendation:**
1. **Fix Replacement Inventory Logic:**
   - Don't add to damaged inventory again if already there
   - Only update if items need to be moved from Available to Damaged

2. **Add Inventory Movement Log:**
   - Track all inventory movements (sale, return, refund, replacement)
   - Helps with auditing and tracking

---

## Recommended Database Schema Changes

### Add to Orders Table:
```sql
ALTER TABLE Orders ADD IsRefunded BIT DEFAULT 0;
ALTER TABLE Orders ADD ReplacementOrderID INT NULL; -- Links to replacement order
ALTER TABLE Orders ADD OriginalOrderID INT NULL; -- Links to original order if this is a replacement
```

### Add Inventory Movement Log Table:
```sql
CREATE TABLE InventoryMovements (
    MovementID INT PRIMARY KEY IDENTITY(1,1),
    InventoryProductID INT,
    VariationID INT NULL,
    MovementType NVARCHAR(50), -- 'Sale', 'Return', 'Refund', 'Replacement', 'Damage'
    Quantity INT,
    OrderID INT NULL,
    Reason NVARCHAR(MAX) NULL,
    CreatedAt DATETIME DEFAULT GETDATE()
);
```

---

## Recommended Sales Report Logic

### Net Sales Calculation:
```sql
SELECT 
    -- Gross Sales (all completed orders)
    SUM(CASE WHEN Status = 'Completed' THEN TotalAmount ELSE 0 END) AS GrossSales,
    
    -- Total Refunds (refunded orders)
    SUM(CASE WHEN IsRefunded = 1 THEN RefundAmount ELSE 0 END) AS TotalRefunds,
    
    -- Net Sales (Gross - Refunds)
    SUM(CASE WHEN Status = 'Completed' THEN TotalAmount ELSE 0 END) - 
    SUM(CASE WHEN IsRefunded = 1 THEN RefundAmount ELSE 0 END) AS NetSales,
    
    -- Replacement Orders (track separately)
    COUNT(CASE WHEN ReplacementOrderID IS NOT NULL THEN 1 END) AS ReplacementCount
FROM Orders
WHERE Status IN ('Completed', 'Returned', 'Cancelled')
```

---

## Summary

### For REFUND Action:
- ✅ Inventory: Already updated when return submitted (correct)
- ⚠️ Sales Report: Order excluded but refund not shown as negative revenue
- ✅ Financial: Money refunded correctly via Stripe

### For REPLACEMENT Action:
- ⚠️ Inventory: Items added to damaged inventory twice (needs fix)
- ⚠️ Sales Report: Original order disappears, replacement not tracked
- ⚠️ Order Tracking: No new order created for replacement

### Recommended Next Steps:
1. Add `IsRefunded` column to Orders table
2. Update sales report to show net sales (gross - refunds)
3. Fix replacement inventory logic (don't double-add to damaged)
4. Create replacement orders when replacement is processed
5. Add inventory movement log for better tracking

