-- Drop Quote Request Tables Migration
-- This script removes the quote request tables (BulkOrderQuotes and BulkOrderQuoteItems)
-- These tables are no longer needed after removing quote request functionality
--
-- WARNING: This will permanently delete all quote request data!
-- Make sure to backup your database before running this script if you need to preserve data.

-- Drop BulkOrderQuoteItems table first (due to foreign key constraints)
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[BulkOrderQuoteItems]') AND type in (N'U'))
BEGIN
    -- Drop foreign key constraints first
    IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_BulkOrderQuoteItems_Quotes' AND parent_object_id = OBJECT_ID(N'[dbo].[BulkOrderQuoteItems]'))
        ALTER TABLE [dbo].[BulkOrderQuoteItems] DROP CONSTRAINT FK_BulkOrderQuoteItems_Quotes;
    
    IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_BulkOrderQuoteItems_Products' AND parent_object_id = OBJECT_ID(N'[dbo].[BulkOrderQuoteItems]'))
        ALTER TABLE [dbo].[BulkOrderQuoteItems] DROP CONSTRAINT FK_BulkOrderQuoteItems_Products;
    
    -- Drop the table (indexes will be automatically dropped)
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
    -- Drop foreign key constraints (if any to Users table for RespondedBy)
    -- Note: There might not be a foreign key constraint, so this is optional
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
    
    -- Drop the table (indexes will be automatically dropped)
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

