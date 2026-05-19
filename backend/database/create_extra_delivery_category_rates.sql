-- Extra delivery fees by product category (qty threshold per cart / per line item)
IF OBJECT_ID('dbo.ExtraDeliveryCategoryRates', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.ExtraDeliveryCategoryRates (
        CategoryRateID INT IDENTITY(1,1) PRIMARY KEY,
        CategoryName NVARCHAR(100) NOT NULL,
        FeePerItem DECIMAL(18,2) NOT NULL,
        MinItemQuantity INT NOT NULL CONSTRAINT DF_ExtraDelCat_MinItemQty DEFAULT (4),
        Description NVARCHAR(500) NULL,
        SortOrder INT NOT NULL CONSTRAINT DF_ExtraDelCat_SortOrder DEFAULT (0),
        IsDefault BIT NOT NULL CONSTRAINT DF_ExtraDelCat_IsDefault DEFAULT (0),
        IsActive BIT NOT NULL CONSTRAINT DF_ExtraDelCat_IsActive DEFAULT (1),
        CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_ExtraDelCat_CreatedAt DEFAULT (SYSUTCDATETIME()),
        UpdatedAt DATETIME2(0) NULL,
        CreatedByUserID INT NULL,
        CreatedByUsername NVARCHAR(150) NULL,
        UpdatedByUserID INT NULL,
        UpdatedByUsername NVARCHAR(150) NULL
    );

    CREATE UNIQUE INDEX UX_ExtraDeliveryCategoryRates_Category_Active
        ON dbo.ExtraDeliveryCategoryRates (CategoryName)
        WHERE IsActive = 1 AND IsDefault = 0;

    PRINT 'ExtraDeliveryCategoryRates table created.';
END
ELSE
    PRINT 'ExtraDeliveryCategoryRates table already exists.';

-- Default rates (match legacy checkout hardcoded values)
IF NOT EXISTS (SELECT 1 FROM dbo.ExtraDeliveryCategoryRates)
BEGIN
    INSERT INTO dbo.ExtraDeliveryCategoryRates (CategoryName, FeePerItem, MinItemQuantity, Description, SortOrder, IsDefault, IsActive)
    VALUES
        (N'Cabinet', 150.00, 4, N'Heavy storage / cabinet items', 10, 0, 1),
        (N'Chairs', 80.00, 4, N'Chair category', 20, 0, 1),
        (N'Table', 100.00, 4, N'Table category', 30, 0, 1),
        (N'Default', 100.00, 4, N'Fallback for other categories', 999, 1, 1);
    PRINT 'Seeded default extra delivery category rates.';
END

IF NOT EXISTS (SELECT 1 FROM dbo.SystemSettings WHERE SettingKey = 'EXTRA_DELIVERY_MIN_CART_QTY')
BEGIN
    INSERT INTO dbo.SystemSettings (SettingKey, SettingValue, Description, UpdatedByUsername)
    VALUES ('EXTRA_DELIVERY_MIN_CART_QTY', '4', 'Minimum total cart quantity before extra delivery fees apply', 'System');
END
