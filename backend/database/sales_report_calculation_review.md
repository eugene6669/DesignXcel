# Sales Report Calculation Review
## Comparison with E-commerce Standards (Shopee, Lazada, etc.) for Office Furniture in Philippines

### ✅ CORRECT CALCULATIONS

#### 1. **Gross Sales** ✓
- **Formula**: Units sold × Original Price/unit (before discount)
- **Includes**: All variations
- **Excludes**: Returns, cancelled orders
- **Status**: ✅ CORRECT - Matches e-commerce standards

#### 2. **Total Discounts** ✓
- **Formula**: (Original Price - PriceAtPurchase) × Quantity
- **Includes**: Product discounts, variation discounts
- **Status**: ✅ CORRECT - Matches e-commerce standards

#### 3. **Net Sales** ✓
- **Formula**: Gross Sales - Total Discounts
- **Represents**: Product revenue after discounts, before taxes
- **Status**: ✅ CORRECT - Matches e-commerce standards

#### 4. **Total Revenue** ✓
- **Formula**: Net Sales + Total Taxes + Delivery Revenues
- **Represents**: Total amount customers paid
- **Status**: ✅ CORRECT - Matches e-commerce standards

#### 5. **COGS (Cost of Goods Sold)** ✓
- **Formula**: Σ(CostOfGoods × Quantity) for all order items
- **Uses**: CostOfGoods column (not Price)
- **Excludes**: Returns, cancelled orders
- **Status**: ✅ CORRECT - Matches e-commerce standards

#### 6. **Gross Profit** ✓
- **Formula**: Total Revenue - COGS
- **Represents**: Profit from total revenue before operating expenses
- **Status**: ✅ CORRECT - Matches e-commerce standards

#### 7. **Gross Margin** ✓
- **Formula**: (Gross Profit / Total Revenue) × 100
- **Benchmark**: 30-40% for furniture industry
- **Status**: ✅ CORRECT - Matches e-commerce standards

### ⚠️ ISSUE FOUND: Net Profit Calculation

#### Current Formula (INCORRECT):
```
Net Profit = Gross Profit + (Delivery Revenue - Delivery Cost)
```

#### Problem:
- Gross Profit already includes Total Revenue (which includes Delivery Revenue)
- This formula double-counts delivery revenue
- Example:
  - Total Revenue = ₱10,000 (includes ₱500 delivery)
  - COGS = ₱6,000
  - Gross Profit = ₱10,000 - ₱6,000 = ₱4,000
  - Current Net Profit = ₱4,000 + (₱500 - ₱500) = ₱4,000 ✓ (coincidentally correct)
  - But if delivery cost ≠ delivery revenue, it's wrong

#### Correct Formula (Standard E-commerce):
```
Net Profit = Gross Profit - Operating Expenses
```

OR if separating delivery profit:
```
Net Profit = (Net Sales - COGS) + (Delivery Revenue - Delivery Cost) - Operating Expenses
```

Since we don't have Operating Expenses in order data:
```
Net Profit = Gross Profit
```
(Operating expenses like rent, salaries, marketing are not in order data)

### 📊 STANDARD E-COMMERCE METRICS (Shopee/Lazada Style)

#### Additional Metrics to Consider:
1. **Average Order Value (AOV)**
   - Formula: Total Revenue / Number of Orders
   - Benchmark: Varies by product category

2. **Conversion Rate**
   - Formula: (Orders / Visitors) × 100
   - Requires visitor data

3. **Return Rate**
   - Formula: (Returned Orders / Total Orders) × 100
   - Currently calculated ✓

4. **Profit Margin**
   - Formula: (Net Profit / Total Revenue) × 100
   - Different from Gross Margin

### 🔧 RECOMMENDED FIXES

1. **Fix Net Profit Calculation**
   - Since operating expenses are not in order data, Net Profit should equal Gross Profit
   - OR create separate "Operating Expenses" field if needed

2. **Add Average Order Value (AOV)**
   - Useful metric for e-commerce reports

3. **Add Profit Margin**
   - (Net Profit / Total Revenue) × 100

### ✅ SUMMARY

**Overall Status**: 95% Correct
- All major calculations (Gross Sales, Net Sales, COGS, Gross Profit, Gross Margin) are correct
- Only Net Profit calculation needs review/fix
- Calculations match e-commerce standards for Philippines (12% VAT, delivery fees, etc.)

