-- Add ExtraDeliveryFee column to Orders table
-- This column stores the extra delivery fee charged when product quantity exceeds 4
-- The fee is calculated based on product categories (e.g., Cabinet has higher rate than Chair)

-- Check if column already exists before adding
IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Orders]') 
    AND name = 'ExtraDeliveryFee'
)
BEGIN
    ALTER TABLE Orders
    ADD ExtraDeliveryFee DECIMAL(10, 2) NULL DEFAULT 0;
    
    PRINT 'ExtraDeliveryFee column added successfully to Orders table';
END
ELSE
BEGIN
    PRINT 'ExtraDeliveryFee column already exists in Orders table';
END

-- Add comment for documentation
EXEC sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Extra delivery fee charged when total product quantity exceeds 4. Fee is calculated based on product categories (Cabinet: ₱150/item, Chair: ₱80/item, Table: ₱100/item, Default: ₱100/item).', 
    @level0type = N'SCHEMA', @level0name = N'dbo', 
    @level1type = N'TABLE', @level1name = N'Orders', 
    @level2type = N'COLUMN', @level2name = N'ExtraDeliveryFee';

