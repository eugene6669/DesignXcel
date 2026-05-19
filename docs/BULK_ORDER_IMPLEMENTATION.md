# Bulk Order Feature Implementation

## Overview
A comprehensive bulk order system has been implemented for your e-commerce office furniture website, similar to industry-standard B2B e-commerce platforms. This feature allows customers to order multiple products with volume discounts and request custom quotes.

## Features Implemented

### 1. **Bulk Order Page** (`/bulk-order`)
- **Product Search & Filter**: Search products by name/description and filter by category
- **Add Products**: Easily add products to bulk order from a product grid
- **Bulk Order Table**: View all items in a detailed table format with:
  - Product name, SKU, quantity
  - Unit price, volume discount percentage
  - Total price and savings
- **Volume Discounts**: Automatic tier-based pricing:
  - 5% off for 10+ items
  - 10% off for 25+ items
  - 15% off for 50+ items
  - 20% off for 100+ items
- **Quantity Management**: Adjust quantities directly in the table
- **Export to CSV**: Download bulk order as CSV file
- **Request Quote**: Submit a custom quote request with company details
- **Submit Order**: Direct bulk order submission

### 2. **Backend API Endpoints**

#### POST `/api/bulk-orders`
Creates a bulk order with all items and applies volume discounts.

**Request Body:**
```json
{
  "items": [
    {
      "productId": 1,
      "name": "Office Chair",
      "quantity": 50,
      "unitPrice": 1000.00,
      "sku": "SKU-001"
    }
  ],
  "totals": {
    "subtotal": 50000.00,
    "discount": 7500.00,
    "total": 42500.00,
    "totalQuantity": 50
  },
  "volumeDiscounts": [
    {
      "productId": 1,
      "quantity": 50,
      "discount": 0.15
    }
  ]
}
```

#### POST `/api/bulk-orders/request-quote`
Submits a quote request for custom pricing.

**Request Body:**
```json
{
  "companyName": "ABC Corporation",
  "contactName": "John Doe",
  "email": "john@abc.com",
  "phone": "+1234567890",
  "notes": "Delivery needed by end of month",
  "items": [...],
  "estimatedTotal": 50000.00,
  "totalQuantity": 50
}
```

### 3. **Database Tables**

Four new tables have been created:

1. **BulkOrders**: Main bulk order records
   - CustomerID, CustomerEmail
   - TotalQuantity, Subtotal, DiscountAmount, GrandTotal
   - Status (Pending, Processing, Completed, Cancelled)
   - CreatedAt, UpdatedAt

2. **BulkOrderItems**: Individual items in bulk orders
   - ProductID, ProductName, SKU
   - Quantity, UnitPrice, DiscountPercent
   - DiscountedPrice, ItemTotal

3. **BulkOrderQuotes**: Quote requests from customers
   - CompanyName, ContactName, Email, Phone
   - EstimatedTotal, TotalQuantity
   - Status, ResponseNotes

4. **BulkOrderQuoteItems**: Items in quote requests
   - ProductID, ProductName, SKU
   - Quantity, UnitPrice

## Setup Instructions

### 1. Run Database Migration

Execute the SQL script to create the necessary tables:

```sql
-- Run this script in SQL Server Management Studio
-- File: backend/database/create_bulk_order_tables.sql
```

Or use the command line:
```bash
sqlcmd -S DESKTOP-F4OI6BT\SQLEXPRESS -d DesignXcellDB -i backend/database/create_bulk_order_tables.sql
```

### 2. Access the Bulk Order Page

Navigate to: `http://localhost:3000/bulk-order`

Or add a link in your navigation menu:
```jsx
<Link to="/bulk-order">Bulk Order</Link>
```

## Usage Guide

### For Customers

1. **Navigate to Bulk Order Page**
   - Click "Bulk Order" link in navigation or visit `/bulk-order`

2. **Add Products**
   - Search for products using the search bar
   - Filter by category if needed
   - Click "Add to Bulk Order" on any product

3. **Manage Quantities**
   - Adjust quantities in the bulk order table
   - Remove items using the "Remove" button
   - View automatic volume discounts applied

4. **Submit Order**
   - Review totals and savings
   - Click "Submit Bulk Order" to create the order
   - Or click "Request Quote" for custom pricing

5. **Export**
   - Click "Export to CSV" to download order details

### For Administrators

Bulk orders will appear in the order management system. You can:
- View bulk order details
- Process bulk orders
- Respond to quote requests
- Update order status

## Customization

### Adjust Volume Discount Tiers

Edit `src/features/bulk-orders/pages/BulkOrderPage.js`:

```javascript
const calculateVolumeDiscount = (quantity) => {
    if (quantity >= 100) return 0.25; // 25% off for 100+
    if (quantity >= 50) return 0.20;  // 20% off for 50+
    if (quantity >= 25) return 0.15;  // 15% off for 25+
    if (quantity >= 10) return 0.10;  // 10% off for 10+
    return 0;
};
```

### Add Navigation Link

Add to your navigation component:

```jsx
import { Link } from 'react-router-dom';

<Link to="/bulk-order" className="nav-link">
  Bulk Order
</Link>
```

## Features Similar to Industry Standards

This implementation includes features commonly found on major office furniture e-commerce sites:

✅ **Volume Discounts**: Automatic tier-based pricing
✅ **Bulk Quantity Management**: Easy quantity adjustments
✅ **Quote Requests**: Custom pricing for large orders
✅ **Product Search**: Quick product discovery
✅ **Order Export**: CSV export functionality
✅ **Professional UI**: Clean, table-based interface
✅ **Real-time Calculations**: Instant discount and total updates

## Technical Details

### Frontend Components
- `src/features/bulk-orders/pages/BulkOrderPage.js` - Main bulk order page
- `src/features/bulk-orders/pages/BulkOrderPage.css` - Styling
- `src/features/bulk-orders/index.js` - Export file

### Backend Routes
- `backend/api-routes.js` - Contains bulk order API endpoints
  - POST `/api/bulk-orders`
  - POST `/api/bulk-orders/request-quote`

### Database
- SQL migration script: `backend/database/create_bulk_order_tables.sql`

## Future Enhancements

Potential improvements you could add:

1. **Bulk Order Templates**: Save frequently ordered combinations
2. **Minimum Order Quantities**: Set MOQ requirements per product
3. **Custom Pricing Rules**: Product-specific volume discounts
4. **Bulk Order History**: View past bulk orders
5. **Email Notifications**: Send confirmations and updates
6. **Admin Dashboard**: Manage and respond to bulk orders/quotes
7. **PDF Quote Generation**: Generate professional quote PDFs
8. **Approval Workflow**: Multi-level approval for large orders

## Support

For issues or questions:
- Check the console for error messages
- Verify database tables are created correctly
- Ensure API endpoints are accessible
- Review network requests in browser dev tools

## Testing

1. Navigate to `/bulk-order`
2. Add multiple products with different quantities
3. Verify volume discounts are calculated correctly
4. Test quote request submission
5. Test bulk order submission
6. Verify data is saved to database tables

