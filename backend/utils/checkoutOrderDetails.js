const sql = require('mssql');
const { paymentMethodDisplayForOrder } = require('./orderDisplayHelpers');

/**
 * Load order + line items for a checkout session (Stripe cs_ or PayMongo session id).
 */
async function fetchOrderDetailsByCheckoutSessionId(pool, sessionId, customerId = null) {
    const sessionIdStr = String(sessionId || '').trim();
    if (!sessionIdStr) return null;

    const request = pool.request().input('sessionId', sql.NVarChar, sessionIdStr);
    let customerFilter = '';
    if (customerId != null && !Number.isNaN(Number(customerId))) {
        request.input('customerId', sql.Int, Number(customerId));
        customerFilter = ' AND o.CustomerID = @customerId';
    }

    const result = await request.query(`
        SELECT o.*, c.FullName, c.Email,
               ISNULL(o.ExtraDeliveryFee, 0) AS ExtraDeliveryFee,
               o.TransactionID,
               COALESCE(o.ServiceType,
                   CASE 
                       WHEN o.DeliveryType = 'pickup' THEN 'Pick up'
                       WHEN o.DeliveryType LIKE 'rate_%' THEN 
                           CASE 
                               WHEN COALESCE(dr.ServiceType, rdr.ServiceType, 'Standard') LIKE '%Delivery%' 
                               THEN COALESCE(dr.ServiceType, rdr.ServiceType, 'Standard')
                               ELSE COALESCE(dr.ServiceType, rdr.ServiceType, 'Standard') + ' Delivery'
                           END
                       ELSE o.DeliveryType
                   END
               ) AS DeliveryTypeName,
               a.HouseNumber, a.Street, a.Barangay, a.City, a.Province, a.PostalCode, a.Country,
               c.PhoneNumber
        FROM Orders o
        INNER JOIN Customers c ON o.CustomerID = c.CustomerID
        LEFT JOIN CustomerAddresses a ON o.ShippingAddressID = a.AddressID
        LEFT JOIN DeliveryRates dr ON o.DeliveryType = 'rate_' + CAST(dr.RateID AS NVARCHAR(10))
        LEFT JOIN RegionDeliveryRates rdr ON o.DeliveryType = 'rate_' + CAST(rdr.RegionRateID AS NVARCHAR(10))
        WHERE o.StripeSessionID = @sessionId${customerFilter}
    `);

    if (!result.recordset.length) return null;

    const order = result.recordset[0];
    order.PaymentMethodDisplay = paymentMethodDisplayForOrder(order);

    const itemsResult = await pool.request()
        .input('orderId', sql.Int, order.OrderID)
        .query(`
            SELECT 
                oi.OrderItemID,
                oi.ProductID,
                oi.Quantity,
                oi.PriceAtPurchase,
                COALESCE(oi.Name, p.Name, 'Product') AS ProductName,
                COALESCE(p.SKU, '') AS SKU,
                pv.VariationName,
                pv.Color
            FROM OrderItems oi
            LEFT JOIN Products p ON oi.ProductID = p.ProductID
            LEFT JOIN ProductVariations pv ON oi.VariationID = pv.VariationID
            WHERE oi.OrderID = @orderId
            ORDER BY oi.OrderItemID
        `);

    order.items = itemsResult.recordset;
    return order;
}

module.exports = { fetchOrderDetailsByCheckoutSessionId };
