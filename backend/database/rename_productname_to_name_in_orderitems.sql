-- =============================================
-- Script: Rename ProductName to Name in OrderItems
-- Description: Renames ProductName column to Name for consistency with Products table
-- =============================================

USE DesignXcellDB;
GO

PRINT '================================================';
PRINT 'Renaming ProductName to Name in OrderItems...';
PRINT '================================================';

-- Check if ProductName column exists
IF EXISTS (
    SELECT 1 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'OrderItems' 
    AND COLUMN_NAME = 'ProductName'
)
BEGIN
    -- Check if Name column already exists
    IF NOT EXISTS (
        SELECT 1 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'OrderItems' 
        AND COLUMN_NAME = 'Name'
    )
    BEGIN
        -- Rename ProductName to Name
        EXEC sp_rename 'OrderItems.ProductName', 'Name', 'COLUMN';
        
        PRINT '✓ ProductName column renamed to Name';
    END
    ELSE
    BEGIN
        -- Name column already exists, copy data and drop ProductName
        PRINT '⚠ Name column already exists. Copying data from ProductName...';
        
        UPDATE OrderItems
        SET Name = ProductName
        WHERE Name IS NULL OR Name = '';
        
        ALTER TABLE OrderItems
        DROP COLUMN ProductName;
        
        PRINT '✓ Data copied and ProductName column dropped';
    END
END
ELSE IF EXISTS (
    SELECT 1 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'OrderItems' 
    AND COLUMN_NAME = 'Name'
)
BEGIN
    PRINT '✓ Name column already exists in OrderItems table';
END
ELSE
BEGIN
    -- Neither column exists, add Name column
    PRINT '⚠ Neither ProductName nor Name column exists. Adding Name column...';
    
    ALTER TABLE OrderItems
    ADD Name NVARCHAR(255) NULL;
    
    PRINT '✓ Name column added to OrderItems table';
    
    -- Update from Products table if ProductID exists
    UPDATE oi
    SET oi.Name = p.Name
    FROM OrderItems oi
    INNER JOIN Products p ON oi.ProductID = p.ProductID
    WHERE oi.Name IS NULL OR oi.Name = '';
END

GO

PRINT '';
PRINT '================================================';
PRINT '✅ Migration Completed Successfully!';
PRINT '================================================';

-- Show table structure
PRINT '';
PRINT 'OrderItems Columns:';
SELECT 
    COLUMN_NAME as ColumnName,
    DATA_TYPE as DataType,
    CHARACTER_MAXIMUM_LENGTH as MaxLength,
    IS_NULLABLE as IsNullable
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'OrderItems'
ORDER BY ORDINAL_POSITION;

GO

