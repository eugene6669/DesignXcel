# Sales Report – Explanation and Fixes

## What the sales report does

The sales report (`/Employee/Admin/Reports/Sales/Data` and related routes) loads orders from the database and computes standard e‑commerce metrics.

### Order scope

- **Included:** Completed, Returned, Refunded, Completed Returned (and Cancelled when `IsRefunded = 1`).
- **Excluded:** Cancelled (unless refunded), and any status not in the list above.
- You can filter by date range, status, payment method, amount, and search.

### Main metrics (formulas)

| Metric | Formula | Meaning |
|--------|--------|--------|
| **Gross Sales** | Σ(Original price × Quantity) for all order items | Product sales at full price before discounts and refunds. Uses `Products.Price` or `ProductVariations.Price`. |
| **Total Discounts** | Σ[(Original price − PriceAtPurchase) × Quantity] | All discounts (per product/variation). |
| **Returns** | Σ(RefundAmount) for Refunded / Completed Returned orders | Money given back to customers (uses `RefundAmount` when present). |
| **Net Sales** | Gross Sales − Total Discounts − Returns | Product revenue after discounts and refunds (no delivery, no tax). |
| **Delivery Revenues** | Σ(DeliveryCost + ExtraDeliveryFee) for orders in the report | Delivery (and extra delivery) fees. |
| **Total Revenue** | Net Sales + Delivery Revenues | Total money from products + delivery (what you report as total revenue). |
| **Total Taxes** | Σ(PriceAtPurchase × 0.12 × Quantity) for completed items | 12% VAT on sold (and adjusted for returned) items. |
| **Gross Revenue** | Gross Sales + Delivery Revenues | Revenue before discounts and returns. |
| **Net Revenue** | Gross Revenue − Total Discounts − Returns | Same as Net Sales + Delivery in effect; product + delivery after deductions. |

Gross Sales and discounts are computed from **OrderItems** (with Products/ProductVariations). Returns use **Orders.RefundAmount** (or Subtotal fallback). Delivery uses **Orders.DeliveryCost** and **ExtraDeliveryFee**.

---

## Bug that was fixed

### 1. Total Revenue wrong (fixed)

- **What was wrong**
  - `totalRevenue` was computed as `netSales + deliveryRevenuesExcludingReturns` **before** `netSales` was set.
  - `netSales` is set only after returns are calculated (Net Sales = Gross Sales − Total Discounts − Returns).
  - So at the time of the first calculation, `netSales` was still `0`, and **Total Revenue was effectively only delivery**, and the log was misleading.
  - The value sent in the API as `totalRevenue` was `totalRevenueAdjusted`, which was **product revenue only** (PriceAtPurchase × Quantity for Completed orders) and **did not include delivery**, so “Total Revenue” was mislabeled.

- **What was changed**
  - The **Total Revenue** calculation was moved to **after** `netSales` and returns are computed.
  - **Total Revenue** is now: **Net Sales + Delivery Revenues** (same as in your docs).
  - The API `stats.totalRevenue` is now set to **`netSalesValue + deliveryRevenuesExcludingReturns`** so the reported “Total Revenue” is actually total revenue (products + delivery), not product-only.

So now:

- **Total Revenue** = Net Sales + Delivery Revenues (correct and consistent with your documentation).

---

## Other checks (no code change)

- **Net Profit**  
  Your review doc suggested “Net Profit = Gross Profit” when there are no operating expenses in order data. The current report does not expose a “Net Profit” field; if you add one later, it should be consistent with that (e.g. Net Profit = Gross Profit when no other costs are in the system).

- **Gross Sales including Returned/Refunded**  
  Gross Sales sums **all** order items (Completed, Returned, Refunded, Completed Returned) at **original** price. Returns are then subtracted in **Net Sales** and **Net Revenue**. So the flow (Gross → Discounts → Returns → Net) is correct.

- **Delivery**  
  Delivery revenues use `DeliveryCost` and `ExtraDeliveryFee` from the orders in the report. Only the **Total Revenue** formula and the value sent in the API were wrong; they are now fixed.

---

## Summary

- **Formulas** in the code now match the intended definitions (Gross Sales, Discounts, Returns, Net Sales, Delivery, Total Revenue, etc.).
- **Total Revenue** is no longer computed too early and no longer uses a product-only value; it is **Net Sales + Delivery Revenues** and is what the API returns as `totalRevenue`.

No other mistakes were found in the main sales report calculation flow; the only correction applied was for **Total Revenue** (timing and formula used in the response).
