-- Add TransactionID column to Orders table
-- This column stores a unique transaction ID for each order (separate from Stripe Session ID)
-- Format: TXN + YYYYMMDDHHMMSS + random 6 digits (e.g., TXN20241113143052123456)

-- Check if column already exists before adding
IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') 
    AND name = 'TransactionID'
)
BEGIN
    ALTER TABLE Orders
    ADD TransactionID NVARCHAR(50) NULL;
    
    PRINT 'TransactionID column added successfully to Orders table';
END
ELSE
BEGIN
    PRINT 'TransactionID column already exists in Orders table';
END

-- Add index for better query performance
IF NOT EXISTS (
    SELECT 1 
    FROM sys.indexes 
    WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') 
    AND name = 'IX_Orders_TransactionID'
)
BEGIN
    CREATE INDEX IX_Orders_TransactionID ON Orders(TransactionID);
    PRINT 'Index IX_Orders_TransactionID created successfully';
END
ELSE
BEGIN
    PRINT 'Index IX_Orders_TransactionID already exists';
END

-- Add comment for documentation (only if it doesn't exist)
IF NOT EXISTS (
    SELECT 1 
    FROM sys.extended_properties 
    WHERE major_id = OBJECT_ID(N'[dbo].[Orders]')
    AND minor_id = COLUMNPROPERTY(OBJECT_ID(N'[dbo].[Orders]'), 'TransactionID', 'ColumnId')
    AND name = 'MS_Description'
)
BEGIN
    EXEC sp_addextendedproperty 
        @name = N'MS_Description', 
        @value = N'Unique transaction ID for the order. Format: TXN + YYYYMMDDHHMMSS + random 6 digits. This is separate from Stripe Session ID and is generated for all orders.', 
        @level0type = N'SCHEMA', @level0name = N'dbo', 
        @level1type = N'TABLE', @level1name = N'Orders', 
        @level2type = N'COLUMN', @level2name = N'TransactionID';
    PRINT 'MS_Description added to TransactionID column.';
END
ELSE
BEGIN
    PRINT 'MS_Description already exists for TransactionID column.';
END

