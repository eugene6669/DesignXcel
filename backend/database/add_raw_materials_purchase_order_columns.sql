-- RawMaterials: latest purchase order metadata (updated on Add / Restock)
IF COL_LENGTH('dbo.RawMaterials', 'PurchaseOrderNumber') IS NULL
BEGIN
    ALTER TABLE dbo.RawMaterials ADD PurchaseOrderNumber NVARCHAR(100) NULL;
    PRINT 'PurchaseOrderNumber column added to RawMaterials.';
END
GO

IF COL_LENGTH('dbo.RawMaterials', 'PurchaseOrderImageURL') IS NULL
BEGIN
    ALTER TABLE dbo.RawMaterials ADD PurchaseOrderImageURL NVARCHAR(500) NULL;
    PRINT 'PurchaseOrderImageURL column added to RawMaterials.';
END
GO
