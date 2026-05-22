-- BOM Bundles (manufacturing recipes) + RawMaterials SKU/Supplier
-- Run against SQL Server database used by DesignXcel

-- RawMaterials: SKU (RM-001) and Supplier
IF COL_LENGTH('dbo.RawMaterials', 'SKU') IS NULL
BEGIN
    ALTER TABLE dbo.RawMaterials ADD SKU NVARCHAR(50) NULL;
    PRINT 'Added SKU column to RawMaterials';
END

IF COL_LENGTH('dbo.RawMaterials', 'Supplier') IS NULL
BEGIN
    ALTER TABLE dbo.RawMaterials ADD Supplier NVARCHAR(255) NULL;
    PRINT 'Added Supplier column to RawMaterials';
END

-- Backfill RM SKUs for existing rows
UPDATE dbo.RawMaterials
SET SKU = 'RM-' + RIGHT('000000' + CAST(MaterialID AS VARCHAR(6)), 6)
WHERE SKU IS NULL OR LTRIM(RTRIM(SKU)) = '';

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_RawMaterials_SKU' AND object_id = OBJECT_ID(N'dbo.RawMaterials')
)
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX UX_RawMaterials_SKU
    ON dbo.RawMaterials(SKU) WHERE SKU IS NOT NULL;
END

-- BomBundles: reusable recipe templates (not products)
IF OBJECT_ID('dbo.BomBundles', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.BomBundles (
        BomBundleID INT IDENTITY(1,1) PRIMARY KEY,
        BundleCode NVARCHAR(50) NOT NULL,
        Name NVARCHAR(255) NOT NULL,
        Description NVARCHAR(MAX) NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedBy INT NULL,
        UpdatedBy INT NULL,
        DateAdded DATETIME2(0) NOT NULL DEFAULT GETDATE(),
        DateUpdated DATETIME2(0) NULL,
        CONSTRAINT UQ_BomBundles_BundleCode UNIQUE (BundleCode)
    );
    CREATE INDEX IX_BomBundles_IsActive ON dbo.BomBundles(IsActive);
    CREATE INDEX IX_BomBundles_Name ON dbo.BomBundles(Name);
    PRINT 'Created BomBundles table';
END

-- BomBundleMaterials: materials per bundle
IF OBJECT_ID('dbo.BomBundleMaterials', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.BomBundleMaterials (
        BomBundleMaterialID INT IDENTITY(1,1) PRIMARY KEY,
        BomBundleID INT NOT NULL,
        MaterialID INT NOT NULL,
        QuantityRequired INT NOT NULL DEFAULT 1,
        CONSTRAINT FK_BomBundleMaterials_Bundle FOREIGN KEY (BomBundleID)
            REFERENCES dbo.BomBundles(BomBundleID) ON DELETE CASCADE,
        CONSTRAINT FK_BomBundleMaterials_Material FOREIGN KEY (MaterialID)
            REFERENCES dbo.RawMaterials(MaterialID),
        CONSTRAINT UQ_BomBundleMaterials_BundleMaterial UNIQUE (BomBundleID, MaterialID),
        CONSTRAINT CK_BomBundleMaterials_Qty CHECK (QuantityRequired > 0)
    );
    CREATE INDEX IX_BomBundleMaterials_Bundle ON dbo.BomBundleMaterials(BomBundleID);
    PRINT 'Created BomBundleMaterials table';
END

GO
