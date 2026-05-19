# Sales Report Documentation - Standard Accounting Practices

## Overview
This document provides a comprehensive explanation of all sales report calculations, following **standard e-commerce accounting practices** and **Philippine tax regulations (12% VAT)**. All formulas are industry-standard and align with Generally Accepted Accounting Principles (GAAP) for e-commerce businesses.

---

## 1. Core Financial Metrics

### 1.1 Gross Sales
**Definition:** Total revenue from all product sales before any deductions (discounts, returns, refunds, taxes).

**Formula:**
```
Gross Sales = Σ(Original Price × Quantity) for ALL orders
```

**Includes:**
- ✅ Completed orders
- ✅ Refunded orders (original sale value)
- ✅ Returned orders (original sale value)
- ✅ Replacement orders (as completed orders)
- ✅ Orders with all statuses: Completed, Returned, Refunded, Completed Returned

**Excludes:**
- ❌ Discounts
- ❌ Delivery fees
- ❌ Taxes

**Accounting Justification:**
- Follows standard accounting practice: Gross Sales includes ALL sales transactions
- Refunded orders are included because they represent legitimate sales that occurred before refund
- The refund is accounted for separately in Returns calculation
- This ensures complete audit trail of all sales activity

**Example:**
```
Original Order: ₱10,000 (Status: Completed)
Refunded Order: ₱8,000 (Status: Refunded)
Replacement: ₱8,000 (Status: Completed, ActionType: replacement)

Gross Sales = ₱10,000 + ₱8,000 + ₱8,000 = ₱26,000
```

---

### 1.2 Total Discounts
**Definition:** Sum of all discounts applied to orders (coupons, promotions, order-level discounts, product discounts).

**Formula:**
```
Total Discounts = Σ[(Original Price - PriceAtPurchase) × Quantity] for all OrderItems
```

**Calculation Method:**
1. **Direct Calculation (Preferred):** Compare original price (Products.Price or ProductVariations.Price) with actual price paid (PriceAtPurchase)
2. **Fallback:** Use DiscountAmount column from Orders table if available
3. **Secondary Fallback:** Calculate as Gross Sales - Net Sales (indirect method)

**Accounting Justification:**
- Discounts reduce revenue and must be tracked separately for accurate financial reporting
- Allows analysis of promotional effectiveness
- Required for tax calculations (taxes calculated on discounted price)

**Example:**
```
Original Price: ₱1,000
Price Paid (PriceAtPurchase): ₱800
Quantity: 2

Discount = (₱1,000 - ₱800) × 2 = ₱400
```

---

### 1.3 Returns/Refunds
**Definition:** Total value of money returned to customers for refunded or returned orders.

**Formula:**
```
Returns = Σ(RefundAmount) for all orders with Status = 'Refunded' OR 'Completed Returned'
```

**Calculation Method:**
- Uses `RefundAmount` column from Orders table
- `RefundAmount` already accounts for:
  - Partial returns (only returned items)
  - Proportional delivery fee deductions (if return conditions not met)
  - Full refunds (all items returned)

**Accounting Justification:**
- Follows standard accounting: Returns reduce revenue
- `RefundAmount` is the actual amount refunded (not original order value)
- Ensures accurate net revenue calculation
- Supports partial return tracking

**Example:**
```
Order: ₱10,000 (2 items @ ₱5,000 each)
Partial Return: 1 item @ ₱5,000
RefundAmount: ₱4,400 (includes proportional delivery fee deduction)

Returns = ₱4,400
```

---

### 1.4 Net Sales
**Definition:** Actual product revenue after discounts and returns, before taxes and delivery fees.

**Formula:**
```
Net Sales = Gross Sales - Total Discounts - Returns
```

**Accounting Justification:**
- Standard e-commerce formula per GAAP
- Represents actual product revenue received
- Excludes delivery fees (tracked separately)
- Used as base for tax calculations

**Example:**
```
Gross Sales: ₱26,000
Total Discounts: ₱2,000
Returns: ₱4,400

Net Sales = ₱26,000 - ₱2,000 - ₱4,400 = ₱19,600
```

---

## 2. Revenue Metrics

### 2.1 Gross Revenue
**Definition:** Total revenue including products and delivery fees, before deductions.

**Formula:**
```
Gross Revenue = Gross Sales + Delivery Fees (from all orders)
```

**Includes:**
- All delivery fees from completed orders
- All delivery fees from refunded orders (delivery was provided)
- Extra delivery fees

**Accounting Justification:**
- Delivery fees are revenue when service is provided
- Even if order is refunded, delivery fee was earned (service completed)
- Standard practice for in-house delivery services

**Example:**
```
Gross Sales: ₱26,000
Delivery Fees: ₱3,500

Gross Revenue = ₱26,000 + ₱3,500 = ₱29,500
```

---

### 2.2 Net Revenue
**Definition:** Total revenue after all deductions (discounts, returns), including delivery fees.

**Formula:**
```
Net Revenue = Gross Revenue - Total Discounts - Returns
```

**Accounting Justification:**
- Represents actual total revenue received
- Includes both product revenue and delivery revenue
- Standard e-commerce accounting formula

**Example:**
```
Gross Revenue: ₱29,500
Total Discounts: ₱2,000
Returns: ₱4,400

Net Revenue = ₱29,500 - ₱2,000 - ₱4,400 = ₱23,100
```

---

## 3. Tax Calculations (Philippine VAT - 12%)

### 3.1 Total Taxes
**Definition:** Total Value-Added Tax (VAT) collected, calculated at 12% of discounted prices.

**Formula:**
```
Total Taxes = Σ[(PriceAtPurchase × 0.12 × Quantity)] for completed orders
             - Σ[(PriceAtPurchase × 0.12 × Returned Quantity)] for refunded orders
```

**Tax Base:**
- **PriceAtPurchase:** Actual price paid by customer (after discount, before tax)
- **Not Original Price:** Taxes calculated on discounted price (actual amount paid)
- **12% VAT Rate:** Standard Philippine VAT rate for e-commerce

**Partial Returns:**
- Tax calculated only on returned quantity
- For partial returns, tax refunded = PriceAtPurchase × 0.12 × Returned Quantity
- Remaining items' tax remains in Total Taxes

**Accounting Justification:**
- Complies with Philippine BIR (Bureau of Internal Revenue) regulations
- VAT calculated on actual transaction amount (after discounts)
- Tax refunds match product refunds proportionally
- Required for accurate tax reporting and remittance

**Example:**
```
Completed Order:
  Item Price (after discount): ₱1,000
  Quantity: 2
  Tax = ₱1,000 × 0.12 × 2 = ₱240

Refunded Order (Partial - 1 of 2 items):
  Item Price (after discount): ₱1,000
  Returned Quantity: 1
  Tax Refund = ₱1,000 × 0.12 × 1 = ₱120

Total Taxes = ₱240 - ₱120 = ₱120
```

---

## 4. Delivery Revenue Metrics

### 4.1 Delivery Revenues
**Definition:** Total delivery fees collected from all orders (in-house delivery service).

**Formula:**
```
Delivery Revenues = Σ(DeliveryCost + ExtraDeliveryFee) for ALL orders
```

**Includes:**
- ✅ Base delivery costs
- ✅ Extra delivery fees
- ✅ Delivery fees from refunded orders (service was provided)

**Accounting Justification:**
- Delivery is a service that was provided, revenue earned regardless of product refund
- Standard practice for e-commerce with in-house delivery
- Separate tracking enables delivery service profitability analysis

**Example:**
```
Completed Order Delivery: ₱500
Refunded Order Delivery: ₱300
Extra Delivery Fees: ₱200

Delivery Revenues = ₱500 + ₱300 + ₱200 = ₱1,000
```

---

### 4.2 Delivery Revenues Lost (From Returns)
**Definition:** Delivery fees from returned orders (tracked separately for analysis).

**Formula:**
```
Delivery Revenues Lost (Returns) = Σ(DeliveryCost + ExtraDeliveryFee) 
                                   for orders with Status = 'Returned' OR 'Processing (Pickup)'
```

**Purpose:**
- Analytical metric to understand impact of returns on delivery revenue
- Helps optimize return policies
- Not subtracted from Delivery Revenues (for information only)

---

### 4.3 Delivery Revenues Lost (From Refunds)
**Definition:** Delivery fees from refunded orders (tracked separately for analysis).

**Formula:**
```
Delivery Revenues Lost (Refunds) = Σ(DeliveryCost + ExtraDeliveryFee) 
                                   for orders with Status = 'Refunded' OR 'Completed Returned'
```

**Purpose:**
- Analytical metric for financial analysis
- Note: These are NOT subtracted from Delivery Revenues (service was provided)
- Used for internal reporting and decision-making

---

## 5. Order Statistics

### 5.1 Total Orders
**Definition:** Total count of all orders in the report period.

**Includes:**
- All order statuses: Completed, Returned, Refunded, Completed Returned
- Replacement orders

**Use Case:**
- Provides context for other metrics
- Used in return rate calculations

---

### 5.2 Total Customers
**Definition:** Unique count of customers with completed orders.

**Formula:**
```
Total Customers = COUNT(DISTINCT CustomerEmail) WHERE Status = 'Completed'
```

**Includes:**
- Only customers with completed orders
- Excludes customers with only cancelled/pending orders

**Accounting Justification:**
- Represents actual customer base
- Standard e-commerce metric for customer analysis

---

### 5.3 Average Order Value (AOV)
**Definition:** Average revenue per completed order.

**Formula:**
```
AOV = Σ(TotalAmount) for completed orders / Count of completed orders
```

**Includes:**
- Only orders with Status = 'Completed'
- Excludes refunded, returned, cancelled orders

**Accounting Justification:**
- Standard e-commerce KPI
- Measures order value trends
- Used for pricing and marketing strategies

**Example:**
```
Order 1: ₱5,000 (Completed)
Order 2: ₱8,000 (Completed)
Order 3: ₱10,000 (Refunded - excluded)

AOV = (₱5,000 + ₱8,000) / 2 = ₱6,500
```

---

## 6. Return and Refund Metrics

### 6.1 Returned Orders Count
**Definition:** Number of orders that were returned.

**Formula:**
```
Returned Orders Count = COUNT(*) WHERE Status = 'Refunded' OR 'Completed Returned'
```

---

### 6.2 Refunded Orders Count
**Definition:** Number of orders that were refunded (same as returned orders).

**Note:** Refunded and returned orders are the same set in this system.

---

### 6.3 Return Rate
**Definition:** Percentage of orders that were returned/refunded.

**Formula:**
```
Return Rate = (Returned Orders Count / Total Orders) × 100
```

**Use Case:**
- Quality control metric
- Product/service improvement indicator
- Industry benchmarking

---

## 7. Inventory Metrics

### 7.1 Total Units Sold
**Definition:** Total quantity of products sold in completed orders.

**Formula:**
```
Total Units Sold = Σ(Quantity) from OrderItems WHERE Order Status = 'Completed'
```

**Includes:**
- Only completed orders
- All items in completed orders
- Replacement orders (as completed orders)

**Accounting Justification:**
- Standard inventory turnover metric
- Used for inventory management
- Excludes returns to show actual sales volume

---

### 7.2 Total Units Returned
**Definition:** Total quantity of products returned/refunded.

**Formula:**
```
Total Units Returned = Σ(Returned Quantity) from ReturnItems
                      OR Σ(Quantity) from OrderItems WHERE Status = 'Refunded' (if full return)
```

**Supports Partial Returns:**
- Uses `ReturnItems` JSON to get actual returned quantities
- Accounts for partial returns accurately

---

### 7.3 Total Units Replaced
**Definition:** Total quantity of products replaced (replacement orders).

**Formula:**
```
Total Units Replaced = Σ(Quantity) from OrderItems WHERE ActionType = 'replacement'
```

---

### 7.4 Total Units Damaged
**Definition:** Total quantity of returned items with ReturnType = 'damage' (non-resellable).

**Formula:**
```
Total Units Damaged = Σ(Returned Quantity) WHERE ReturnType = 'damage'
```

**Use Case:**
- Quality control metric
- Warranty claims analysis
- Supplier quality assessment

---

### 7.5 Inventory Loss
**Definition:** Total value of returned/damaged items that cannot be resold.

**Formula:**
```
Inventory Loss = Σ(Original Price × Quantity) for returned items with ReturnType = 'damage'
```

**Accounting Justification:**
- Represents actual inventory write-off
- Used for financial reporting
- Affects cost of goods sold (COGS)

---

### 7.6 Inventory Turnover Rate
**Definition:** Ratio of units sold to total units (sold + returned).

**Formula:**
```
Inventory Turnover Rate = Total Units Sold / (Total Units Sold + Total Units Returned)
```

**Interpretation:**
- Higher rate = better (more sales, fewer returns)
- Range: 0 to 1
- Standard inventory efficiency metric

---

### 7.7 Damage Rate
**Definition:** Percentage of returned units that are damaged (non-resellable).

**Formula:**
```
Damage Rate = (Total Units Damaged / Total Units Returned) × 100
```

**Use Case:**
- Quality control indicator
- Helps identify product quality issues
- Supplier performance metric

---

### 7.8 Return Rate by Units
**Definition:** Percentage of sold units that were returned.

**Formula:**
```
Return Rate by Units = (Total Units Returned / Total Units Sold) × 100
```

**Use Case:**
- More accurate than order-based return rate
- Accounts for partial returns
- Industry standard metric

---

### 7.9 Replacement Rate
**Definition:** Percentage of returns that resulted in replacements.

**Formula:**
```
Replacement Rate = (Total Units Replaced / Total Units Returned) × 100
```

**Use Case:**
- Customer satisfaction indicator
- Warranty fulfillment metric
- Service quality assessment

---

## 8. Partial Return Handling

### 8.1 Overview
The system fully supports **partial returns**, where customers can return specific items and quantities from an order.

### 8.2 ReturnItems Column
**Storage:** JSON array in `Orders.ReturnItems` column
**Format:**
```json
[
  {
    "productId": 123,
    "variationId": 456,
    "quantity": 1
  }
]
```

### 8.3 Refund Calculation for Partial Returns
**Formula:**
```
For each returned item:
  Returned Item Subtotal = PriceAtPurchase × Returned Quantity
  
If all return conditions met:
  RefundAmount = Returned Item Subtotal
  
If return conditions NOT met:
  Proportional Delivery Fee Deduction = (Total Delivery Fee × Returned Item Value) / Total Order Value
  RefundAmount = Returned Item Subtotal - Proportional Delivery Fee Deduction
```

**Accounting Justification:**
- Accurate refund calculation for partial returns
- Proportional delivery fee deduction is fair and standard practice
- Supports complex return scenarios

**Example:**
```
Original Order:
  Item A: ₱5,000 × 2 = ₱10,000
  Item B: ₱3,000 × 1 = ₱3,000
  Subtotal: ₱13,000
  Delivery: ₱500
  Total: ₱13,500

Partial Return: 1 × Item A (conditions NOT met)
  Returned Value: ₱5,000
  Proportional Delivery: (₱500 × ₱5,000) / ₱13,000 = ₱192.31
  RefundAmount: ₱5,000 - ₱192.31 = ₱4,807.69
```

---

## 9. Standard Accounting Practices Compliance

### 9.1 Generally Accepted Accounting Principles (GAAP)
✅ **Revenue Recognition:** Revenue recognized when order is completed (delivered)
✅ **Accrual Accounting:** All transactions recorded when they occur
✅ **Matching Principle:** Returns matched to original sales in same period
✅ **Consistency:** Same formulas applied across all periods
✅ **Materiality:** All significant transactions included

### 9.2 E-commerce Industry Standards
✅ **Gross Sales includes all sales** (even if later refunded)
✅ **Returns reduce revenue** (standard practice)
✅ **Delivery fees tracked separately** (service revenue)
✅ **Taxes calculated on actual price paid** (after discounts)
✅ **Partial returns fully supported** (proportional calculations)

### 9.3 Philippine Tax Compliance
✅ **12% VAT on discounted prices** (BIR compliant)
✅ **Tax refunds on returns** (proportional)
✅ **Accurate tax calculations** (required for BIR reporting)
✅ **Tax on delivery fees** (if applicable)

---

## 10. Defense Points for Sales Report Accuracy

### 10.1 Formula Verification
All formulas follow **standard e-commerce accounting practices**:
- Based on industry-standard calculations used by major e-commerce platforms
- Aligns with GAAP principles
- Complies with Philippine tax regulations

### 10.2 Data Integrity
- **Source:** Direct from database (Orders and OrderItems tables)
- **Validation:** Multiple validation checks in code
- **Audit Trail:** Complete transaction history maintained
- **Error Handling:** Comprehensive error handling and logging

### 10.3 Partial Return Accuracy
- **RefundAmount:** Pre-calculated and stored during return approval
- **Proportional Calculations:** Mathematically accurate for partial returns
- **Type Safety:** Proper handling of product/variation ID matching

### 10.4 Tax Calculation Compliance
- **VAT Rate:** Standard 12% as per BIR regulations
- **Tax Base:** Discounted price (actual amount paid) - compliant with tax laws
- **Tax Refunds:** Properly calculated for returned items

### 10.5 Industry Benchmarking
All metrics align with standard e-commerce KPIs:
- Gross Sales, Net Sales, Net Revenue: Standard financial metrics
- AOV, Return Rate: Industry-standard KPIs
- Inventory metrics: Standard inventory management metrics

---

## 11. Common Questions & Answers

### Q1: Why are refunded orders included in Gross Sales?
**A:** Standard accounting practice. Gross Sales represents ALL sales transactions. The refund is accounted for separately in Returns, which is subtracted to get Net Sales. This provides complete audit trail and accurate financial reporting.

### Q2: Why are delivery fees included in Gross Revenue for refunded orders?
**A:** The delivery service was provided (items were delivered). Service revenue is earned when service is completed, regardless of product refund. This is standard practice for in-house delivery services.

### Q3: How are partial returns handled?
**A:** The system uses the `ReturnItems` JSON column to track which specific items and quantities were returned. Refund amounts are calculated proportionally, including proportional delivery fee deductions when return conditions are not met.

### Q4: Why is tax calculated on discounted price?
**A:** Philippine BIR regulations require VAT to be calculated on the actual transaction amount (price paid after discounts). This ensures compliance with tax laws.

### Q5: Are replacement orders counted twice?
**A:** No. Replacement orders are counted once as completed orders in Gross Sales. The original return is subtracted in Returns. This is correct: you sold two items (original + replacement), returned one (original), so net = one sale.

---

## 12. Summary

This sales report system implements **industry-standard e-commerce accounting practices** and **Philippine tax compliance**. All calculations are:
- ✅ Mathematically accurate
- ✅ Accounting-compliant (GAAP)
- ✅ Tax-compliant (BIR regulations)
- ✅ Industry-standard formulas
- ✅ Fully auditable and traceable

The system provides comprehensive financial reporting suitable for:
- Financial statements preparation
- Tax filing and compliance
- Business decision-making
- Investor reporting
- Regulatory compliance

---

**Document Version:** 1.0  
**Last Updated:** 2025  
**Compliance:** GAAP, Philippine BIR Regulations, E-commerce Industry Standards

