'use strict';

/**
 * Main router orchestrator - replaces monolithic routes.js
 * Consolidates all route modules into a single exported router
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

module.exports = function createMainRouter(sql, pool, getStripe) {
    const router = express.Router();

    // Import middleware
    const { isAuthenticated, hasEmployeeAccess } = require('../middleware/employeeAuth');
    const { errorHandler, notFoundHandler } = require('../middleware/errorHandler');
    const jwtAuth = require('../middleware/jwtAuth');
    const permissionCheck = require('../middleware/permissionCheck');

    // Import utilities (will be passed to sub-routers as context)
    const sendgridHelper = require('../utils/sendgridHelper');
    const { generateReferenceNumber } = require('../utils/generateReferenceNumber');
    const { generateTransactionId } = require('../utils/generateTransactionId');
    const { parseMoneyInput } = require('../utils/parseMoneyInput');
    const { cleanupExpiredDiscountsSafe } = require('../utils/cleanupExpiredDiscounts');
    const { calculateEstimatedDeliveryDate, formatEstimatedDeliveryDate } = require('../utils/deliveryEstimate');
    const { ROLES: EMPLOYEE_SYNC_ROLES, getRoleViewPath } = require('../utils/employeeRoleViewSync');
    const { makeRenderRoleActivityLogsPage } = require('../utils/employeeActivityLogsPage');
    const {
        renderRoleProductsListing,
        renderRoleProductInventory,
        registerEmployeeRoleProductRoutes
    } = require('../utils/employeeRoleProductRoutes');
    const {
        generateProductIdentifiers,
        generateTemporaryPublicId,
        generateGuid
    } = require('../utils/generateProductIdentifiers');
    const { invalidateAdminPageCache } = require('../utils/adminPageCache');
    const {
        getOrdersSchemaFlags,
        attachOrderItemsBatch,
        loadProductInventoryPageData,
        loadStorefrontPageData,
        ensureListingStageColumn,
        ensureStorefrontDisplayQuantityColumn,
        loadProductReturnsPageData,
        buildInventoryStockRefreshPayload,
        fetchInventoryProductSummary,
        fetchProductCategoriesList,
        addProductCategory,
        removeProductCategory,
        buildInventoryAlertsPayload,
        fetchInventoryReportProducts,
        fetchInventoryReportRawMaterials,
        fetchPendingInspectionQtyByVariation
    } = require('../utils/adminQueryHelpers');
    const {
        ensureInventoryStockMovementSchema,
        insertStockMovement,
        logInventoryStockMovementFromVariationUpdate,
        logRestockVariationMovement,
        logRestockProductMovement,
        logRestockRawMaterialMovement,
        logAdjustRawMaterialMovement,
        logAddRawMaterialMovement,
        logReturnOrderReceivedMovements,
        fetchInventoryStockMovements,
        fetchInventoryStockMovementsGrouped,
        fetchRawMaterialStockMovementsGrouped,
        fetchArchivedStockMovements,
        archiveStockMovement,
        archiveStockMovementsForProduct,
        archiveStockMovementsForRawMaterial,
        archiveAllProductInventoryMovements,
        archiveAllRawMaterialMovements,
        reactivateStockMovement
    } = require('../utils/inventoryStockMovement');
    const {
        ensureVariationMediaColumns,
        resolvePlanVariationDisplayName,
        mapVariationMediaFiles,
        buildVariationDimensionsJson,
        parseSingleVariationMediaFiles,
        resolveVariationMediaUrls,
        assignVariationSku,
        upsertProductVariationWithId,
        createStorefrontProductFromInventory
    } = require('../utils/inventoryCatalogSync');
    const {
        isAzureProductAssetMode,
        publicUrlFromMulterProductFile,
        publicUrlFromMulterVariationFile,
        normalizeProductAssetUrl,
        normalizeThumbnailList,
        getProductAzureBlobPath,
        getProductMulterAbsoluteDir,
        deleteProductAssetFile
    } = require('../utils/productAssetUrls');
    const { isAzureBlobConfigured, uploadBufferToAzureBlob, getBlobPublicUrl } = require('../utils/azureBlobStorage');
    const { serializeActivityLogChanges, fetchActivityLogs } = require('../utils/activityLogHelpers');

    // Multer configuration for file uploads
    const multer = require('multer');
    
    const productStorage = multer.diskStorage({
        destination: (req, file, cb) => {
            const dest = path.join(__dirname, '../public/uploads/products');
            if (!fs.existsSync(dest)) {
                fs.mkdirSync(dest, { recursive: true });
            }
            cb(null, dest);
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, 'product-' + uniqueSuffix + path.extname(file.originalname));
        }
    });

    const variationStorage = multer.diskStorage({
        destination: (req, file, cb) => {
            const dest = path.join(__dirname, '../public/uploads/variations');
            if (!fs.existsSync(dest)) {
                fs.mkdirSync(dest, { recursive: true });
            }
            cb(null, dest);
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, 'variation-' + uniqueSuffix + path.extname(file.originalname));
        }
    });

    const productUpload = multer({
        storage: productStorage,
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
        fileFilter: (req, file, cb) => {
            if (file.mimetype.startsWith('image/')) {
                cb(null, true);
            } else {
                cb(new Error('Only image files are allowed!'), false);
            }
        }
    });

    const variationUpload = multer({
        storage: variationStorage,
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
        fileFilter: (req, file, cb) => {
            if (file.mimetype.startsWith('image/')) {
                cb(null, true);
            } else {
                cb(new Error('Only image files are allowed!'), false);
            }
        }
    });

    // Create shared context object to pass to all route modules
    const sharedContext = {
        sql,
        pool,
        getStripe,
        path,
        fs,
        // Middleware
        isAuthenticated,
        hasEmployeeAccess,
        jwtAuth,
        checkPermission: permissionCheck,
        // Uploads
        productUpload,
        variationUpload,
        // Utilities
        sendgridHelper,
        generateReferenceNumber,
        generateTransactionId,
        parseMoneyInput,
        cleanupExpiredDiscountsSafe,
        calculateEstimatedDeliveryDate,
        formatEstimatedDeliveryDate,
        EMPLOYEE_SYNC_ROLES,
        getRoleViewPath,
        makeRenderRoleActivityLogsPage,
        renderRoleProductsListing,
        renderRoleProductInventory,
        registerEmployeeRoleProductRoutes,
        generateProductIdentifiers,
        generateTemporaryPublicId,
        generateGuid,
        invalidateAdminPageCache,
        getOrdersSchemaFlags,
        attachOrderItemsBatch,
        loadProductInventoryPageData,
        loadStorefrontPageData,
        ensureListingStageColumn,
        ensureStorefrontDisplayQuantityColumn,
        loadProductReturnsPageData,
        buildInventoryStockRefreshPayload,
        fetchInventoryProductSummary,
        fetchProductCategoriesList,
        addProductCategory,
        removeProductCategory,
        buildInventoryAlertsPayload,
        fetchInventoryReportProducts,
        fetchInventoryReportRawMaterials,
        fetchPendingInspectionQtyByVariation,
        ensureInventoryStockMovementSchema,
        insertStockMovement,
        logInventoryStockMovementFromVariationUpdate,
        logRestockVariationMovement,
        logRestockProductMovement,
        logRestockRawMaterialMovement,
        logAdjustRawMaterialMovement,
        logAddRawMaterialMovement,
        logReturnOrderReceivedMovements,
        fetchInventoryStockMovements,
        fetchInventoryStockMovementsGrouped,
        fetchRawMaterialStockMovementsGrouped,
        fetchArchivedStockMovements,
        archiveStockMovement,
        archiveStockMovementsForProduct,
        archiveStockMovementsForRawMaterial,
        archiveAllProductInventoryMovements,
        archiveAllRawMaterialMovements,
        reactivateStockMovement,
        ensureVariationMediaColumns,
        resolvePlanVariationDisplayName,
        mapVariationMediaFiles,
        buildVariationDimensionsJson,
        parseSingleVariationMediaFiles,
        resolveVariationMediaUrls,
        assignVariationSku,
        upsertProductVariationWithId,
        createStorefrontProductFromInventory,
        isAzureProductAssetMode,
        publicUrlFromMulterProductFile,
        publicUrlFromMulterVariationFile,
        normalizeProductAssetUrl,
        normalizeThumbnailList,
        getProductAzureBlobPath,
        getProductMulterAbsoluteDir,
        deleteProductAssetFile,
        isAzureBlobConfigured,
        uploadBufferToAzureBlob,
        getBlobPublicUrl,
        serializeActivityLogChanges,
        fetchActivityLogs
    };

    // Mount sub-routers
    try {
        // Authentication routes - returns function that takes router
        const registerOtpRoutes = require('./auth/otpRoutes');
        registerOtpRoutes(router, sharedContext);

        // Debug routes (development only) - returns function that takes router
        if (process.env.NODE_ENV === 'development') {
            const registerDebugRoutes = require('./debug/debugRoutes');
            registerDebugRoutes(router, sharedContext);
        }

        // Employee routes - all take (router, context) and register routes directly
        const registerInventoryManagerRoutes = require('./employee/inventoryManagerRoutes');
        registerInventoryManagerRoutes(router, sharedContext);

        const registerTransactionManagerRoutes = require('./employee/transactionManagerRoutes');
        registerTransactionManagerRoutes(router, sharedContext);

        const registerUserManagerRoutes = require('./employee/userManagerRoutes');
        registerUserManagerRoutes(router, sharedContext);

        const registerOrderSupportRoutes = require('./employee/orderSupportRoutes');
        registerOrderSupportRoutes(router, sharedContext);

        console.log('[ROUTES] All route modules loaded successfully');
    } catch (error) {
        console.error('[ROUTES] Error loading route modules:', error);
        throw error;
    }

    return router;
};
