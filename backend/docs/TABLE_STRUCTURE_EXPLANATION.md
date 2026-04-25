# Database Table Structure Explanation

## Product Tables

### 1. **Products** Table (CMS Products)
- **Purpose**: Stores products created via `/Employee/Admin/Products` (CMS page)
- **Location**: Main product catalog for customer-facing website
- **Variations**: Uses `ProductVariations` table
- **Inventory Tracking**: Uses `ProductInventory` table (via `ProductID`)

### 2. **InventoryProducts** Table (Inventory Products)
- **Purpose**: Stores products created via `/Employee/Admin/ProductInventory` (Inventory Management page)
- **Location**: Internal inventory management system
- **Variations**: Uses `InventoryProductVariations` table
- **Inventory Tracking**: Uses `ProductInventory` table (via `InventoryProductID`)

## Inventory Tracking Table

### 3. **ProductInventory** Table
- **Purpose**: Tracks inventory quantities and statuses (available, damaged, returned, repaired, disposed)
- **Can Reference**:
  - `ProductID` → Links to `Products` table (CMS products)
  - `InventoryProductID` → Links to `InventoryProducts` table (inventory products)
- **Constraint**: Only ONE of `ProductID` or `InventoryProductID` can be set (CHECK constraint)
- **Structure**: 1 row per product with status quantity columns:
  - `AvailableQuantity`
  - `DamagedQuantity`
  - `ReturnedQuantity`
  - `RepairedQuantity`
  - `DisposedQuantity`

## Variations Tables

### 4. **ProductVariations** Table
- **Purpose**: Variations for CMS products (`Products` table)
- **References**: `ProductID` → `Products` table
- **Used By**: `/Employee/Admin/Products` page

### 5. **InventoryProductVariations** Table
- **Purpose**: Variations for inventory products (`InventoryProducts` table)
- **References**: `InventoryProductID` → `InventoryProducts` table
- **Used By**: `/Employee/Admin/ProductInventory` page

## Summary

```
Products (CMS)
├── ProductVariations (variations for CMS products)
└── ProductInventory (inventory tracking via ProductID)

InventoryProducts (Inventory Management)
├── InventoryProductVariations (variations for inventory products)
└── ProductInventory (inventory tracking via InventoryProductID)
```

## Key Points

1. **Products** and **InventoryProducts** are separate product catalogs
2. **ProductInventory** is the shared inventory tracking table for both
3. Each product type has its own variations table
4. A product can be tracked in **ProductInventory** by either:
   - `ProductID` (if it's a CMS product)
   - `InventoryProductID` (if it's an inventory product)

