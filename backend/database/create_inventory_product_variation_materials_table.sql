-- Per-variation production recipe (raw materials per unit stocked for a specific variation)
-- Run if you see: Invalid object name 'InventoryProductVariationMaterials'

IF OBJECT_ID('dbo.InventoryProductVariationMaterials', 'U') IS NULL
BEGIN
    IF OBJECT_ID('dbo.InventoryProductVariations', 'U') IS NULL
    BEGIN
        RAISERROR('InventoryProductVariations table must exist first.', 16, 1);
        RETURN;
    END

    IF OBJECT_ID('dbo.RawMaterials', 'U') IS NULL
    BEGIN
        RAISERROR('RawMaterials table must exist first.', 16, 1);
        RETURN;
    END

    CREATE TABLE [dbo].[InventoryProductVariationMaterials] (
        InventoryProductVariationMaterialID INT IDENTITY(1,1) PRIMARY KEY,
        VariationID INT NOT NULL,
        MaterialID INT NOT NULL,
        QuantityRequired INT NOT NULL DEFAULT 1,
        DateAdded DATETIME2(0) NOT NULL DEFAULT GETDATE(),

        CONSTRAINT FK_InventoryProductVariationMaterials_Variation FOREIGN KEY (VariationID)
            REFERENCES InventoryProductVariations(VariationID) ON DELETE CASCADE,
        CONSTRAINT FK_InventoryProductVariationMaterials_Material FOREIGN KEY (MaterialID)
            REFERENCES RawMaterials(MaterialID),
        CONSTRAINT UQ_InventoryProductVariationMaterials_VariationMaterial UNIQUE (VariationID, MaterialID)
    );

    CREATE INDEX IX_InventoryProductVariationMaterials_VariationID ON InventoryProductVariationMaterials(VariationID);
    CREATE INDEX IX_InventoryProductVariationMaterials_MaterialID ON InventoryProductVariationMaterials(MaterialID);

    PRINT 'InventoryProductVariationMaterials table created successfully.';
END
ELSE
BEGIN
    PRINT 'InventoryProductVariationMaterials table already exists.';
END
GO
