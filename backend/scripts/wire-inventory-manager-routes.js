'use strict';

const fs = require('fs');
const path = require('path');

const routesPath = path.join(__dirname, '../routes.js');
const lines = fs.readFileSync(routesPath, 'utf8').split(/\r?\n/);

const startLine = 2657;
const endLine = 4642;

const replacement = `    // =============================================================================
    // INVENTORY MANAGER ROUTES (see routes/employee/inventoryManagerRoutes.js)
    // =============================================================================

    registerInventoryManagerRoutes(router, {
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
        deleteOldImageFile,
        generateGuid,
        decreaseMaterialsForProduct,
        restoreMaterialsForProduct
    });
`;

const newLines = [
    ...lines.slice(0, startLine - 1),
    replacement.trimEnd(),
    ...lines.slice(endLine)
];

fs.writeFileSync(routesPath, newLines.join('\n'), 'utf8');
console.log(`Removed lines ${startLine}-${endLine}, inserted registration call`);
