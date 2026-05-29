'use strict';

const { getRoleViewPath } = require('./employeeRoleViewSync');

function normalizeInventoryTabParam(tab) {
    if (!tab || tab === 'products') return 'ProductInventory';
    if (tab === 'ProductInventory') return 'ProductInventory';
    if (tab === 'bom-bundles') return 'rawmaterials-bundles';
    return tab;
}

function rolePaths(role) {
    const roleBase = `/Employee/${role.urlSegment}`;
    return {
        roleBase,
        productsListingPath: `${roleBase}/${role.viewPrefix}Products`,
        productInventoryPath: `${roleBase}/ProductInventory`
    };
}

async function renderRoleProductsListing(req, res, role, deps) {
    const {
        pool,
        loadProductInventoryPageData,
        ensureListingStageColumn,
        formatInventoryDate
    } = deps;
    const { productsListingPath, productInventoryPath } = rolePaths(role);
    const viewPath = getRoleViewPath(role, 'AdminProducts');

    try {
        await pool.connect();
        await ensureListingStageColumn(pool);
        const pageData = await loadProductInventoryPageData(pool, {
            search: req.query.search || '',
            category: req.query.category || '',
            page: parseInt(req.query.page, 10) || 1,
            limit: 50,
            inventoryProductId: req.query.inventoryProductId
        });

        if (pageData.redirectToPage) {
            const q = new URLSearchParams(req.query);
            q.set('page', String(pageData.redirectToPage));
            return res.redirect(`${productsListingPath}?` + q.toString());
        }

        res.render(viewPath, {
            user: req.session.user,
            error: req.flash('error'),
            success: req.flash('success'),
            materials: pageData.materials,
            units: pageData.units,
            categories: pageData.categories,
            bomBundles: pageData.bomBundles || [],
            allInventoryProducts: pageData.allInventoryProducts,
            pagination: pageData.pagination,
            listFilters: pageData.listFilters,
            inventoryProductIdFocus: pageData.inventoryProductIdFocus,
            formatInventoryDate
        });
    } catch (err) {
        console.error(`Error loading ${role.roleName} products listing:`, err);
        req.flash('error', 'Failed to load products.');
        res.redirect(`${productInventoryPath}?tab=ProductInventory`);
    }
}

async function renderRoleProductInventory(req, res, role, deps) {
    const {
        pool,
        loadProductInventoryPageData,
        ensureVariationMediaColumns,
        ensureBomBundleSchema,
        ensureInventoryStockMovementSchema,
        ensureListingStageColumn,
        ensureStorefrontDisplayQuantityColumn,
        formatInventoryDate
    } = deps;
    const { roleBase, productInventoryPath } = rolePaths(role);
    const viewPath = getRoleViewPath(role, 'AdminProductInventory');

    try {
        if (!req.query.tab) {
            const q = new URLSearchParams(req.query);
            q.set('tab', 'ProductInventory');
            return res.redirect(`${productInventoryPath}?` + q.toString());
        }

        await pool.connect();
        await ensureVariationMediaColumns(pool);
        await ensureBomBundleSchema(pool);
        await ensureInventoryStockMovementSchema(pool);

        const listOptions = {
            page: parseInt(req.query.page, 10) || 1,
            search: String(req.query.search || '').trim(),
            category: String(req.query.category || '').trim(),
            inventoryProductId: req.query.inventoryProductId
        };

        const pageData = await loadProductInventoryPageData(pool, listOptions);

        if (pageData.redirectToPage) {
            const q = new URLSearchParams();
            q.set('tab', normalizeInventoryTabParam(req.query.tab));
            q.set('page', String(pageData.redirectToPage));
            if (listOptions.search) q.set('search', listOptions.search);
            if (listOptions.category) q.set('category', listOptions.category);
            if (listOptions.inventoryProductId) {
                q.set('inventoryProductId', listOptions.inventoryProductId);
            }
            return res.redirect(`${productInventoryPath}?` + q.toString());
        }

        const tab = req.query.tab;
        const activeTab = tab === 'raw-materials' ? 'raw-materials'
            : (tab === 'rawmaterials-bundles' || tab === 'bom-bundles') ? 'rawmaterials-bundles'
            : tab === 'stock-movement' ? 'stock-movement'
            : 'ProductInventory';

        await ensureListingStageColumn(pool);
        await ensureStorefrontDisplayQuantityColumn(pool);

        res.render(viewPath, {
            user: req.session.user,
            error: req.flash('error'),
            success: req.flash('success'),
            inventoryItems: pageData.inventoryItems,
            products: pageData.products,
            categories: pageData.categories,
            allInventoryProducts: pageData.allInventoryProducts,
            materials: pageData.materials,
            units: pageData.units,
            bomBundles: pageData.bomBundles || [],
            pagination: pageData.pagination,
            listFilters: pageData.listFilters,
            inventoryProductIdFocus: pageData.inventoryProductIdFocus,
            buildFromQuery: req.query.buildFrom || '',
            formatInventoryDate,
            activeTab
        });
    } catch (err) {
        console.error(`Error in ${role.roleName} ProductInventory route:`, err);
        req.flash('error', 'Could not fetch inventory items.');
        res.render(viewPath, {
            user: req.session.user,
            inventoryItems: [],
            products: [],
            categories: [],
            allInventoryProducts: [],
            materials: [],
            units: [],
            pagination: { page: 1, limit: 25, totalCount: 0, totalPages: 1 },
            listFilters: { search: '', category: '' },
            inventoryProductIdFocus: null,
            activeTab: 'ProductInventory',
            bomBundles: []
        });
    }
}

function registerEmployeeRoleProductRoutes(router, role, deps, middleware) {
    const { isAuthenticated, checkPermission } = middleware;
    const perm = checkPermission('inventory_products');
    const { roleBase, productsListingPath, productInventoryPath } = rolePaths(role);

    router.get(`${roleBase}/Products`, isAuthenticated, perm, (req, res) => {
        const q = new URLSearchParams(req.query);
        return res.redirect(productsListingPath + (q.toString() ? '?' + q.toString() : ''));
    });

    router.get(productsListingPath, isAuthenticated, perm, (req, res) => {
        renderRoleProductsListing(req, res, role, deps);
    });

    router.get(`${roleBase}/ProductInventory`, isAuthenticated, perm, (req, res) => {
        renderRoleProductInventory(req, res, role, deps);
    });

    router.get(`${roleBase}/Inventory`, isAuthenticated, perm, (req, res) => {
        const q = new URLSearchParams(req.query);
        q.set('tab', normalizeInventoryTabParam(q.get('tab')));
        const qs = q.toString();
        return res.redirect(productInventoryPath + (qs ? '?' + qs : '?tab=ProductInventory'));
    });
}

module.exports = {
    renderRoleProductsListing,
    renderRoleProductInventory,
    registerEmployeeRoleProductRoutes,
    normalizeInventoryTabParam,
    rolePaths
};
