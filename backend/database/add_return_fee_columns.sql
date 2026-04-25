-- Add fee columns to Orders table for return processing
-- These columns store return shipping fees and calculated refund amounts

-- Check if ReturnShippingFee column exists, if not add it
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') 
    AND name = 'ReturnShippingFee'
)
BEGIN
    ALTER TABLE [dbo].[Orders]
    ADD ReturnShippingFee DECIMAL(10, 2) NULL;
    PRINT 'ReturnShippingFee column added to Orders table';
END
ELSE
BEGIN
    PRINT 'ReturnShippingFee column already exists in Orders table';
END
GO

-- Check if RefundAmount column exists, if not add it
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') 
    AND name = 'RefundAmount'
)
BEGIN
    ALTER TABLE [dbo].[Orders]
    ADD RefundAmount DECIMAL(10, 2) NULL;
    PRINT 'RefundAmount column added to Orders table';
END
ELSE
BEGIN
    PRINT 'RefundAmount column already exists in Orders table';
END
GO

