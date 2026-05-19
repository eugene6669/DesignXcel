USE [YourDatabaseName]; -- Replace with your actual database name
GO

-- Script to delete all discount records from ProductDiscounts table
-- WARNING: This will permanently delete all discount data!

-- Check if ProductDiscounts table exists
IF EXISTS (
    SELECT 1
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_NAME = 'ProductDiscounts'
)
BEGIN
    -- Count records before deletion
    DECLARE @RecordCount INT;
    SELECT @RecordCount = COUNT(*) FROM [dbo].[ProductDiscounts];
    
    PRINT 'Found ' + CAST(@RecordCount AS VARCHAR(10)) + ' discount record(s) in ProductDiscounts table.';
    
    -- Delete all records from ProductDiscounts table
    DELETE FROM [dbo].[ProductDiscounts];
    
    PRINT 'All discount records have been deleted from ProductDiscounts table.';
    PRINT 'Total records deleted: ' + CAST(@RecordCount AS VARCHAR(10));
END
ELSE
BEGIN
    PRINT 'ProductDiscounts table does not exist.';
END
GO

PRINT 'Discount deletion script completed.';
GO

