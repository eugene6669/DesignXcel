-- =============================================
-- Script to Remove Discount Columns from Products and Orders Tables
-- =============================================
-- This script removes all discount-related columns from:
-- 1. Products table
-- 2. Orders table
-- 3. WalkInOrders table (if it exists)
-- =============================================
-- Note: Run this script in the context of your target database
-- =============================================

PRINT 'Starting removal of discount columns...'
GO

-- =============================================
-- 1. Remove Discount column from Products table (if exists)
-- =============================================
IF EXISTS (
    SELECT * 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Products]') 
    AND name = 'Discount'
)
BEGIN
    PRINT 'Removing Discount column from Products table...'
    
    -- Drop default constraint if it exists
    DECLARE @constraintName NVARCHAR(200)
    SELECT @constraintName = name
    FROM sys.default_constraints
    WHERE parent_object_id = OBJECT_ID(N'[dbo].[Products]')
    AND parent_column_id = (
        SELECT column_id 
        FROM sys.columns 
        WHERE object_id = OBJECT_ID(N'[dbo].[Products]') 
        AND name = 'Discount'
    )
    
    IF @constraintName IS NOT NULL
    BEGIN
        DECLARE @dropConstraintSQL NVARCHAR(MAX) = 'ALTER TABLE [dbo].[Products] DROP CONSTRAINT [' + @constraintName + ']'
        EXEC sp_executesql @dropConstraintSQL
        PRINT 'Dropped default constraint: ' + @constraintName
    END
    
    -- Now drop the column
    ALTER TABLE [dbo].[Products] DROP COLUMN [Discount]
    PRINT 'Discount column removed from Products table.'
END
ELSE
BEGIN
    PRINT 'Discount column does not exist in Products table.'
END
GO

-- =============================================
-- 2. Remove Discount column from Orders table (if exists)
-- =============================================
IF EXISTS (
    SELECT * 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') 
    AND name = 'Discount'
)
BEGIN
    PRINT 'Removing Discount column from Orders table...'
    
    -- Drop default constraint if it exists
    DECLARE @constraintName2 NVARCHAR(200)
    SELECT @constraintName2 = name
    FROM sys.default_constraints
    WHERE parent_object_id = OBJECT_ID(N'[dbo].[Orders]')
    AND parent_column_id = (
        SELECT column_id 
        FROM sys.columns 
        WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') 
        AND name = 'Discount'
    )
    
    IF @constraintName2 IS NOT NULL
    BEGIN
        DECLARE @dropConstraintSQL2 NVARCHAR(MAX) = 'ALTER TABLE [dbo].[Orders] DROP CONSTRAINT [' + @constraintName2 + ']'
        EXEC sp_executesql @dropConstraintSQL2
        PRINT 'Dropped default constraint: ' + @constraintName2
    END
    
    -- Now drop the column
    ALTER TABLE [dbo].[Orders] DROP COLUMN [Discount]
    PRINT 'Discount column removed from Orders table.'
END
ELSE
BEGIN
    PRINT 'Discount column does not exist in Orders table.'
END
GO

-- =============================================
-- 3. Remove Discount column from WalkInOrders table (if exists)
-- =============================================
IF EXISTS (
    SELECT * 
    FROM sys.objects 
    WHERE object_id = OBJECT_ID(N'[dbo].[WalkInOrders]') 
    AND type in (N'U')
)
BEGIN
    IF EXISTS (
        SELECT * 
        FROM sys.columns 
        WHERE object_id = OBJECT_ID(N'[dbo].[WalkInOrders]') 
        AND name = 'Discount'
    )
    BEGIN
        PRINT 'Removing Discount column from WalkInOrders table...'
        
        -- Drop default constraint if it exists
        DECLARE @constraintName3 NVARCHAR(200)
        SELECT @constraintName3 = name
        FROM sys.default_constraints
        WHERE parent_object_id = OBJECT_ID(N'[dbo].[WalkInOrders]')
        AND parent_column_id = (
            SELECT column_id 
            FROM sys.columns 
            WHERE object_id = OBJECT_ID(N'[dbo].[WalkInOrders]') 
            AND name = 'Discount'
        )
        
        IF @constraintName3 IS NOT NULL
        BEGIN
            DECLARE @dropConstraintSQL3 NVARCHAR(MAX) = 'ALTER TABLE [dbo].[WalkInOrders] DROP CONSTRAINT [' + @constraintName3 + ']'
            EXEC sp_executesql @dropConstraintSQL3
            PRINT 'Dropped default constraint: ' + @constraintName3
        END
        
        -- Now drop the column
        ALTER TABLE [dbo].[WalkInOrders] DROP COLUMN [Discount]
        PRINT 'Discount column removed from WalkInOrders table.'
    END
    ELSE
    BEGIN
        PRINT 'Discount column does not exist in WalkInOrders table.'
    END
END
ELSE
BEGIN
    PRINT 'WalkInOrders table does not exist.'
END
GO

-- =============================================
-- 4. Remove DiscountAmount column from Products table (if exists)
-- =============================================
IF EXISTS (
    SELECT * 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Products]') 
    AND name = 'DiscountAmount'
)
BEGIN
    PRINT 'Removing DiscountAmount column from Products table...'
    ALTER TABLE [dbo].[Products] DROP COLUMN [DiscountAmount]
    PRINT 'DiscountAmount column removed from Products table.'
END
ELSE
BEGIN
    PRINT 'DiscountAmount column does not exist in Products table.'
END
GO

-- =============================================
-- 5. Remove DiscountAmount column from Orders table (if exists)
-- =============================================
IF EXISTS (
    SELECT * 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') 
    AND name = 'DiscountAmount'
)
BEGIN
    PRINT 'Removing DiscountAmount column from Orders table...'
    
    -- Drop default constraint if it exists
    DECLARE @constraintName4 NVARCHAR(200)
    SELECT @constraintName4 = name
    FROM sys.default_constraints
    WHERE parent_object_id = OBJECT_ID(N'[dbo].[Orders]')
    AND parent_column_id = (
        SELECT column_id 
        FROM sys.columns 
        WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') 
        AND name = 'DiscountAmount'
    )
    
    IF @constraintName4 IS NOT NULL
    BEGIN
        DECLARE @dropConstraintSQL4 NVARCHAR(MAX) = 'ALTER TABLE [dbo].[Orders] DROP CONSTRAINT [' + @constraintName4 + ']'
        EXEC sp_executesql @dropConstraintSQL4
        PRINT 'Dropped default constraint: ' + @constraintName4
    END
    
    -- Now drop the column
    ALTER TABLE [dbo].[Orders] DROP COLUMN [DiscountAmount]
    PRINT 'DiscountAmount column removed from Orders table.'
END
ELSE
BEGIN
    PRINT 'DiscountAmount column does not exist in Orders table.'
END
GO

-- =============================================
-- 6. Remove DiscountPercent column from Products table (if exists)
-- =============================================
IF EXISTS (
    SELECT * 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Products]') 
    AND name = 'DiscountPercent'
)
BEGIN
    PRINT 'Removing DiscountPercent column from Products table...'
    ALTER TABLE [dbo].[Products] DROP COLUMN [DiscountPercent]
    PRINT 'DiscountPercent column removed from Products table.'
END
ELSE
BEGIN
    PRINT 'DiscountPercent column does not exist in Products table.'
END
GO

-- =============================================
-- 7. Remove DiscountPercent column from Orders table (if exists)
-- =============================================
IF EXISTS (
    SELECT * 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') 
    AND name = 'DiscountPercent'
)
BEGIN
    PRINT 'Removing DiscountPercent column from Orders table...'
    ALTER TABLE [dbo].[Orders] DROP COLUMN [DiscountPercent]
    PRINT 'DiscountPercent column removed from Orders table.'
END
ELSE
BEGIN
    PRINT 'DiscountPercent column does not exist in Orders table.'
END
GO

-- =============================================
-- 8. Remove DiscountType column from Products table (if exists)
-- =============================================
IF EXISTS (
    SELECT * 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Products]') 
    AND name = 'DiscountType'
)
BEGIN
    PRINT 'Removing DiscountType column from Products table...'
    ALTER TABLE [dbo].[Products] DROP COLUMN [DiscountType]
    PRINT 'DiscountType column removed from Products table.'
END
ELSE
BEGIN
    PRINT 'DiscountType column does not exist in Products table.'
END
GO

-- =============================================
-- 9. Remove DiscountType column from Orders table (if exists)
-- =============================================
IF EXISTS (
    SELECT * 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') 
    AND name = 'DiscountType'
)
BEGIN
    PRINT 'Removing DiscountType column from Orders table...'
    ALTER TABLE [dbo].[Orders] DROP COLUMN [DiscountType]
    PRINT 'DiscountType column removed from Orders table.'
END
ELSE
BEGIN
    PRINT 'DiscountType column does not exist in Orders table.'
END
GO

-- =============================================
-- 10. Remove DiscountValue column from Products table (if exists)
-- =============================================
IF EXISTS (
    SELECT * 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Products]') 
    AND name = 'DiscountValue'
)
BEGIN
    PRINT 'Removing DiscountValue column from Products table...'
    ALTER TABLE [dbo].[Products] DROP COLUMN [DiscountValue]
    PRINT 'DiscountValue column removed from Products table.'
END
ELSE
BEGIN
    PRINT 'DiscountValue column does not exist in Products table.'
END
GO

-- =============================================
-- 11. Remove DiscountValue column from Orders table (if exists)
-- =============================================
IF EXISTS (
    SELECT * 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') 
    AND name = 'DiscountValue'
)
BEGIN
    PRINT 'Removing DiscountValue column from Orders table...'
    ALTER TABLE [dbo].[Orders] DROP COLUMN [DiscountValue]
    PRINT 'DiscountValue column removed from Orders table.'
END
ELSE
BEGIN
    PRINT 'DiscountValue column does not exist in Orders table.'
END
GO

-- =============================================
-- 12. Remove DiscountStartDate column from Products table (if exists)
-- =============================================
IF EXISTS (
    SELECT * 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Products]') 
    AND name = 'DiscountStartDate'
)
BEGIN
    PRINT 'Removing DiscountStartDate column from Products table...'
    ALTER TABLE [dbo].[Products] DROP COLUMN [DiscountStartDate]
    PRINT 'DiscountStartDate column removed from Products table.'
END
ELSE
BEGIN
    PRINT 'DiscountStartDate column does not exist in Products table.'
END
GO

-- =============================================
-- 13. Remove DiscountEndDate column from Products table (if exists)
-- =============================================
IF EXISTS (
    SELECT * 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Products]') 
    AND name = 'DiscountEndDate'
)
BEGIN
    PRINT 'Removing DiscountEndDate column from Products table...'
    ALTER TABLE [dbo].[Products] DROP COLUMN [DiscountEndDate]
    PRINT 'DiscountEndDate column removed from Products table.'
END
ELSE
BEGIN
    PRINT 'DiscountEndDate column does not exist in Products table.'
END
GO

-- =============================================
-- 14. Remove DiscountStartDate column from Orders table (if exists)
-- =============================================
IF EXISTS (
    SELECT * 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') 
    AND name = 'DiscountStartDate'
)
BEGIN
    PRINT 'Removing DiscountStartDate column from Orders table...'
    ALTER TABLE [dbo].[Orders] DROP COLUMN [DiscountStartDate]
    PRINT 'DiscountStartDate column removed from Orders table.'
END
ELSE
BEGIN
    PRINT 'DiscountStartDate column does not exist in Orders table.'
END
GO

-- =============================================
-- 15. Remove DiscountEndDate column from Orders table (if exists)
-- =============================================
IF EXISTS (
    SELECT * 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') 
    AND name = 'DiscountEndDate'
)
BEGIN
    PRINT 'Removing DiscountEndDate column from Orders table...'
    ALTER TABLE [dbo].[Orders] DROP COLUMN [DiscountEndDate]
    PRINT 'DiscountEndDate column removed from Orders table.'
END
ELSE
BEGIN
    PRINT 'DiscountEndDate column does not exist in Orders table.'
END
GO

-- =============================================
-- 16. Remove IsDiscounted column from Products table (if exists)
-- =============================================
IF EXISTS (
    SELECT * 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Products]') 
    AND name = 'IsDiscounted'
)
BEGIN
    PRINT 'Removing IsDiscounted column from Products table...'
    ALTER TABLE [dbo].[Products] DROP COLUMN [IsDiscounted]
    PRINT 'IsDiscounted column removed from Products table.'
END
ELSE
BEGIN
    PRINT 'IsDiscounted column does not exist in Products table.'
END
GO

-- =============================================
-- 17. Remove IsDiscounted column from Orders table (if exists)
-- =============================================
IF EXISTS (
    SELECT * 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') 
    AND name = 'IsDiscounted'
)
BEGIN
    PRINT 'Removing IsDiscounted column from Orders table...'
    ALTER TABLE [dbo].[Orders] DROP COLUMN [IsDiscounted]
    PRINT 'IsDiscounted column removed from Orders table.'
END
ELSE
BEGIN
    PRINT 'IsDiscounted column does not exist in Orders table.'
END
GO

PRINT '============================================='
PRINT 'Discount column removal completed!'
PRINT '============================================='
GO

