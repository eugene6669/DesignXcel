-- Remove CostOfGoods columns from Products and ProductVariations tables
-- This script removes the CostOfGoods columns that are no longer needed

USE [YourDatabaseName]; -- Replace with your actual database name
GO

-- Check if CostOfGoods column exists in Products table and drop it
IF EXISTS (
    SELECT 1 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Products' 
    AND COLUMN_NAME = 'CostOfGoods'
)
BEGIN
    ALTER TABLE [dbo].[Products]
    DROP COLUMN [CostOfGoods];
    
    PRINT 'CostOfGoods column removed from Products table successfully.';
END
ELSE
BEGIN
    PRINT 'CostOfGoods column does not exist in Products table.';
END
GO

-- Check if CostOfGoods column exists in ProductVariations table and drop it
IF EXISTS (
    SELECT 1 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'ProductVariations' 
    AND COLUMN_NAME = 'CostOfGoods'
)
BEGIN
    ALTER TABLE [dbo].[ProductVariations]
    DROP COLUMN [CostOfGoods];
    
    PRINT 'CostOfGoods column removed from ProductVariations table successfully.';
END
ELSE
BEGIN
    PRINT 'CostOfGoods column does not exist in ProductVariations table.';
END
GO

PRINT 'CostOfGoods columns removal process completed.';
GO

