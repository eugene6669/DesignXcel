-- Production recipe per inventory product (raw materials per unit stocked)
-- Run if you see: Invalid object name 'InventoryProductMaterials'

IF OBJECT_ID('dbo.InventoryProductMaterials', 'U') IS NULL
BEGIN
    IF OBJECT_ID('dbo.InventoryProducts', 'U') IS NULL
    BEGIN
        RAISERROR('InventoryProducts table must exist first. Run create_inventory_products_table.sql', 16, 1);
        RETURN;
    END

    IF OBJECT_ID('dbo.RawMaterials', 'U') IS NULL
    BEGIN
        RAISERROR('RawMaterials table must exist first.', 16, 1);
        RETURN;
    END

    CREATE TABLE [dbo].[InventoryProductMaterials] (
        InventoryProductMaterialID INT IDENTITY(1,1) PRIMARY KEY,
        InventoryProductID INT NOT NULL,
        MaterialID INT NOT NULL,
        QuantityRequired INT NOT NULL DEFAULT 1,
        DateAdded DATETIME2(0) NOT NULL DEFAULT GETDATE(),

        CONSTRAINT FK_InventoryProductMaterials_Product FOREIGN KEY (InventoryProductID)
            REFERENCES InventoryProducts(InventoryProductID) ON DELETE CASCADE,
        CONSTRAINT FK_InventoryProductMaterials_Material FOREIGN KEY (MaterialID)
            REFERENCES RawMaterials(MaterialID),
        CONSTRAINT UQ_InventoryProductMaterials_ProductMaterial UNIQUE (InventoryProductID, MaterialID)
    );

    CREATE INDEX IX_InventoryProductMaterials_ProductID ON InventoryProductMaterials(InventoryProductID);
    CREATE INDEX IX_InventoryProductMaterials_MaterialID ON InventoryProductMaterials(MaterialID);

    PRINT 'InventoryProductMaterials table created successfully.';
END
ELSE
BEGIN
    PRINT 'InventoryProductMaterials table already exists.';
END
GO
