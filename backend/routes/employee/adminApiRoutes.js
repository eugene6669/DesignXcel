'use strict';

/**
 * Admin API Routes
 * Handles all /api/admin/* endpoints for product categories, delivery rates, payment status, etc.
 */

module.exports = function registerAdminApiRoutes(router, context) {
    const {
        sql,
        pool,
        isAuthenticated,
        fetchProductCategoriesList,
        addProductCategory,
        removeProductCategory,
        invalidateAdminPageCache
    } = context;

    // =============================================================================
    // PRODUCT CATEGORIES API
    // =============================================================================

    router.get('/api/admin/product-categories', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const categories = await fetchProductCategoriesList(pool);
            res.json({ success: true, categories });
        } catch (err) {
            console.error('Error fetching product categories:', err);
            res.status(500).json({ success: false, categories: [], message: 'Failed to load categories.' });
        }
    });

    router.post('/api/admin/product-categories', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const name = req.body && (req.body.name || req.body.categoryName);
            const result = await addProductCategory(pool, name);
            if (result.success) {
                invalidateAdminPageCache('admin:productCategories');
                invalidateAdminPageCache('admin:');
            }
            res.status(result.success ? 200 : 400).json(result);
        } catch (err) {
            console.error('Error adding product category:', err);
            res.status(500).json({ success: false, message: 'Failed to add category.' });
        }
    });

    router.delete('/api/admin/product-categories/:name', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const name = decodeURIComponent(req.params.name || '');
            const result = await removeProductCategory(pool, name);
            if (result.success) {
                invalidateAdminPageCache('admin:productCategories');
                invalidateAdminPageCache('admin:');
            }
            res.status(result.success ? 200 : 400).json(result);
        } catch (err) {
            console.error('Error removing product category:', err);
            res.status(500).json({ success: false, message: 'Failed to remove category.' });
        }
    });

    // =============================================================================
    // PAYMENT STATUS API
    // =============================================================================

    router.get('/api/admin/payment-status/:orderId', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const orderId = parseInt(req.params.orderId);

            const result = await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`
                    SELECT PaymentStatus, PaymentMethod, TotalAmount, Status
                    FROM Orders
                    WHERE OrderID = @orderId
                `);

            if (result.recordset.length === 0) {
                return res.status(404).json({ success: false, message: 'Order not found' });
            }

            res.json({ success: true, order: result.recordset[0] });
        } catch (err) {
            console.error('Error fetching payment status:', err);
            res.status(500).json({ success: false, message: 'Failed to fetch payment status' });
        }
    });

    // =============================================================================
    // ORDER SYNC API
    // =============================================================================

    router.post('/api/admin/sync-order-total/:orderId', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const orderId = parseInt(req.params.orderId);

            // Recalculate total from order items
            const itemsResult = await pool.request()
                .input('orderId', sql.Int, orderId)
                .query(`
                    SELECT SUM(Quantity * PriceAtPurchase) as CalculatedTotal
                    FROM OrderItems
                    WHERE OrderID = @orderId
                `);

            const calculatedTotal = itemsResult.recordset[0].CalculatedTotal || 0;

            // Update order total
            await pool.request()
                .input('orderId', sql.Int, orderId)
                .input('total', sql.Decimal(10, 2), calculatedTotal)
                .query(`
                    UPDATE Orders
                    SET TotalAmount = @total, UpdatedAt = GETDATE()
                    WHERE OrderID = @orderId
                `);

            res.json({ 
                success: true, 
                message: 'Order total synced successfully',
                newTotal: calculatedTotal
            });
        } catch (err) {
            console.error('Error syncing order total:', err);
            res.status(500).json({ success: false, message: 'Failed to sync order total' });
        }
    });
};
