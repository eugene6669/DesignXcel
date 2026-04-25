-- Add CostOfGoods column to Products table
-- This script adds a CostOfGoods column to track the cost of goods for products

USE [YourDatabaseName]; -- Replace with your actual database name
GO

-- Check if CostOfGoods column already exists in Products table
IF NOT EXISTS (
    SELECT 1 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Products' 
    AND COLUMN_NAME = 'CostOfGoods'
)
BEGIN
    ALTER TABLE [dbo].[Products]
    ADD [CostOfGoods] DECIMAL(10, 2) NULL DEFAULT 0.00;
    
    PRINT 'CostOfGoods column added to Products table successfully.';
END
ELSE
BEGIN
    PRINT 'CostOfGoods column already exists in Products table.';
END
GO

-- Check if CostOfGoods column already exists in ProductVariations table
IF NOT EXISTS (
    SELECT 1 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'ProductVariations' 
    AND COLUMN_NAME = 'CostOfGoods'
)
BEGIN
    ALTER TABLE [dbo].[ProductVariations]
    ADD [CostOfGoods] DECIMAL(10, 2) NULL DEFAULT 0.00;
    
    PRINT 'CostOfGoods column added to ProductVariations table successfully.';
END
ELSE
BEGIN
    PRINT 'CostOfGoods column already exists in ProductVariations table.';
END
GO

-- Update existing records to have 0.00 as default CostOfGoods if they are NULL
UPDATE [dbo].[Products]
SET [CostOfGoods] = 0.00
WHERE [CostOfGoods] IS NULL;
GO

UPDATE [dbo].[ProductVariations]
SET [CostOfGoods] = 0.00
WHERE [CostOfGoods] IS NULL;
GO

PRINT 'CostOfGoods columns added successfully to both Products and ProductVariations tables.';
GO

