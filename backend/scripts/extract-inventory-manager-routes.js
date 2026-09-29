'use strict';

const fs = require('fs');
const path = require('path');

const routesPath = path.join(__dirname, '../routes.js');
const outPath = path.join(__dirname, '../routes/employee/inventoryManagerRoutes.js');

const lines = fs.readFileSync(routesPath, 'utf8').split(/\r?\n/);
const startLine = 2657; // 1-based: // === INVENTORY MANAGER ROUTES
const endLine = 4642;   // 1-based: last line before Order Support

const body = lines.slice(startLine - 1, endLine).join('\n');

const header = `'use strict';

/**
 * Inventory Manager employee routes (pages, archived reactivation, data APIs).
 * Extracted from routes.js — register via registerInventoryManagerRoutes(router, ctx).
 */
module.exports = function registerInventoryManagerRoutes(router, ctx) {
    const {
        pool,
        sql,
        path,
        fs,
        isAuthenticated,
        checkPermission,
        EMPLOYEE_SYNC_ROLES,
        registerEmployeeRoleProductRoutes,
        productUpload,
        variationUpload,
        logActivity,
        captureChanges,
        sendActivityLogsData,
        buildInventoryAlertsPayload,
        getRoleViewPath,
        formatInventoryDate,
        loadProductInventoryPageData,
        ensureListingStageColumn,
        ensureStorefrontDisplayQuantityColumn,
        ensureVariationMediaColumns,
        ensureBomBundleSchema,
        ensureInventoryStockMovementSchema,
        makeRenderRoleActivityLogsPage,
        syncInventoryVariationToProductsVariation,
        syncInventoryProductCatalogToProducts,
        cascadeArchiveCmsFromInventoryProductArchived,
        publicUrlFromMulterProductFile,
        publicUrlFromMulterVariationFile,
        deleteProductAssetFile,
        assignVariationSku,
        upsertProductVariationWithId,
        buildVariationDimensionsJson,
        parseSingleVariationMediaFiles,
        resolveVariationMediaUrls,
        mapVariationMediaFiles,
        invalidateAdminPageCache,
        insertStockMovement,
        logInventoryStockMovementFromVariationUpdate,
        logRestockVariationMovement,
        logRestockProductMovement,
        logRestockRawMaterialMovement,
        logAdjustRawMaterialMovement,
        logAddRawMaterialMovement,
        archiveStockMovement,
        archiveStockMovementsForProduct,
        parseMoneyInput,
        generateProductIdentifiers,
        generateReferenceNumber,
        normalizeProductAssetUrl,
        normalizeThumbnailList,
        deleteOldImageFile
    } = ctx;

    const renderRoleActivityLogsPage = makeRenderRoleActivityLogsPage(pool);

`;

const footer = `
};
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, header + body + footer, 'utf8');
console.log('Wrote', outPath, `(${endLine - startLine + 1} lines)`);
