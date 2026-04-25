-- Migration: Add PickupDate column to BulkOrders table
-- This script adds a PickupDate column to store pickup date/time separately from Notes

-- Check if PickupDate column exists, if not add it
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[BulkOrders]') 
    AND name = 'PickupDate'
)
BEGIN
    ALTER TABLE [dbo].[BulkOrders]
    ADD PickupDate DATETIME2(0) NULL;
    
    PRINT 'PickupDate column added to BulkOrders table successfully!';
END
ELSE
BEGIN
    PRINT 'PickupDate column already exists in BulkOrders table.';
END
GO

