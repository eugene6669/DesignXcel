'use strict';

/**
 * Order line items may store Products.ProductID or InventoryProducts.InventoryProductID.
 * Map each line to the storefront/catalog Products.ProductID (same logic as sold reports).
 */
const ORDER_ITEMS_CATALOG_CROSS_APPLY = `
CROSS APPLY (
    SELECT COALESCE(
        (SELECT TOP 1 p2.ProductID FROM Products p2 WHERE p2.ProductID = oi.ProductID),
        (SELECT TOP 1 ip.ProductID FROM InventoryProducts ip
         WHERE ip.InventoryProductID = oi.ProductID AND ISNULL(ip.IsActive, 1) = 1
         ORDER BY ip.InventoryProductID DESC),
        (SELECT TOP 1 ip2.ProductID FROM InventoryProducts ip2
         WHERE ip2.ProductID = oi.ProductID AND ISNULL(ip2.IsActive, 1) = 1
         ORDER BY ip2.InventoryProductID DESC)
    ) AS CatalogProductID
) cat`;

module.exports = { ORDER_ITEMS_CATALOG_CROSS_APPLY };
