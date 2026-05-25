-- Stock movement audit log for inventory variations
IF NOT EXISTS (
    SELECT 1 FROM sys.tables WHERE name = 'InventoryStockMovements' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
    CREATE TABLE dbo.InventoryStockMovements (
        MovementID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        InventoryProductID INT NULL,
        VariationID INT NULL,
        MovementType NVARCHAR(64) NOT NULL,
        FromStatus NVARCHAR(32) NULL,
        ToStatus NVARCHAR(32) NULL,
        Quantity INT NOT NULL CONSTRAINT DF_InventoryStockMovements_Qty DEFAULT (0),
        Notes NVARCHAR(500) NULL,
        CreatedBy INT NULL,
        CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_InventoryStockMovements_CreatedAt DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_InventoryStockMovements_Product
            FOREIGN KEY (InventoryProductID) REFERENCES dbo.InventoryProducts(InventoryProductID),
        CONSTRAINT FK_InventoryStockMovements_Variation
            FOREIGN KEY (VariationID) REFERENCES dbo.InventoryProductVariations(VariationID)
    );

    CREATE INDEX IX_InventoryStockMovements_CreatedAt
        ON dbo.InventoryStockMovements(CreatedAt DESC);

    CREATE INDEX IX_InventoryStockMovements_Variation
        ON dbo.InventoryStockMovements(VariationID, CreatedAt DESC);

    CREATE INDEX IX_InventoryStockMovements_Product
        ON dbo.InventoryStockMovements(InventoryProductID, CreatedAt DESC);
END
GO
