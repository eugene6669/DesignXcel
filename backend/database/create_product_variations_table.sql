-- Create ProductVariations table for CMS products
-- This table stores variations for products in the Products table (CMS products)

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ProductVariations]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[ProductVariations] (
        VariationID INT IDENTITY(1,1) PRIMARY KEY,
        ProductID INT NOT NULL,
        VariationName NVARCHAR(255) NOT NULL,
        Color NVARCHAR(100) NULL,
        Quantity INT NOT NULL DEFAULT 1,
        Price DECIMAL(10, 2) NULL,
        VariationImageURL NVARCHAR(500) NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        UpdatedAt DATETIME2 NULL,
        CreatedBy INT NULL,
        
        -- Foreign key constraint
        CONSTRAINT FK_ProductVariations_ProductID 
            FOREIGN KEY (ProductID) 
            REFERENCES Products(ProductID) 
            ON DELETE CASCADE,
        
        -- Foreign key for CreatedBy
        CONSTRAINT FK_ProductVariations_CreatedBy 
            FOREIGN KEY (CreatedBy) 
            REFERENCES Users(UserID),
        
        -- Indexes
        INDEX IX_ProductVariations_ProductID (ProductID),
        INDEX IX_ProductVariations_IsActive (IsActive)
    );
    
    PRINT 'ProductVariations table created successfully.';
END
ELSE
BEGIN
    PRINT 'ProductVariations table already exists.';
END
GO

-- Add Price column if it doesn't exist
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'ProductVariations'
    AND COLUMN_NAME = 'Price'
)
BEGIN
    ALTER TABLE [dbo].[ProductVariations]
    ADD Price DECIMAL(10, 2) NULL;
    PRINT 'Price column added to ProductVariations table.';
END
ELSE
BEGIN
    PRINT 'Price column already exists in ProductVariations table.';
END
GO

-- Add CreatedBy column if it doesn't exist
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'ProductVariations'
    AND COLUMN_NAME = 'CreatedBy'
)
BEGIN
    ALTER TABLE [dbo].[ProductVariations]
    ADD CreatedBy INT NULL;
    PRINT 'CreatedBy column added to ProductVariations table.';
END
ELSE
BEGIN
    PRINT 'CreatedBy column already exists in ProductVariations table.';
END
GO

-- Add foreign key constraint for CreatedBy if it doesn't exist
IF NOT EXISTS (
    SELECT * FROM sys.foreign_keys
    WHERE name = 'FK_ProductVariations_CreatedBy'
)
AND EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'ProductVariations'
    AND COLUMN_NAME = 'CreatedBy'
)
BEGIN
    ALTER TABLE [dbo].[ProductVariations]
    ADD CONSTRAINT FK_ProductVariations_CreatedBy 
        FOREIGN KEY (CreatedBy) 
        REFERENCES Users(UserID);
    PRINT 'FK_ProductVariations_CreatedBy foreign key added.';
END
ELSE
BEGIN
    PRINT 'FK_ProductVariations_CreatedBy foreign key already exists or CreatedBy column does not exist.';
END
GO

-- Add UpdatedAt column if it doesn't exist
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'ProductVariations'
    AND COLUMN_NAME = 'UpdatedAt'
)
BEGIN
    ALTER TABLE [dbo].[ProductVariations]
    ADD UpdatedAt DATETIME2 NULL;
    PRINT 'UpdatedAt column added to ProductVariations table.';
END
ELSE
BEGIN
    PRINT 'UpdatedAt column already exists in ProductVariations table.';
END
GO

