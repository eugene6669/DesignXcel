-- =============================================
-- Script: Add ProductName Column to OrderItems
-- Description: Adds ProductName column to store product name at purchase time
-- =============================================

USE DesignXcellDB;
GO

PRINT '================================================';
PRINT 'Adding ProductName Column to OrderItems...';
PRINT '================================================';

-- Check if column already exists
IF NOT EXISTS (
    SELECT 1 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'OrderItems' 
    AND COLUMN_NAME = 'ProductName'
)
BEGIN
    -- Add ProductName column
    ALTER TABLE OrderItems
    ADD ProductName NVARCHAR(255) NULL;
    
    PRINT '✓ ProductName column added to OrderItems table';
END
ELSE
BEGIN
    PRINT '⚠ ProductName column already exists in OrderItems table';
END

GO

-- Update existing records (if any) with product names from Products table
DECLARE @ExistingCount INT;
SELECT @ExistingCount = COUNT(*) FROM OrderItems;

IF @ExistingCount > 0
BEGIN
    UPDATE oi
    SET oi.ProductName = p.Name
    FROM OrderItems oi
    INNER JOIN Products p ON oi.ProductID = p.ProductID
    WHERE oi.ProductName IS NULL OR oi.ProductName = '';
    
    DECLARE @UpdatedCount INT = @@ROWCOUNT;
    PRINT '✓ Updated ' + CAST(@UpdatedCount AS VARCHAR) + ' existing order items with product names';
END
ELSE
BEGIN
    PRINT '✓ No existing order items to update (table is empty)';
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
