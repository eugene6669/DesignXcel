-- Create InventoryProducts table for products created in ProductInventory page
-- This is separate from the Products table used in the Products page

-- Check if InventoryProducts table exists, if not create it
IF OBJECT_ID('dbo.InventoryProducts', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[InventoryProducts] (
        InventoryProductID INT IDENTITY(1,1) PRIMARY KEY,
        Name NVARCHAR(255) NOT NULL,
        Description NVARCHAR(MAX) NULL,
        Price DECIMAL(10, 2) NOT NULL,
        Category NVARCHAR(100) NULL,
        ImageURL NVARCHAR(500) NULL,
        ThumbnailURLs NVARCHAR(MAX) NULL, -- JSON array of thumbnail URLs
        Dimensions NVARCHAR(MAX) NULL, -- JSON format: {"length": 100, "width": 50, "height": 75, "unit": "cm", "weight": 10, "notes": ""}
        Model3D NVARCHAR(500) NULL, -- 3D model file URL (GLB/GLTF)
        SKU NVARCHAR(100) NULL,
        PublicId UNIQUEIDENTIFIER NULL DEFAULT NEWID(),
        Slug NVARCHAR(255) NULL,
        DateAdded DATETIME2(0) NOT NULL DEFAULT GETDATE(),
        DateUpdated DATETIME2(0) NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedBy INT NULL, -- UserID from Users table
        UpdatedBy INT NULL, -- UserID from Users table
        
        -- Constraints
        CONSTRAINT FK_InventoryProducts_CreatedBy FOREIGN KEY (CreatedBy) REFERENCES Users(UserID),
        CONSTRAINT FK_InventoryProducts_UpdatedBy FOREIGN KEY (UpdatedBy) REFERENCES Users(UserID),
        CONSTRAINT UQ_InventoryProducts_SKU UNIQUE (SKU),
        CONSTRAINT UQ_InventoryProducts_PublicId UNIQUE (PublicId),
        CONSTRAINT UQ_InventoryProducts_Slug UNIQUE (Slug)
    );
    
    -- Create indexes for better query performance
    CREATE INDEX IX_InventoryProducts_Category ON InventoryProducts(Category);
    CREATE INDEX IX_InventoryProducts_IsActive ON InventoryProducts(IsActive);
    CREATE INDEX IX_InventoryProducts_DateAdded ON InventoryProducts(DateAdded);
    CREATE INDEX IX_InventoryProducts_SKU ON InventoryProducts(SKU);
    
    PRINT 'InventoryProducts table created successfully.';
END
ELSE
BEGIN
    PRINT 'InventoryProducts table already exists.';
END
GO

-- Create InventoryProductMaterials table for required materials
IF OBJECT_ID('dbo.InventoryProductMaterials', 'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[InventoryProductMaterials] (
        InventoryProductMaterialID INT IDENTITY(1,1) PRIMARY KEY,
        InventoryProductID INT NOT NULL,
        MaterialID INT NOT NULL,
        QuantityRequired INT NOT NULL DEFAULT 1,
        DateAdded DATETIME2(0) NOT NULL DEFAULT GETDATE(),
        
        -- Constraints
        CONSTRAINT FK_InventoryProductMaterials_Product FOREIGN KEY (InventoryProductID) REFERENCES InventoryProducts(InventoryProductID) ON DELETE CASCADE,
        CONSTRAINT FK_InventoryProductMaterials_Material FOREIGN KEY (MaterialID) REFERENCES RawMaterials(MaterialID),
        CONSTRAINT UQ_InventoryProductMaterials_ProductMaterial UNIQUE (InventoryProductID, MaterialID)
    );
    
    -- Create indexes
    CREATE INDEX IX_InventoryProductMaterials_ProductID ON InventoryProductMaterials(InventoryProductID);
    CREATE INDEX IX_InventoryProductMaterials_MaterialID ON InventoryProductMaterials(MaterialID);
    
    PRINT 'InventoryProductMaterials table created successfully.';
END
ELSE
BEGIN
    PRINT 'InventoryProductMaterials table already exists.';
END
GO

-- Update existing InventoryProducts to have PublicId if NULL
IF EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'InventoryProducts' 
    AND COLUMN_NAME = 'PublicId'
)
BEGIN
    UPDATE InventoryProducts 
    SET PublicId = NEWID() 
    WHERE PublicId IS NULL;
    
    PRINT 'Updated NULL PublicId values in InventoryProducts.';
END
GO

