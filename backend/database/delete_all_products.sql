-- =============================================
-- Script: Delete All Products (CMS + Inventory)
-- Database: DesignXcellDB (change USE below if needed)
--
-- WARNING: Permanently deletes product catalog data.
-- Order history: OrderItems reference ProductID — this script
-- deletes OrderItems too. Run delete_all_orders_and_bulk_orders.sql
-- first if you want to keep orders but remove products only (not possible
-- while OrderItems.ProductID is NOT NULL without deleting line items).
--
-- Related tables (delete order):
--   CartItems, WishlistItems          → optional cart/wishlist
--   ProductDiscounts, ProductReviews
--   BulkOrderItems                    → bulk orders (or delete bulk orders first)
--   OrderItems                        → order line items (FK → Products)
--   InventoryProductMaterials         → materials per inventory product
--   InventoryProductVariations        → inventory variations
--   ProductInventory                  → legacy link table (if exists)
--   ProductMaterials, ProductVariations
--   InventoryProducts                 → Product Inventory page
--   Products                          → customer-facing CMS products
-- =============================================

USE DesignXcellDB;
GO

SET NOCOUNT ON;

PRINT '================================================';
PRINT 'Delete All Products — starting';
PRINT '================================================';
PRINT '';

BEGIN TRANSACTION;

BEGIN TRY
    DECLARE @n INT;

    -- Counts before delete
    DECLARE @Products INT = 0, @InventoryProducts INT = 0, @PV INT = 0, @IPV INT = 0;
    IF OBJECT_ID('dbo.Products', 'U') IS NOT NULL
        SELECT @Products = COUNT(*) FROM dbo.Products;
    IF OBJECT_ID('dbo.InventoryProducts', 'U') IS NOT NULL
        SELECT @InventoryProducts = COUNT(*) FROM dbo.InventoryProducts;
    IF OBJECT_ID('dbo.ProductVariations', 'U') IS NOT NULL
        SELECT @PV = COUNT(*) FROM dbo.ProductVariations;
    IF OBJECT_ID('dbo.InventoryProductVariations', 'U') IS NOT NULL
        SELECT @IPV = COUNT(*) FROM dbo.InventoryProductVariations;

    PRINT 'Before delete:';
    PRINT '  Products: ' + CAST(@Products AS VARCHAR(20));
    PRINT '  InventoryProducts: ' + CAST(@InventoryProducts AS VARCHAR(20));
    PRINT '  ProductVariations: ' + CAST(@PV AS VARCHAR(20));
    PRINT '  InventoryProductVariations: ' + CAST(@IPV AS VARCHAR(20));
    PRINT '';

    -- 1. Cart / wishlist
    IF OBJECT_ID('dbo.CartItems', 'U') IS NOT NULL
    BEGIN
        DELETE FROM dbo.CartItems;
        SET @n = @@ROWCOUNT;
        PRINT 'Deleted CartItems: ' + CAST(@n AS VARCHAR(20));
    END

    IF OBJECT_ID('dbo.WishlistItems', 'U') IS NOT NULL
    BEGIN
        DELETE FROM dbo.WishlistItems;
        SET @n = @@ROWCOUNT;
        PRINT 'Deleted WishlistItems: ' + CAST(@n AS VARCHAR(20));
    END

    -- 2. Discounts & reviews
    IF OBJECT_ID('dbo.ProductDiscounts', 'U') IS NOT NULL
    BEGIN
        DELETE FROM dbo.ProductDiscounts;
        SET @n = @@ROWCOUNT;
        PRINT 'Deleted ProductDiscounts: ' + CAST(@n AS VARCHAR(20));
    END

    IF OBJECT_ID('dbo.ProductReviews', 'U') IS NOT NULL
    BEGIN
        DELETE FROM dbo.ProductReviews;
        SET @n = @@ROWCOUNT;
        PRINT 'Deleted ProductReviews: ' + CAST(@n AS VARCHAR(20));
    END

    -- 3. Bulk order lines (FK → Products)
    IF OBJECT_ID('dbo.BulkOrderItems', 'U') IS NOT NULL
    BEGIN
        DELETE FROM dbo.BulkOrderItems;
        SET @n = @@ROWCOUNT;
        PRINT 'Deleted BulkOrderItems: ' + CAST(@n AS VARCHAR(20));
    END

    -- 4. Order line items (FK → Products)
    IF OBJECT_ID('dbo.OrderItems', 'U') IS NOT NULL
    BEGIN
        DELETE FROM dbo.OrderItems;
        SET @n = @@ROWCOUNT;
        PRINT 'Deleted OrderItems: ' + CAST(@n AS VARCHAR(20));
    END

    -- 5. Inventory children
    IF OBJECT_ID('dbo.InventoryProductMaterials', 'U') IS NOT NULL
    BEGIN
        DELETE FROM dbo.InventoryProductMaterials;
        SET @n = @@ROWCOUNT;
        PRINT 'Deleted InventoryProductMaterials: ' + CAST(@n AS VARCHAR(20));
    END

    IF OBJECT_ID('dbo.InventoryProductVariations', 'U') IS NOT NULL
    BEGIN
        DELETE FROM dbo.InventoryProductVariations;
        SET @n = @@ROWCOUNT;
        PRINT 'Deleted InventoryProductVariations: ' + CAST(@n AS VARCHAR(20));
    END

    -- 6. Legacy ProductInventory table (removed in some migrations; skip if absent)
    IF OBJECT_ID('dbo.ProductInventory', 'U') IS NOT NULL
    BEGIN
        DELETE FROM dbo.ProductInventory;
        SET @n = @@ROWCOUNT;
        PRINT 'Deleted ProductInventory (legacy): ' + CAST(@n AS VARCHAR(20));
    END

    -- 7. CMS product children
    IF OBJECT_ID('dbo.ProductMaterials', 'U') IS NOT NULL
    BEGIN
        DELETE FROM dbo.ProductMaterials;
        SET @n = @@ROWCOUNT;
        PRINT 'Deleted ProductMaterials: ' + CAST(@n AS VARCHAR(20));
    END

    IF OBJECT_ID('dbo.ProductVariations', 'U') IS NOT NULL
    BEGIN
        DELETE FROM dbo.ProductVariations;
        SET @n = @@ROWCOUNT;
        PRINT 'Deleted ProductVariations: ' + CAST(@n AS VARCHAR(20));
    END

    -- 8. Inventory products (Product Inventory tab)
    IF OBJECT_ID('dbo.InventoryProducts', 'U') IS NOT NULL
    BEGIN
        DELETE FROM dbo.InventoryProducts;
        SET @n = @@ROWCOUNT;
        PRINT 'Deleted InventoryProducts: ' + CAST(@n AS VARCHAR(20));
    END

    -- 9. CMS products
    IF OBJECT_ID('dbo.Products', 'U') IS NOT NULL
    BEGIN
        DELETE FROM dbo.Products;
        SET @n = @@ROWCOUNT;
        PRINT 'Deleted Products: ' + CAST(@n AS VARCHAR(20));
    END

    COMMIT TRANSACTION;

    PRINT '';
    PRINT '================================================';
    PRINT 'All product tables cleared successfully.';
    PRINT '================================================';

    -- Optional: reset identity seeds (uncomment if you want IDs to restart at 1)
    /*
    IF OBJECT_ID('dbo.Products', 'U') IS NOT NULL
        DBCC CHECKIDENT ('Products', RESEED, 0);
    IF OBJECT_ID('dbo.InventoryProducts', 'U') IS NOT NULL
        DBCC CHECKIDENT ('InventoryProducts', RESEED, 0);
    IF OBJECT_ID('dbo.ProductVariations', 'U') IS NOT NULL
        DBCC CHECKIDENT ('ProductVariations', RESEED, 0);
    IF OBJECT_ID('dbo.InventoryProductVariations', 'U') IS NOT NULL
        DBCC CHECKIDENT ('InventoryProductVariations', RESEED, 0);
    */

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0
        ROLLBACK TRANSACTION;

    PRINT '';
    PRINT 'ERROR: ' + ERROR_MESSAGE();
    PRINT 'Line: ' + CAST(ERROR_LINE() AS VARCHAR(20));
    THROW;
END CATCH
GO
