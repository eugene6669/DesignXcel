-- Add return conditions columns to Orders table
-- These columns store the return conditions checklist values

-- Add OriginalPackaging column
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Orders') AND name = 'OriginalPackaging')
BEGIN
    ALTER TABLE Orders
    ADD OriginalPackaging BIT NULL;
    PRINT 'Column OriginalPackaging added to Orders table.';
END
ELSE
BEGIN
    PRINT 'Column OriginalPackaging already exists in Orders table.';
END
GO

-- Add AllParts column
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Orders') AND name = 'AllParts')
BEGIN
    ALTER TABLE Orders
    ADD AllParts BIT NULL;
    PRINT 'Column AllParts added to Orders table.';
END
ELSE
BEGIN
    PRINT 'Column AllParts already exists in Orders table.';
END
GO

-- Add Unused column
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Orders') AND name = 'Unused')
BEGIN
    ALTER TABLE Orders
    ADD Unused BIT NULL;
    PRINT 'Column Unused added to Orders table.';
END
ELSE
BEGIN
    PRINT 'Column Unused already exists in Orders table.';
END
GO

-- Add ProofOfPurchase column
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Orders') AND name = 'ProofOfPurchase')
BEGIN
    ALTER TABLE Orders
    ADD ProofOfPurchase BIT NULL;
    PRINT 'Column ProofOfPurchase added to Orders table.';
END
ELSE
BEGIN
    PRINT 'Column ProofOfPurchase already exists in Orders table.';
END
GO

-- Add ProofOfPurchaseImageURL column
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Orders') AND name = 'ProofOfPurchaseImageURL')
BEGIN
    ALTER TABLE Orders
    ADD ProofOfPurchaseImageURL NVARCHAR(MAX) NULL;
    PRINT 'Column ProofOfPurchaseImageURL added to Orders table.';
END
ELSE
BEGIN
    PRINT 'Column ProofOfPurchaseImageURL already exists in Orders table.';
END
GO

