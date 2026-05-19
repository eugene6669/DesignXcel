-- Create InventoryProductVariations table for product inventory variations
-- This table stores variations for products in the InventoryProducts table

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InventoryProductVariations]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InventoryProductVariations] (
        VariationID INT IDENTITY(1,1) PRIMARY KEY,
        InventoryProductID INT NOT NULL,
        VariationName NVARCHAR(255) NOT NULL,
        Color NVARCHAR(100) NULL,
        Quantity INT NOT NULL DEFAULT 1,
        Price DECIMAL(10, 2) NULL,
        VariationImageURL NVARCHAR(500) NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CreatedBy INT NULL,
        
        -- Foreign key constraint
        CONSTRAINT FK_InventoryProductVariations_InventoryProductID 
            FOREIGN KEY (InventoryProductID) 
            REFERENCES InventoryProducts(InventoryProductID) 
            ON DELETE CASCADE,
        
        -- Foreign key for CreatedBy
        CONSTRAINT FK_InventoryProductVariations_CreatedBy 
            FOREIGN KEY (CreatedBy) 
            REFERENCES Users(UserID),
        
        -- Indexes
        INDEX IX_InventoryProductVariations_InventoryProductID (InventoryProductID),
        INDEX IX_InventoryProductVariations_IsActive (IsActive)
    );
    
    PRINT 'InventoryProductVariations table created successfully.';
END
ELSE
BEGIN
    PRINT 'InventoryProductVariations table already exists.';
END
GO

-- Add Price column if it doesn't exist
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'InventoryProductVariations'
    AND COLUMN_NAME = 'Price'
)
BEGIN
    ALTER TABLE [dbo].[InventoryProductVariations]
    ADD Price DECIMAL(10, 2) NULL;
    PRINT 'Price column added to InventoryProductVariations table.';
END
ELSE
BEGIN
    PRINT 'Price column already exists in InventoryProductVariations table.';
END
GO

