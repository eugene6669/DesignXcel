# Database Migration Required

## Issue
The application code references columns `RefundAmount` and `ReturnShippingFee` in the `Orders` table, but these columns may not exist in your database.

## Solution

### Option 1: Run the Migration Script (Recommended)
Run the migration script to add the missing columns:

```sql
-- Execute this script in your SQL Server database
-- File: backend/database/add_return_fee_columns.sql
```

This script will:
- Add `ReturnShippingFee` column (if missing)
- Add `RefundAmount` column (if missing)

### Option 2: Code Already Handles Missing Columns
The code has been updated to check for column existence before using them. However, for full functionality, you should run the migration script.

## How to Run the Migration

### Using SQL Server Management Studio (SSMS):
1. Open SSMS and connect to your database
2. Open the file `backend/database/add_return_fee_columns.sql`
3. Execute the script

### Using sqlcmd:
```bash
sqlcmd -S your-server -d your-database -i backend/database/add_return_fee_columns.sql
```

### Using Railway/Cloud Database:
1. Connect to your database using your preferred SQL client
2. Copy and paste the contents of `add_return_fee_columns.sql`
3. Execute the script

## Verification

After running the migration, verify the columns exist:

```sql
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Orders'
AND COLUMN_NAME IN ('RefundAmount', 'ReturnShippingFee')
ORDER BY COLUMN_NAME;
```

You should see both columns listed.

## Notes

- The columns are nullable (NULL allowed), so existing data won't be affected
- The code will work without these columns (returns 0 as default), but full refund functionality requires them
- These columns are used for tracking return/refund processing

