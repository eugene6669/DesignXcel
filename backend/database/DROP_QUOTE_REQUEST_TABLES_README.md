# Drop Quote Request Tables Migration

This migration removes the quote request tables from the database after removing quote request functionality from the application.

## Tables to be Dropped

1. **BulkOrderQuoteItems** - Contains items for each quote request
2. **BulkOrderQuotes** - Contains quote request information

## ⚠️ WARNING

**This will permanently delete all quote request data!**

Make sure to backup your database before running this script if you need to preserve any quote request data.

## How to Run

### Option 1: Using Node.js Script (Recommended)

```bash
# Make sure you have the database connection environment variables set
# Or modify the script with your database credentials

node backend/database/drop_quote_request_tables.js
```

### Option 2: Using SQL Script Directly

You can run the SQL script directly using SQL Server Management Studio (SSMS) or sqlcmd:

```bash
# Using sqlcmd
sqlcmd -S <server> -d <database> -U <username> -P <password> -i backend/database/drop_quote_request_tables.sql
```

### Option 3: Using PowerShell (if you have the run_migrations.ps1 script)

You can add this migration to the PowerShell migration script and run it:

```powershell
.\backend\database\run_migrations.ps1
```

## Environment Variables

The Node.js script uses the following environment variables (with defaults):

- `DB_SERVER` - Database server (default: 'localhost')
- `DB_NAME` - Database name (default: 'DesignXcel')
- `DB_USER` - Database username (default: 'sa')
- `DB_PASSWORD` - Database password (default: '')
- `DB_ENCRYPT` - Encrypt connection (default: 'true')
- `DB_TRUST_CERT` - Trust server certificate (default: 'true')

## What the Script Does

1. Checks if the `BulkOrderQuoteItems` table exists
2. Drops foreign key constraints from `BulkOrderQuoteItems`
3. Drops the `BulkOrderQuoteItems` table
4. Checks if the `BulkOrderQuotes` table exists
5. Drops any foreign key constraints from `BulkOrderQuotes` (if any)
6. Drops the `BulkOrderQuotes` table

## Verification

After running the script, you can verify that the tables have been dropped by running:

```sql
SELECT TABLE_NAME 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_NAME IN ('BulkOrderQuotes', 'BulkOrderQuoteItems');
```

This query should return no results if the tables have been successfully dropped.

## Rollback

If you need to restore the tables, you can:

1. Restore from a database backup (if you created one)
2. Re-run the `create_bulk_order_tables.sql` script (but it no longer creates quote request tables)

## Related Changes

- Quote request functionality has been removed from the frontend
- Quote request API endpoints have been removed from the backend
- Quote request routes have been removed
- Quote request email function has been removed from sendgridHelper.js
- AdminQuoteRequests.ejs view file has been deleted

## Notes

- The script is idempotent - it can be run multiple times safely
- If tables don't exist, the script will print a message and continue
- Indexes are automatically dropped when tables are dropped
- Foreign key constraints must be dropped before dropping tables

