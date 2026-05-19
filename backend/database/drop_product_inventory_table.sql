-- Drop ProductInventory table
-- This table is no longer needed as inventory tracking is now done directly in InventoryProducts table

-- Check if ProductInventory table exists
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ProductInventory]') AND type in (N'U'))
BEGIN
    -- Drop foreign key constraints first
    IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_ProductInventory_ProductID')
    BEGIN
        ALTER TABLE [dbo].[ProductInventory] DROP CONSTRAINT FK_ProductInventory_ProductID;
        PRINT 'Dropped FK_ProductInventory_ProductID constraint.';
    END
    
    IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_ProductInventory_InventoryProductID')
    BEGIN
        ALTER TABLE [dbo].[ProductInventory] DROP CONSTRAINT FK_ProductInventory_InventoryProductID;
        PRINT 'Dropped FK_ProductInventory_InventoryProductID constraint.';
    END
    
    IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_ProductInventory_CreatedBy')
    BEGIN
        ALTER TABLE [dbo].[ProductInventory] DROP CONSTRAINT FK_ProductInventory_CreatedBy;
        PRINT 'Dropped FK_ProductInventory_CreatedBy constraint.';
    END
    
    IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_ProductInventory_UpdatedBy')
    BEGIN
        ALTER TABLE [dbo].[ProductInventory] DROP CONSTRAINT FK_ProductInventory_UpdatedBy;
        PRINT 'Dropped FK_ProductInventory_UpdatedBy constraint.';
    END
    
    -- Drop check constraint
    IF EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'CK_ProductInventory_ProductReference')
    BEGIN
        ALTER TABLE [dbo].[ProductInventory] DROP CONSTRAINT CK_ProductInventory_ProductReference;
        PRINT 'Dropped CK_ProductInventory_ProductReference constraint.';
    END
    
    -- Drop the table
    DROP TABLE [dbo].[ProductInventory];
    PRINT 'ProductInventory table dropped successfully.';
END
ELSE
BEGIN
    PRINT 'ProductInventory table does not exist.';
END
GO

