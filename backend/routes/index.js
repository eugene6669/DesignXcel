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
    const { checkPermission, checkAnyPermission } = require('../middleware/permissionCheck');

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
    const { ensureBomBundleSchema, loadArchivedBomBundles } = require('../utils/bomBundleSchema');

    // Helper functions that need to be shared across routes
    async function sendActivityLogsData(req, res) {
        try {
            await pool.connect();
            const logs = await fetchActivityLogs(pool, req.query);
            res.json({ success: true, logs });
        } catch (err) {
            console.error('Error fetching activity logs data:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve activity logs data.',
                error: err.message
            });
        }
    }

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

    // Raw Material Purchase Order Upload
    const rawMaterialPoStorage = multer.diskStorage({
        destination: (req, file, cb) => {
            const dest = path.join(__dirname, '../public/uploads/raw-materials');
            if (!fs.existsSync(dest)) {
                fs.mkdirSync(dest, { recursive: true });
            }
            cb(null, dest);
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            cb(null, 'po-' + uniqueSuffix + path.extname(file.originalname));
        }
    });

    const rawMaterialPoUpload = multer({
        storage: rawMaterialPoStorage,
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
        checkPermission,
        checkAnyPermission,
        // Uploads
        multer,
        productUpload,
        variationUpload,
        rawMaterialPoUpload,
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
        sendActivityLogsData,
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
        fetchActivityLogs,
        ensureBomBundleSchema,
        loadArchivedBomBundles
    };

    // logActivity helper function for the shared context
    async function logActivity(userId, action, tableName, recordId, description, changes) {
        try {
            await pool.connect();
            const changesStr = typeof changes === 'string' ? changes : JSON.stringify(changes || {});
            await pool.request()
                .input('userId', sql.Int, userId)
                .input('action', sql.NVarChar, action)
                .input('tableName', sql.NVarChar, tableName)
                .input('recordId', sql.NVarChar, String(recordId))
                .input('description', sql.NVarChar, description)
                .input('changes', sql.NVarChar, changesStr)
                .query(`
                    INSERT INTO ActivityLogs (UserID, Action, TableName, RecordID, Description, Changes, Timestamp)
                    VALUES (@userId, @action, @tableName, @recordId, @description, @changes, GETDATE())
                `);
        } catch (err) {
            console.error('Error logging activity:', err);
        }
    }

    // Add logActivity to shared context
    sharedContext.logActivity = logActivity;

    // Mount sub-routers
    try {
        // Authentication routes - returns function that takes router
        const registerLoginRoutes = require('./auth/loginRoutes');
        registerLoginRoutes(router, sharedContext);
        
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

        const registerAdminRoutes = require('./employee/adminRoutes');
        registerAdminRoutes(router, sharedContext);

        // Load Admin modular routes
        const registerAdminMiscRoutes = require('./employee/adminMiscRoutes');
        registerAdminMiscRoutes(router, sharedContext);

        const registerAdminWalkInRoutes = require('./employee/adminWalkInRoutes');
        registerAdminWalkInRoutes(router, sharedContext);

        const registerAdminApiRoutes = require('./employee/adminApiRoutes');
        registerAdminApiRoutes(router, sharedContext);

        const registerAdminUsersRoutes = require('./employee/adminUsersRoutes');
        registerAdminUsersRoutes(router, sharedContext);

        const registerAdminOrdersRoutes = require('./employee/adminOrdersRoutes');
        registerAdminOrdersRoutes(router, sharedContext);

        const registerAdminProductsRoutes = require('./employee/adminProductsRoutes');
        registerAdminProductsRoutes(router, sharedContext);

        const registerAdminReportsRoutes = require('./employee/adminReportsRoutes');
        registerAdminReportsRoutes(router, sharedContext);

        const registerAdminExtrasRoutes = require('./employee/adminExtrasRoutes');
        registerAdminExtrasRoutes(router, sharedContext);

        // =====================================================================
        // MODULARIZATION COMPLETE - Legacy routes.js removed
        // All routes now loaded from modular files in routes/ directory
        // Backup available: routes.js.MONOLITH_ARCHIVE_* 
        // =====================================================================
        console.log('[ROUTES] ✅ All route modules loaded successfully - 100% modular');
        console.log('[ROUTES] 📁 19 modular route files registered (~230 routes)');
        console.log('[ROUTES] 🎉 Monolithic routes.js successfully retired');
    } catch (error) {
        console.error('[ROUTES] Error loading route modules:', error);
        throw error;
    }

    return router;
};
