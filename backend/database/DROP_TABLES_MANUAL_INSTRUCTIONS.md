# Manual Instructions to Drop Quote Request Tables

If the automated script is not working due to database connection issues, you can manually drop the tables using one of these methods:

## Method 1: Using SQL Server Management Studio (SSMS) - Recommended

1. Open SQL Server Management Studio
2. Connect to your database server
3. Select your database (e.g., `DesignXcellDB`)
4. Open a new query window
5. Copy and paste the following SQL script:

```sql
-- Drop BulkOrderQuoteItems table first (due to foreign key constraints)
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[BulkOrderQuoteItems]') AND type in (N'U'))
BEGIN
    -- Drop foreign key constraints first
    IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_BulkOrderQuoteItems_Quotes' AND parent_object_id = OBJECT_ID(N'[dbo].[BulkOrderQuoteItems]'))
        ALTER TABLE [dbo].[BulkOrderQuoteItems] DROP CONSTRAINT FK_BulkOrderQuoteItems_Quotes;
    
    IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_BulkOrderQuoteItems_Products' AND parent_object_id = OBJECT_ID(N'[dbo].[BulkOrderQuoteItems]'))
        ALTER TABLE [dbo].[BulkOrderQuoteItems] DROP CONSTRAINT FK_BulkOrderQuoteItems_Products;
    
    -- Drop the table
    DROP TABLE [dbo].[BulkOrderQuoteItems];
    PRINT 'BulkOrderQuoteItems table dropped successfully!';
END
ELSE
BEGIN
    PRINT 'BulkOrderQuoteItems table does not exist.';
END
GO

-- Drop BulkOrderQuotes table
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[BulkOrderQuotes]') AND type in (N'U'))
BEGIN
    -- Drop any foreign key constraints
    DECLARE @fkName NVARCHAR(255);
    DECLARE @sql NVARCHAR(MAX);
    DECLARE fk_cursor CURSOR FOR
        SELECT name FROM sys.foreign_keys 
        WHERE parent_object_id = OBJECT_ID(N'[dbo].[BulkOrderQuotes]');
    
    OPEN fk_cursor;
    FETCH NEXT FROM fk_cursor INTO @fkName;
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @sql = 'ALTER TABLE [dbo].[BulkOrderQuotes] DROP CONSTRAINT ' + @fkName;
        EXEC sp_executesql @sql;
        PRINT 'Dropped foreign key constraint: ' + @fkName;
        FETCH NEXT FROM fk_cursor INTO @fkName;
    END
    
    CLOSE fk_cursor;
    DEALLOCATE fk_cursor;
    
    -- Drop the table
    DROP TABLE [dbo].[BulkOrderQuotes];
    PRINT 'BulkOrderQuotes table dropped successfully!';
END
ELSE
BEGIN
    PRINT 'BulkOrderQuotes table does not exist.';
END
GO

PRINT '========================================';
PRINT 'Quote request tables removal completed!';
PRINT '========================================';
```

6. Execute the query (F5 or click Execute)
7. Verify the tables are dropped by running:

```sql
SELECT TABLE_NAME 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_NAME IN ('BulkOrderQuotes', 'BulkOrderQuoteItems');
```

This should return no results.

## Method 2: Using sqlcmd Command Line

```bash
sqlcmd -S DESKTOP-F4OI6BT\SQLEXPRESS -d DesignXcellDB -U DesignXcel -P "YourPassword" -i backend/database/drop_quote_request_tables.sql
```

Or if using Windows Authentication:

```bash
sqlcmd -S DESKTOP-F4OI6BT\SQLEXPRESS -d DesignXcellDB -E -i backend/database/drop_quote_request_tables.sql
```

## Method 3: Using Azure Data Studio

1. Open Azure Data Studio
2. Connect to your database
3. Open the SQL file: `backend/database/drop_quote_request_tables.sql`
4. Execute the script

## Method 4: Simple Drop (If you're sure the tables exist)

If you're certain the tables exist and you want to drop them directly:

```sql
-- Drop in correct order (child table first)
DROP TABLE IF EXISTS [dbo].[BulkOrderQuoteItems];
DROP TABLE IF EXISTS [dbo].[BulkOrderQuotes];
```

Note: `DROP TABLE IF EXISTS` is available in SQL Server 2016 and later. For older versions, use the IF EXISTS check shown in Method 1.

## Troubleshooting

### If you get "Cannot drop table because it is referenced by a foreign key constraint"

Make sure to drop the foreign key constraints first, or drop the tables in the correct order (child table first).

### If tables don't exist

If the tables don't exist, that's fine! The script is idempotent and will just print a message saying the tables don't exist.

### Verify Tables are Dropped

Run this query to verify:

```sql
SELECT TABLE_NAME 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_NAME IN ('BulkOrderQuotes', 'BulkOrderQuoteItems');
```

If the query returns no rows, the tables have been successfully dropped.

## Alternative: Check if Tables Exist First

Before dropping, you can check if the tables exist:

```sql
SELECT TABLE_NAME 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_NAME IN ('BulkOrderQuotes', 'BulkOrderQuoteItems');
```

If this returns rows, the tables exist and need to be dropped. If it returns no rows, the tables don't exist and nothing needs to be done.

