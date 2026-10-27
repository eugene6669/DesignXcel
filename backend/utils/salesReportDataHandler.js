/**
 * Sales Report Data Handler
 * Handles sales report data fetching and aggregation
 */

const {
    detectSalesReportSchema,
    aggregateSalesReportFromOrders,
    computeMerchandiseCostMetrics,
    computeInventoryLossAtCost,
    isRefundMerchandiseOrder,
    applySalesReportOrderRowDisplay
} = require('./salesReportMetrics');

const { getOrdersSchemaFlags } = require('./adminQueryHelpers');

async function handleSalesReportData(pool, sql, queryParams) {
    const { search, status, payment, dateFrom, dateTo, amountMin, amountMax } = queryParams;

    // Detect schema capabilities
    const schema = await detectSalesReportSchema(pool);
    const schemaFlags = await getOrdersSchemaFlags(pool);

    // Build filters
    const request = pool.request();
    let whereClauses = [];

    if (search && search.trim()) {
        whereClauses.push(`(
            o.ReferenceNumber LIKE @search 
            OR c.FullName LIKE @search 
            OR c.Email LIKE @search
        )`);
        request.input('search', sql.NVarChar, `%${search.trim()}%`);
    }

    if (status && status !== 'all') {
        whereClauses.push('o.Status = @status');
        request.input('status', sql.NVarChar, status);
    }

    if (payment && payment !== 'all') {
        whereClauses.push('o.PaymentMethod = @payment');
        request.input('payment', sql.NVarChar, payment);
    }

    if (dateFrom) {
        whereClauses.push('o.OrderDate >= @dateFrom');
        request.input('dateFrom', sql.DateTime, new Date(dateFrom));
    }

    if (dateTo) {
        whereClauses.push('o.OrderDate <= @dateTo');
        request.input('dateTo', sql.DateTime, new Date(dateTo));
    }

    if (amountMin) {
        whereClauses.push('o.TotalAmount >= @amountMin');
        request.input('amountMin', sql.Decimal(10, 2), parseFloat(amountMin));
    }

    if (amountMax) {
        whereClauses.push('o.TotalAmount <= @amountMax');
        request.input('amountMax', sql.Decimal(10, 2), parseFloat(amountMax));
    }

    const whereClause = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    // Check if TaxAmount column exists
    const hasTaxAmount = await pool.request().query(`
        SELECT COUNT(*) as cnt
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'Orders' AND COLUMN_NAME = 'TaxAmount'
    `);
    const taxAmountExists = hasTaxAmount.recordset[0].cnt > 0;

    // Fetch orders
    const query = `
        SELECT 
            o.OrderID,
            o.ReferenceNumber,
            o.OrderDate,
            o.TotalAmount,
            o.Status,
            o.PaymentMethod,
            o.PaymentStatus,
            o.DeliveryCost,
            o.ExtraDeliveryFee,
            ${taxAmountExists ? 'o.TaxAmount,' : '0 as TaxAmount,'}
            ${schema.hasActionType ? 'o.ActionType,' : '"" as ActionType,'}
            ${schema.hasReturnType ? 'o.ReturnType,' : '"" as ReturnType,'}
            c.FullName AS CustomerName,
            c.Email AS CustomerEmail
        FROM Orders o
        INNER JOIN Customers c ON o.CustomerID = c.CustomerID
        ${whereClause}
        ORDER BY o.OrderDate DESC
    `;

    const result = await request.query(query);
    const orders = result.recordset;

    // Fetch order items for each order
    for (let order of orders) {
        const itemsResult = await pool.request()
            .input('orderId', sql.Int, order.OrderID)
            .query(`
                SELECT 
                    oi.OrderItemID,
                    COALESCE(oi.Name, p.Name, 'Product') as ProductName,
                    oi.Quantity,
                    oi.PriceAtPurchase,
                    oi.VariationID,
                    pv.VariationName,
                    pv.Color
                FROM OrderItems oi
                LEFT JOIN Products p ON oi.ProductID = p.ProductID
                LEFT JOIN ProductVariations pv ON oi.VariationID = pv.VariationID
                WHERE oi.OrderID = @orderId
            `);
        order.items = itemsResult.recordset;
        
        // Apply display formatting
        applySalesReportOrderRowDisplay(order, order.items);
    }

    // Compute metrics
    const orderIds = orders.map(o => o.OrderID);
    let costMetrics = { totalCost: 0, totalRevenue: 0 };
    
    if (schema.hasCostPrice && orderIds.length > 0) {
        costMetrics = await computeMerchandiseCostMetrics(pool, sql, orderIds, true);
    }

    // Aggregate statistics
    const stats = aggregateSalesReportFromOrders(orders, {
        hasCostPrice: schema.hasCostPrice,
        costMetrics
    });

    return {
        success: true,
        orders,
        stats,
        schema
    };
}

module.exports = {
    handleSalesReportData
};
