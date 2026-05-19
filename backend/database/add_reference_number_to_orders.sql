-- Add ReferenceNumber column to Orders table
-- This migration adds a reference number column that will store human-readable order numbers

-- Check if the column already exists
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Orders' AND COLUMN_NAME = 'ReferenceNumber'
)
BEGIN
    -- Add the ReferenceNumber column
    ALTER TABLE Orders
    ADD ReferenceNumber NVARCHAR(50) NULL;
    
    PRINT 'ReferenceNumber column added successfully to Orders table';
    
    -- Generate reference numbers for existing orders
    -- Format: ORD + YYYYMMDD + padded OrderID (e.g., ORD20241201001)
    UPDATE Orders
    SET ReferenceNumber = 'ORD' + FORMAT(OrderDate, 'yyyyMMdd') + RIGHT('000' + CAST(OrderID AS NVARCHAR), 3)
    WHERE ReferenceNumber IS NULL;
    
    PRINT 'Reference numbers generated for existing orders';
    
    -- Create an index on ReferenceNumber for better query performance
    IF NOT EXISTS (
        SELECT * FROM sys.indexes 
        WHERE name = 'IX_Orders_ReferenceNumber'
    )
    BEGIN
        CREATE INDEX IX_Orders_ReferenceNumber ON Orders(ReferenceNumber);
        PRINT 'Index created on ReferenceNumber column';
    END
END
ELSE
BEGIN
    PRINT 'ReferenceNumber column already exists in Orders table';
    
    -- If column exists, just update any NULL reference numbers
    UPDATE Orders
    SET ReferenceNumber = 'ORD' + FORMAT(OrderDate, 'yyyyMMdd') + RIGHT('000' + CAST(OrderID AS NVARCHAR), 3)
    WHERE ReferenceNumber IS NULL;
    
    IF @@ROWCOUNT > 0
    BEGIN
        PRINT 'Reference numbers updated for orders that were missing them';
    END
    
    -- Create index if it doesn't exist
    IF NOT EXISTS (
        SELECT * FROM sys.indexes 
        WHERE name = 'IX_Orders_ReferenceNumber'
    )
    BEGIN
        CREATE INDEX IX_Orders_ReferenceNumber ON Orders(ReferenceNumber);
        PRINT 'Index created on ReferenceNumber column';
    END
END

