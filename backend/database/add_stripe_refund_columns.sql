-- Add columns to track Stripe refund information
-- This allows tracking of refunds in Stripe dashboard

-- Check if StripeRefundID column exists, if not add it
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') 
    AND name = 'StripeRefundID'
)
BEGIN
    ALTER TABLE [dbo].[Orders]
    ADD StripeRefundID NVARCHAR(255) NULL;
    PRINT 'StripeRefundID column added to Orders table';
END
ELSE
BEGIN
    PRINT 'StripeRefundID column already exists in Orders table';
END
GO

-- Check if RefundDate column exists, if not add it
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') 
    AND name = 'RefundDate'
)
BEGIN
    ALTER TABLE [dbo].[Orders]
    ADD RefundDate DATETIME NULL;
    PRINT 'RefundDate column added to Orders table';
END
ELSE
BEGIN
    PRINT 'RefundDate column already exists in Orders table';
END
GO

