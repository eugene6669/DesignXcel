-- Add ProductID column to InventoryProducts to link to Products table (CMS)
-- This allows InventoryProducts to be linked to customer-facing Products

-- Check if ProductID column exists in InventoryProducts
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'InventoryProducts'
    AND COLUMN_NAME = 'ProductID'
)
BEGIN
    ALTER TABLE [dbo].[InventoryProducts]
    ADD ProductID INT NULL;
    
    -- Add foreign key constraint if Products table exists
    IF OBJECT_ID('dbo.Products', 'U') IS NOT NULL
    BEGIN
        ALTER TABLE [dbo].[InventoryProducts]
        ADD CONSTRAINT FK_InventoryProducts_ProductID 
            FOREIGN KEY (ProductID) 
            REFERENCES Products(ProductID) 
            ON DELETE SET NULL;
        
        PRINT 'ProductID column and foreign key constraint added to InventoryProducts table.';
    END
    ELSE
    BEGIN
        PRINT 'ProductID column added to InventoryProducts table (Products table not found, skipping foreign key).';
    END
    
    -- Create index for better query performance
    CREATE INDEX IX_InventoryProducts_ProductID ON InventoryProducts(ProductID);
    
    PRINT 'ProductID column added to InventoryProducts table successfully.';
END
ELSE
BEGIN
    PRINT 'ProductID column already exists in InventoryProducts table.';
END
GO

-- Update existing InventoryProducts to link to Products where names match
-- This is a one-time migration to link existing products
IF EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'InventoryProducts'
    AND COLUMN_NAME = 'ProductID'
)
BEGIN
    UPDATE ip
    SET ip.ProductID = p.ProductID
    FROM InventoryProducts ip
    INNER JOIN Products p ON ip.Name = p.Name
    WHERE ip.ProductID IS NULL
      AND p.IsActive = 1
      AND ip.IsActive = 1;
    
    PRINT 'Linked existing InventoryProducts to Products where names match.';
END
GO

