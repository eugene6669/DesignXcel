'use strict';

/**
 * Admin Manager routes
 */
module.exports = function registerAdminRoutes(router, ctx) {
    const { pool, sql, isAuthenticated, checkPermission } = ctx;

    // Admin Dashboard
    router.get('/Employee/AdminManager', isAuthenticated, async (req, res) => {
        try {
            console.log('=== ADMIN MANAGER ROUTE ACCESSED ===');
            console.log('Session ID:', req.sessionID);
            console.log('User in session:', req.session?.user);
            console.log('User role:', req.session?.user?.role);
            console.log('================================');

            // Initialize default values
            let recentOrders = [];
            let pendingOrdersCount = 0;
            let canceledOrders = [];
            let canceledOrdersCount = 0;

            try {
                await pool.connect();

                const [recentOrdersResult, pendingOrdersCountResult, canceledOrdersResult, canceledOrdersCountResult] =
                    await Promise.all([
                        pool.request().query(`
                            SELECT TOP 5
                                o.OrderID, o.ReferenceNumber, o.OrderDate, o.TotalAmount, o.Status,
                                FORMAT(o.OrderDate, 'MMM dd, yyyy hh:mm tt') AS FormattedOrderDate,
                                c.FullName AS CustomerName, c.Email AS CustomerEmail
                            FROM Orders o
                            INNER JOIN Customers c ON o.CustomerID = c.CustomerID
                            WHERE o.Status = N'Pending'
                            ORDER BY o.OrderDate DESC
                        `),
                        pool.request().query(`SELECT COUNT(*) as count FROM Orders WHERE Status = N'Pending'`),
                        pool.request().query(`
                            SELECT TOP 5
                                o.OrderID, o.ReferenceNumber, o.OrderDate, o.TotalAmount, o.Status,
                                FORMAT(o.OrderDate, 'MMM dd, yyyy hh:mm tt') AS FormattedOrderDate,
                                c.FullName AS CustomerName, c.Email AS CustomerEmail
                            FROM Orders o
                            INNER JOIN Customers c ON o.CustomerID = c.CustomerID
                            WHERE o.Status = N'Cancelled'
                            ORDER BY o.OrderDate DESC
                        `),
                        pool.request().query(`SELECT COUNT(*) as count FROM Orders WHERE Status = N'Cancelled'`)
                    ]);

                recentOrders = recentOrdersResult.recordset || [];
                pendingOrdersCount = parseInt(pendingOrdersCountResult.recordset[0]?.count, 10) || 0;
                canceledOrders = canceledOrdersResult.recordset || [];
                canceledOrdersCount = parseInt(canceledOrdersCountResult.recordset[0]?.count, 10) || 0;

            } catch (err) {
                console.error('Error fetching recent orders for dashboard:', err);
                recentOrders = [];
                pendingOrdersCount = 0;
                canceledOrders = [];
                canceledOrdersCount = 0;
            }

            // Always render with defined variables
            res.render('Employee/Admin/AdminManager', {
                user: req.session.user,
                recentOrders: recentOrders,
                pendingOrdersCount: pendingOrdersCount,
                canceledOrders: canceledOrders,
                canceledOrdersCount: canceledOrdersCount
            });
        } catch (error) {
            console.error('Error rendering AdminManager:', error);
            res.status(500).send('Error loading admin dashboard');
        }
    });

    // Admin routes placeholder - more routes can be added here as they're extracted
    // from the monolithic routes.js file
};
