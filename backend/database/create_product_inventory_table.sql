-- Create ProductInventory table for detailed inventory tracking
-- This table tracks individual product items in inventory with status, images, and dimensions

-- Check if InventoryStatus column exists in Products table, if not add it
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Products' 
    AND COLUMN_NAME = 'InventoryStatus'
)
BEGIN
    ALTER TABLE [dbo].[Products]
    ADD InventoryStatus NVARCHAR(50) NULL DEFAULT 'available';
END

-- Add index for InventoryStatus if column exists and index doesn't exist
IF EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Products' 
    AND COLUMN_NAME = 'InventoryStatus'
)
AND NOT EXISTS (
    SELECT * FROM sys.indexes 
    WHERE name = 'IX_Products_InventoryStatus' 
    AND object_id = OBJECT_ID('dbo.Products')
)
BEGIN
    CREATE INDEX IX_Products_InventoryStatus ON Products(InventoryStatus);
END

-- Create ProductInventory table for detailed tracking
-- Note: This table can reference either Products (from Products page) or InventoryProducts (from ProductInventory page)
IF OBJECT_ID('dbo.ProductInventory', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[ProductInventory] (
        InventoryID INT IDENTITY(1,1) PRIMARY KEY,
        ProductID INT NULL, -- Reference to Products table (for products from Products page)
        InventoryProductID INT NULL, -- Reference to InventoryProducts table (for products created in ProductInventory page)
        InventoryStatus NVARCHAR(50) NOT NULL DEFAULT 'available', -- available, damaged, returned, repaired, disposed
        Quantity INT NOT NULL DEFAULT 1,
        ImageURL NVARCHAR(500) NULL,
        Dimensions NVARCHAR(MAX) NULL, -- JSON format: {"length": 100, "width": 50, "height": 75, "unit": "cm"}
        Notes NVARCHAR(MAX) NULL,
        Location NVARCHAR(200) NULL, -- Warehouse location
        DateAdded DATETIME2(0) NOT NULL DEFAULT GETDATE(),
        DateUpdated DATETIME2(0) NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedBy INT NULL, -- User ID who created this inventory entry
        UpdatedBy INT NULL, -- User ID who last updated this inventory entry
        CONSTRAINT FK_ProductInventory_ProductID FOREIGN KEY (ProductID) REFERENCES Products(ProductID),
        CONSTRAINT FK_ProductInventory_CreatedBy FOREIGN KEY (CreatedBy) REFERENCES Users(UserID),
        CONSTRAINT FK_ProductInventory_UpdatedBy FOREIGN KEY (UpdatedBy) REFERENCES Users(UserID),
        CONSTRAINT CK_ProductInventory_ProductReference CHECK (
            (ProductID IS NOT NULL AND InventoryProductID IS NULL) OR 
            (ProductID IS NULL AND InventoryProductID IS NOT NULL)
        )
    );
    
    -- Create indexes for better query performance
    CREATE INDEX IX_ProductInventory_ProductID ON ProductInventory(ProductID);
    CREATE INDEX IX_ProductInventory_InventoryStatus ON ProductInventory(InventoryStatus);
    CREATE INDEX IX_ProductInventory_IsActive ON ProductInventory(IsActive);
END
ELSE
BEGIN
    -- Add InventoryProductID column if table exists but column doesn't
    IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'ProductInventory' 
        AND COLUMN_NAME = 'InventoryProductID'
    )
    BEGIN
        ALTER TABLE [dbo].[ProductInventory]
        ADD InventoryProductID INT NULL;
        
        -- Add foreign key constraint for InventoryProductID
        ALTER TABLE [dbo].[ProductInventory]
        ADD CONSTRAINT FK_ProductInventory_InventoryProductID 
        FOREIGN KEY (InventoryProductID) REFERENCES InventoryProducts(InventoryProductID);
        
        -- Add index for InventoryProductID
        CREATE INDEX IX_ProductInventory_InventoryProductID ON ProductInventory(InventoryProductID);
        
        -- Modify ProductID to be nullable if it's not already
        IF EXISTS (
            SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'ProductInventory' 
            AND COLUMN_NAME = 'ProductID'
            AND IS_NULLABLE = 'NO'
        )
        BEGIN
            ALTER TABLE [dbo].[ProductInventory]
            ALTER COLUMN ProductID INT NULL;
        END
        
        -- Add check constraint to ensure only one product reference exists
        IF NOT EXISTS (
            SELECT * FROM sys.check_constraints 
            WHERE name = 'CK_ProductInventory_ProductReference'
        )
        BEGIN
            ALTER TABLE [dbo].[ProductInventory]
            ADD CONSTRAINT CK_ProductInventory_ProductReference CHECK (
                (ProductID IS NOT NULL AND InventoryProductID IS NULL) OR 
                (ProductID IS NULL AND InventoryProductID IS NOT NULL)
            );
        END
    END
END

-- Update existing products to have 'available' status if NULL
-- Only run this if the column exists
IF EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'Products' 
    AND COLUMN_NAME = 'InventoryStatus'
)
BEGIN
    UPDATE Products 
    SET InventoryStatus = 'available' 
    WHERE InventoryStatus IS NULL;
END

