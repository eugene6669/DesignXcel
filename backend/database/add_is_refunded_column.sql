-- Add IsRefunded column to Orders table for tracking refunded orders
-- This allows sales reports to properly calculate net sales (gross - refunds)

IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') 
    AND name = 'IsRefunded'
)
BEGIN
    ALTER TABLE [dbo].[Orders]
    ADD IsRefunded BIT DEFAULT 0;
    PRINT 'IsRefunded column added to Orders table';
END
ELSE
BEGIN
    PRINT 'IsRefunded column already exists in Orders table';
END
GO

