-- Remove CostOfGoods column from Products table
-- This column is no longer needed
-- First, we need to drop any constraints (default constraints, check constraints, etc.) on the column

-- Step 1: Drop default constraints on CostOfGoods column
DECLARE @constraintName NVARCHAR(128);
DECLARE @sql NVARCHAR(MAX);

-- Find and drop default constraints
DECLARE constraint_cursor CURSOR FOR
SELECT 
    dc.name AS ConstraintName
FROM sys.default_constraints dc
INNER JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
INNER JOIN sys.tables t ON c.object_id = t.object_id
WHERE t.name = 'Products'
AND c.name IN ('CostOfGoods', 'costofgoods', 'CostOfGoodsSold', 'COGS');

OPEN constraint_cursor;
FETCH NEXT FROM constraint_cursor INTO @constraintName;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @sql = 'ALTER TABLE [dbo].[Products] DROP CONSTRAINT [' + @constraintName + ']';
    EXEC sp_executesql @sql;
    PRINT 'Dropped constraint: ' + @constraintName;
    FETCH NEXT FROM constraint_cursor INTO @constraintName;
END;

CLOSE constraint_cursor;
DEALLOCATE constraint_cursor;

-- Step 2: Drop check constraints on CostOfGoods column
DECLARE check_cursor CURSOR FOR
SELECT 
    cc.name AS ConstraintName
FROM sys.check_constraints cc
INNER JOIN sys.columns c ON cc.parent_object_id = c.object_id
INNER JOIN sys.tables t ON c.object_id = t.object_id
WHERE t.name = 'Products'
AND c.name IN ('CostOfGoods', 'costofgoods', 'CostOfGoodsSold', 'COGS');

OPEN check_cursor;
FETCH NEXT FROM check_cursor INTO @constraintName;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @sql = 'ALTER TABLE [dbo].[Products] DROP CONSTRAINT [' + @constraintName + ']';
    EXEC sp_executesql @sql;
    PRINT 'Dropped check constraint: ' + @constraintName;
    FETCH NEXT FROM check_cursor INTO @constraintName;
END;

CLOSE check_cursor;
DEALLOCATE check_cursor;

-- Step 3: Drop foreign key constraints (if any) that reference CostOfGoods
-- This is less likely but we check anyway
DECLARE fk_cursor CURSOR FOR
SELECT 
    fk.name AS ConstraintName
FROM sys.foreign_keys fk
INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
INNER JOIN sys.columns c ON fkc.parent_object_id = c.object_id AND fkc.parent_column_id = c.column_id
INNER JOIN sys.tables t ON c.object_id = t.object_id
WHERE t.name = 'Products'
AND c.name IN ('CostOfGoods', 'costofgoods', 'CostOfGoodsSold', 'COGS');

OPEN fk_cursor;
FETCH NEXT FROM fk_cursor INTO @constraintName;

WHILE @@FETCH_STATUS = 0
BEGIN
    SET @sql = 'ALTER TABLE [dbo].[Products] DROP CONSTRAINT [' + @constraintName + ']';
    EXEC sp_executesql @sql;
    PRINT 'Dropped foreign key constraint: ' + @constraintName;
    FETCH NEXT FROM fk_cursor INTO @constraintName;
END;

CLOSE fk_cursor;
DEALLOCATE fk_cursor;

-- Step 4: Now drop the column(s)
-- Check if CostOfGoods column exists in Products table
IF EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Products'
    AND COLUMN_NAME = 'CostOfGoods'
)
BEGIN
    -- Drop the column
    ALTER TABLE [dbo].[Products]
    DROP COLUMN CostOfGoods;
    
    PRINT 'CostOfGoods column removed from Products table successfully.';
END
ELSE
BEGIN
    PRINT 'CostOfGoods column does not exist in Products table.';
END
GO

-- Also check for variations of the column name (case-insensitive)
IF EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Products'
    AND (COLUMN_NAME = 'CostOfGoods' 
         OR COLUMN_NAME = 'costofgoods' 
         OR COLUMN_NAME = 'CostOfGoodsSold'
         OR COLUMN_NAME = 'COGS')
)
BEGIN
    -- Get the actual column name
    DECLARE @columnName NVARCHAR(128);
    SELECT @columnName = COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'Products'
    AND (COLUMN_NAME = 'CostOfGoods' 
         OR COLUMN_NAME = 'costofgoods' 
         OR COLUMN_NAME = 'CostOfGoodsSold'
         OR COLUMN_NAME = 'COGS');
    
    -- Drop using dynamic SQL to handle different column names
    DECLARE @dropSql NVARCHAR(MAX);
    SET @dropSql = 'ALTER TABLE [dbo].[Products] DROP COLUMN [' + @columnName + ']';
    EXEC sp_executesql @dropSql;
    
    PRINT 'Cost of goods related column (' + @columnName + ') removed from Products table successfully.';
END
GO

PRINT 'Cost of goods column removal script completed.';

