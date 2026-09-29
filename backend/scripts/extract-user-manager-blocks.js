'use strict';

const fs = require('fs');
const path = require('path');

const routesPath = path.join(__dirname, '../routes.js');

const BLOCKS = [
    {
        name: 'userManagerRoutes',
        start: 2832,
        end: 3168,
        fn: 'registerUserManagerRoutes',
        ctx: 'employeeProductRouteCtx'
    },
    {
        name: 'transactionManagerOrderRoutes',
        start: 3171,
        end: 3744,
        fn: 'registerTransactionManagerOrderRoutes',
        ctx: 'employeeOrderRouteCtx'
    },
    {
        name: 'userManagerCrudRoutes',
        start: 3747,
        end: 4610,
        fn: 'registerUserManagerCrudRoutes',
        ctx: 'employeeProductRouteCtx'
    },
    {
        name: 'userManagerOrderRoutes',
        start: 4613,
        end: 5161,
        fn: 'registerUserManagerOrderRoutes',
        ctx: 'employeeOrderRouteCtx'
    }
];

const EMPLOYEE_PRODUCT_CTX_KEYS = [
    'pool', 'sql', 'path', 'fs', 'isAuthenticated', 'checkPermission', 'EMPLOYEE_SYNC_ROLES',
    'registerEmployeeRoleProductRoutes', 'productUpload', 'variationUpload', 'logActivity',
    'captureChanges', 'sendActivityLogsData', 'buildInventoryAlertsPayload', 'getRoleViewPath',
    'formatInventoryDate', 'loadProductInventoryPageData', 'ensureListingStageColumn',
    'ensureStorefrontDisplayQuantityColumn', 'ensureVariationMediaColumns', 'ensureBomBundleSchema',
    'ensureInventoryStockMovementSchema', 'makeRenderRoleActivityLogsPage',
    'syncInventoryVariationToProductsVariation', 'syncInventoryProductCatalogToProducts',
    'cascadeArchiveCmsFromInventoryProductArchived', 'publicUrlFromMulterProductFile',
    'publicUrlFromMulterVariationFile', 'deleteProductAssetFile', 'assignVariationSku',
    'upsertProductVariationWithId', 'buildVariationDimensionsJson', 'parseSingleVariationMediaFiles',
    'resolveVariationMediaUrls', 'mapVariationMediaFiles', 'invalidateAdminPageCache',
    'insertStockMovement', 'logInventoryStockMovementFromVariationUpdate', 'logRestockVariationMovement',
    'logRestockProductMovement', 'logRestockRawMaterialMovement', 'logAdjustRawMaterialMovement',
    'logAddRawMaterialMovement', 'archiveStockMovement', 'archiveStockMovementsForProduct',
    'parseMoneyInput', 'generateProductIdentifiers', 'generateReferenceNumber',
    'normalizeProductAssetUrl', 'normalizeThumbnailList', 'deleteOldImageFile', 'generateGuid',
    'decreaseMaterialsForProduct', 'restoreMaterialsForProduct'
];

const EMPLOYEE_ORDER_CTX_KEYS = [
    'pool', 'sql', 'logActivity', 'decrementStockFromInventory', 'refundGatewayForPendingCancel',
    'refundGatewayForAdminFulfilmentStageCancel', 'sendgridHelper'
];

function buildExtractedModule(block, body) {
    const ctxKeys = block.name.includes('Order') && !block.name.includes('Crud')
        ? EMPLOYEE_ORDER_CTX_KEYS
        : EMPLOYEE_PRODUCT_CTX_KEYS;

    const destructuring = ctxKeys.map((k) => `        ${k}`).join(',\n');
    const extra = block.name.includes('Order') && !block.name.includes('Crud')
        ? ''
        : '\n    const renderRoleActivityLogsPage = makeRenderRoleActivityLogsPage(pool);\n';

    return `'use strict';

/** Extracted from routes.js lines ${block.start}-${block.end}. */
module.exports = function ${block.fn}(router, ctx) {
    const {
${destructuring}
    } = ctx;
${extra}
${body}
};
`;
}

function main() {
    const lines = fs.readFileSync(routesPath, 'utf8').split(/\r?\n/);
    const sorted = [...BLOCKS].sort((a, b) => a.start - b.start);

    for (const block of sorted) {
        const body = lines.slice(block.start - 1, block.end).join('\n');
        const outPath = path.join(__dirname, '../routes/employee', `${block.name}.js`);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, buildExtractedModule(block, body), 'utf8');
        console.log('Wrote', outPath);
    }

    let result = lines;
    for (const block of [...sorted].reverse()) {
        const replacement = [
            `    // ${block.fn} (routes/employee/${block.name}.js)`,
            `    ${block.fn}(router, ${block.ctx});`
        ].join('\n');
        result = [
            ...result.slice(0, block.start - 1),
            replacement,
            ...result.slice(block.end)
        ];
    }

    fs.writeFileSync(routesPath, result.join('\n'), 'utf8');
    console.log('Updated routes.js');
}

main();
