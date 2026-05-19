-- Fix ProductReviews unique constraint to allow multiple reviews for same product from different orders
-- This migration:
-- 1. Adds OrderID column if it doesn't exist
-- 2. Drops the old UQ_CustomerProduct constraint (CustomerID + ProductID)
-- 3. Creates new unique constraints with OrderID (CustomerID + ProductID + OrderID)

BEGIN TRANSACTION;

BEGIN TRY
    PRINT '================================================';
    PRINT 'Fixing ProductReviews Unique Constraint';
    PRINT '================================================';
    PRINT '';

    -- Step 1: Add OrderID column if it doesn't exist
    IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'ProductReviews' 
        AND COLUMN_NAME = 'OrderID'
    )
    BEGIN
        PRINT 'Adding OrderID column to ProductReviews table...';
        ALTER TABLE ProductReviews ADD OrderID INT NULL;
        PRINT '✓ OrderID column added successfully';
        PRINT '';
    END
    ELSE
    BEGIN
        PRINT '✓ OrderID column already exists in ProductReviews table';
        PRINT '';
    END

    -- Step 2: Drop the old unique constraint if it exists
    IF EXISTS (
        SELECT * FROM sys.indexes 
        WHERE name = 'UQ_CustomerProduct' 
        AND object_id = OBJECT_ID('dbo.ProductReviews')
    )
    BEGIN
        PRINT 'Dropping old unique constraint: UQ_CustomerProduct (CustomerID + ProductID)...';
        ALTER TABLE ProductReviews DROP CONSTRAINT UQ_CustomerProduct;
        PRINT '✓ Old constraint dropped successfully';
        PRINT '';
    END
    ELSE
    BEGIN
        PRINT '⚠ Old constraint UQ_CustomerProduct does not exist (may have been dropped already)';
        PRINT '';
    END

    COMMIT TRANSACTION;
    PRINT 'Step 1 complete: OrderID column added and old constraint dropped.';
    PRINT '';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
    BEGIN
        ROLLBACK TRANSACTION;
    END
    PRINT 'Error in Step 1:';
    PRINT 'Error Number: ' + CAST(ERROR_NUMBER() AS VARCHAR(10));
    PRINT 'Error Message: ' + ERROR_MESSAGE();
    THROW;
END CATCH;

GO

-- Step 3: Create new unique constraints
BEGIN TRANSACTION;

BEGIN TRY
    -- Create new unique constraint with OrderID (allows multiple reviews from different orders)
    IF NOT EXISTS (
        SELECT * FROM sys.indexes 
        WHERE name = 'UQ_CustomerProductOrder' 
        AND object_id = OBJECT_ID('dbo.ProductReviews')
    )
    BEGIN
        PRINT 'Creating new unique constraint: UQ_CustomerProductOrder (CustomerID + ProductID + OrderID)...';
        CREATE UNIQUE NONCLUSTERED INDEX UQ_CustomerProductOrder
        ON ProductReviews (CustomerID, ProductID, OrderID)
        WHERE OrderID IS NOT NULL;
        PRINT '✓ New constraint created: UQ_CustomerProductOrder (CustomerID + ProductID + OrderID where OrderID IS NOT NULL)';
        PRINT '';
    END
    ELSE
    BEGIN
        PRINT '⚠ Constraint UQ_CustomerProductOrder already exists';
        PRINT '';
    END
    
    -- Create unique constraint for cases where OrderID IS NULL (backward compatibility)
    IF NOT EXISTS (
        SELECT * FROM sys.indexes 
        WHERE name = 'UQ_CustomerProduct_NoOrder' 
        AND object_id = OBJECT_ID('dbo.ProductReviews')
    )
    BEGIN
        PRINT 'Creating constraint for NULL OrderID: UQ_CustomerProduct_NoOrder...';
        CREATE UNIQUE NONCLUSTERED INDEX UQ_CustomerProduct_NoOrder
        ON ProductReviews (CustomerID, ProductID)
        WHERE OrderID IS NULL;
        PRINT '✓ Constraint created for NULL OrderID: UQ_CustomerProduct_NoOrder (CustomerID + ProductID where OrderID IS NULL)';
        PRINT '';
    END
    ELSE
    BEGIN
        PRINT '⚠ Constraint UQ_CustomerProduct_NoOrder already exists';
        PRINT '';
    END

    -- Add foreign key constraint if Orders table exists and FK doesn't exist
    IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Orders')
    BEGIN
        IF NOT EXISTS (
            SELECT * FROM sys.foreign_keys 
            WHERE name = 'FK_ProductReviews_Orders'
            AND parent_object_id = OBJECT_ID('dbo.ProductReviews')
        )
        BEGIN
            PRINT 'Adding foreign key constraint FK_ProductReviews_Orders...';
            ALTER TABLE ProductReviews 
            ADD CONSTRAINT FK_ProductReviews_Orders 
            FOREIGN KEY (OrderID) REFERENCES Orders(OrderID);
            PRINT '✓ Foreign key constraint added successfully';
            PRINT '';
        END
        ELSE
        BEGIN
            PRINT '⚠ Foreign key constraint FK_ProductReviews_Orders already exists';
            PRINT '';
        END
    END

    COMMIT TRANSACTION;
    
    PRINT '================================================';
    PRINT '✅ Migration completed successfully!';
    PRINT '================================================';
    PRINT '';
    PRINT 'New constraint behavior:';
    PRINT '  - Reviews with OrderID: Unique per (CustomerID + ProductID + OrderID)';
    PRINT '  - Reviews without OrderID: Unique per (CustomerID + ProductID)';
    PRINT '  - Users can now review the same product multiple times from different orders';
    PRINT '';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
    BEGIN
        ROLLBACK TRANSACTION;
    END
    PRINT '';
    PRINT '================================================';
    PRINT '❌ ERROR: Step 2 failed and was rolled back';
    PRINT '================================================';
    PRINT '';
    PRINT 'Error details:';
    PRINT 'Error Number: ' + CAST(ERROR_NUMBER() AS VARCHAR(10));
    PRINT 'Error Message: ' + ERROR_MESSAGE();
    PRINT 'Error Line: ' + CAST(ERROR_LINE() AS VARCHAR(10));
    THROW;
END CATCH;

GO
