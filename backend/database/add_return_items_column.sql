-- Add ReturnItems column to Orders table
-- This column stores JSON data of items being returned in partial returns
-- Format: [{"productId": 1, "variationId": null, "quantity": 2, "priceAtPurchase": 100.00}, ...]

-- Check if column already exists before adding
IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('Orders') 
    AND name = 'ReturnItems'
)
BEGIN
    ALTER TABLE Orders
    ADD ReturnItems NVARCHAR(MAX) NULL;
    
    PRINT 'ReturnItems column added to Orders table';
END
ELSE
BEGIN
    PRINT 'ReturnItems column already exists in Orders table';
END
GO

-- Add comment/description for the column
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'JSON array storing items being returned in partial returns. Format: [{"productId": int, "variationId": int|null, "quantity": int, "priceAtPurchase": decimal}]', 
    @level0type = N'SCHEMA', @level0name = N'dbo', 
    @level1type = N'TABLE', @level1name = N'Orders', 
    @level2type = N'COLUMN', @level2name = N'ReturnItems';
GO

