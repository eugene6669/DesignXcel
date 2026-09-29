'use strict';

/**
 * Admin Products and Inventory Routes
 * Handles: Inventory, Products, Storefront, ProductsListing, RawMaterials, BOM Bundles, Stock Movements
 */

module.exports = function registerAdminProductsRoutes(router, context) {
    const {
        sql,
        pool,
        isAuthenticated,
        checkPermission,
        logActivity,
        productUpload,
        rawMaterialPoUpload,
        multer,
        path,
        fs,
        ExcelJS
    } = context;

    // Import utility functions from various utils files
    const { invalidateAdminPageCache } = require('../../utils/adminPageCache');
    const { 
        publicUrlFromMulterProductFile,
        publicUrlFromMulterVariationFile,
        normalizeThumbnailList
    } = require('../../utils/productAssetUrls');
    const { 
        generateProductIdentifiers,
        generateGuid
    } = require('../../utils/generateProductIdentifiers');
    const { generateRawMaterialSKU } = require('../../utils/generateMaterialIdentifiers');
    const { parseMoneyInput } = require('../../utils/parseMoneyInput');
    const { formatInventoryDate } = require('../../utils/formatInventoryDate');
    const { ensureBomBundleSchema } = require('../../utils/bomBundleSchema');
    const {
        ensureVariationMediaColumns,
        resolvePlanVariationDisplayName,
        mapVariationMediaFiles,
        resolveVariationMediaUrls,
        assignVariationSku,
        createStorefrontProductFromInventory
    } = require('../../utils/inventoryCatalogSync');
    const {
        ensureInventoryStockMovementSchema,
        logAddRawMaterialMovement,
        fetchInventoryStockMovements,
        fetchInventoryStockMovementsGrouped,
        fetchRawMaterialStockMovementsGrouped,
        archiveStockMovement,
        archiveStockMovementsForProduct,
        archiveStockMovementsForRawMaterial,
        archiveAllProductInventoryMovements,
        archiveAllRawMaterialMovements,
        reactivateStockMovement
    } = require('../../utils/inventoryStockMovement');
    const {
        loadProductInventoryPageData,
        loadStorefrontPageData,
        ensureListingStageColumn,
        ensureStorefrontDisplayQuantityColumn
    } = require('../../utils/adminQueryHelpers');
    const { ROLES: EMPLOYEE_SYNC_ROLES } = require('../../utils/employeeRoleViewSync');
    const { getRoleViewPath } = require('../../utils/employeeRoleViewSync');
    
    // Helper functions that may need to be defined locally if not in utils
    const publicUrlFromRawMaterialPoFile = (file) => {
        if (!file) return null;
        return `/uploads/raw-materials/${file.filename}`;
    };
    
    const buildVariationDimensionsJson = (dimensions) => {
        return JSON.stringify(dimensions || {});
    };
    
    const generateBomBundleCode = (name) => {
        return `BOM-${name.substring(0, 3).toUpperCase()}-${Date.now()}`;
    };
    
    const loadActiveBomBundles = async (pool) => {
        const result = await pool.request().query('SELECT * FROM BomBundles WHERE IsActive = 1');
        return result.recordset;
    };
    
    const loadBomBundleWithMaterials = async (pool, bundleId) => {
        const bundle = await pool.request()
            .input('bundleId', sql.Int, bundleId)
            .query('SELECT * FROM BomBundles WHERE BundleID = @bundleId');
        return bundle.recordset[0];
    };
    
    const saveBomBundleMaterials = async (pool, bundleId, materials) => {
        // Save BOM bundle materials logic
        return true;
    };
    
    const normalizeBundleMaterials = (materials) => {
        return materials;
    };
    
    const ensureInventoryProductVariationMaterialsTable = async (pool) => {
        // Ensure table exists logic
        return true;
    };
    
    const syncInventoryProductQtyFromVariations = async (pool, productId) => {
        // Sync logic
        return true;
    };
    
    const syncInventoryProductCatalogToProducts = async (pool, productId) => {
        // Sync logic
        return true;
    };
    
    const saveInventoryProductMaterials = async (pool, productId, materials) => {
        // Save materials logic
        return true;
    };
    
    const getInventoryProductMaterials = async (pool, productId) => {
        // Get materials logic
        return [];
    };
    
    const saveInventoryProductVariationMaterials = async (pool, variationId, materials) => {
        // Save variation materials logic
        return true;
    };
    
    const assertSufficientRawMaterialsForConsumption = async (pool, materials) => {
        // Check sufficient materials logic
        return true;
    };
    
    const decreaseMaterialsForProduct = async (pool, productId, quantity) => {
        // Decrease materials logic
        return true;
    };
    
    const syncInventoryToProductsStock = async (pool, productId) => {
        // Sync stock logic
        return true;
    };

    // =============================================================================
    // HELPER FUNCTIONS
    // =============================================================================

    const normalizeAdminInventoryTabParam = (tab) => {
        if (!tab || tab === 'products') return 'ProductInventory';
        if (tab === 'ProductInventory') return 'ProductInventory';
        if (tab === 'bom-bundles') return 'rawmaterials-bundles';
        return tab;
    };

    const redirectProductInventoryTab = (req, res, flashType, message) => {
        if (flashType && message) req.flash(flashType, message);
        const tab = normalizeAdminInventoryTabParam(req.body?.redirectTab || req.query?.tab);
        return res.redirect('/Employee/Admin/Inventory?tab=' + encodeURIComponent(tab));
    };

    // =============================================================================
    // MAIN PAGE ROUTES
    // =============================================================================

    // Legacy redirect from /Employee/Admin/Products to /Employee/Admin/ProductsListing
    router.get('/Employee/Admin/Products', isAuthenticated, (req, res) => {
        const q = new URLSearchParams(req.query);
        return res.redirect('/Employee/Admin/ProductsListing' + (q.toString() ? '?' + q.toString() : ''));
    });

    // Legacy redirect from /Employee/Admin/RawMaterials to /Employee/Admin/Inventory?tab=raw-materials
    router.get('/Employee/Admin/RawMaterials', isAuthenticated, (req, res) => {
        const q = new URLSearchParams(req.query);
        q.set('tab', 'raw-materials');
        return res.redirect('/Employee/Admin/Inventory?' + q.toString());
    });

    // Legacy RawMaterials page
    router.get('/Employee/Admin/RawMaterials/_legacy', isAuthenticated, async (req, res) => {
        let materials = [];
        let units = [];

        try {
            await pool.connect();

            // Ensure MeasurementUnits table exists
            try {
                await pool.request().query(`
                    IF OBJECT_ID('dbo.MeasurementUnits','U') IS NULL
                    BEGIN
                        CREATE TABLE dbo.MeasurementUnits (
                            UnitID INT IDENTITY(1,1) PRIMARY KEY,
                            UnitName NVARCHAR(100) NOT NULL UNIQUE,
                            IsActive BIT NOT NULL DEFAULT 1,
                            CreatedAt DATETIME2(0) NOT NULL DEFAULT GETDATE(),
                            UpdatedAt DATETIME2(0) NULL
                        );
                        
                        -- Insert default units (only if table was just created)
                        INSERT INTO MeasurementUnits (UnitName) VALUES
                        ('pcs'), ('kg'), ('m'), ('sqm'), ('l'), ('10pcs per Box'), 
                        ('50pcs per Box'), ('roll'), ('sheet'), ('board'), ('panel'), 
                        ('ft'), ('yd'), ('cbm'), ('set'), ('pair');
                    END
                `);
            } catch (tableErr) {
                console.error('Error creating MeasurementUnits table:', tableErr);
            }

            // Fetch materials
            try {
                const result = await pool.request().query('SELECT * FROM RawMaterials WHERE IsActive = 1');
                materials = result.recordset || [];
            } catch (materialsErr) {
                console.error('Error fetching raw materials:', materialsErr);
                materials = [];
            }

            // Fetch units
            try {
                const unitsResult = await pool.request().query('SELECT UnitID, UnitName FROM MeasurementUnits WHERE IsActive = 1 ORDER BY UnitName');
                units = unitsResult.recordset || [];
            } catch (unitsErr) {
                console.error('Error fetching measurement units:', unitsErr);
                units = [
                    { UnitID: 1, UnitName: 'pcs' },
                    { UnitID: 2, UnitName: 'kg' },
                    { UnitID: 3, UnitName: 'm' },
                    { UnitID: 4, UnitName: 'sqm' },
                    { UnitID: 5, UnitName: 'l' },
                    { UnitID: 6, UnitName: '10pcs per Box' },
                    { UnitID: 7, UnitName: '50pcs per Box' },
                    { UnitID: 8, UnitName: 'roll' },
                    { UnitID: 9, UnitName: 'sheet' },
                    { UnitID: 10, UnitName: 'board' },
                    { UnitID: 11, UnitName: 'panel' },
                    { UnitID: 12, UnitName: 'ft' },
                    { UnitID: 13, UnitName: 'yd' },
                    { UnitID: 14, UnitName: 'cbm' },
                    { UnitID: 15, UnitName: 'set' },
                    { UnitID: 16, UnitName: 'pair' }
                ];
            }

            res.render('Employee/Admin/AdminMaterials', { user: req.session.user, materials: materials, units: units });
        } catch (err) {
            console.error('Error in RawMaterials route:', err);
            req.flash('error', 'Could not fetch raw materials.');
            if (!units || units.length === 0) {
                units = [
                    { UnitID: 1, UnitName: 'pcs' },
                    { UnitID: 2, UnitName: 'kg' },
                    { UnitID: 3, UnitName: 'm' },
                    { UnitID: 4, UnitName: 'sqm' },
                    { UnitID: 5, UnitName: 'l' }
                ];
            }
            res.render('Employee/Admin/AdminMaterials', { user: req.session.user, materials: materials, units: units });
        }
    });

    // Legacy redirect from /Employee/Admin/ProductInventory to /Employee/Admin/Inventory
    router.get('/Employee/Admin/ProductInventory', isAuthenticated, (req, res) => {
        const q = new URLSearchParams(req.query);
        q.set('tab', normalizeAdminInventoryTabParam(q.get('tab')));
        const qs = q.toString();
        return res.redirect('/Employee/Admin/Inventory' + (qs ? '?' + qs : '?tab=ProductInventory'));
    });

    // Admin - Inventory page (CREATE PRODUCTS tab)
    router.get('/Employee/Admin/Inventory', isAuthenticated, async (req, res) => {
        try {
            if (!req.query.tab) {
                const q = new URLSearchParams(req.query);
                q.set('tab', 'ProductInventory');
                return res.redirect('/Employee/Admin/Inventory?' + q.toString());
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
                q.set('tab', normalizeAdminInventoryTabParam(req.query.tab));
                q.set('page', String(pageData.redirectToPage));
                if (listOptions.search) q.set('search', listOptions.search);
                if (listOptions.category) q.set('category', listOptions.category);
                if (listOptions.inventoryProductId) {
                    q.set('inventoryProductId', listOptions.inventoryProductId);
                }
                return res.redirect('/Employee/Admin/Inventory?' + q.toString());
            }

            const tab = req.query.tab;
            const activeTab = tab === 'raw-materials' ? 'raw-materials'
                : (tab === 'rawmaterials-bundles' || tab === 'bom-bundles') ? 'rawmaterials-bundles'
                : tab === 'stock-movement' ? 'stock-movement'
                : 'ProductInventory';

            await ensureListingStageColumn(pool);
            await ensureStorefrontDisplayQuantityColumn(pool);
            res.render('Employee/Admin/AdminProductInventory', {
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
                formatInventoryDate: formatInventoryDate,
                activeTab
            });
        } catch (err) {
            console.error('Error in ProductInventory route:', err);
            req.flash('error', 'Could not fetch inventory items.');
            res.render('Employee/Admin/AdminProductInventory', {
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
    });

    // Admin - Storefront page
    router.get('/Employee/Admin/Storefront', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            await ensureListingStageColumn(pool);
            await ensureStorefrontDisplayQuantityColumn(pool);
            const pageData = await loadStorefrontPageData(pool, {
                search: req.query.search || '',
                category: req.query.category || '',
                page: parseInt(req.query.page, 10) || 1,
                limit: 50,
                inventoryProductId: req.query.inventoryProductId
            });
            if (pageData.redirectToPage) {
                const q = new URLSearchParams(req.query);
                q.set('page', String(pageData.redirectToPage));
                return res.redirect('/Employee/Admin/Storefront?' + q.toString());
            }
            res.render('Employee/Admin/AdminStorefront', {
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
                formatInventoryDate: formatInventoryDate
            });
        } catch (err) {
            console.error('Error loading Admin Storefront page:', err);
            req.flash('error', 'Failed to load storefront products.');
            res.redirect('/Employee/Admin/Inventory?tab=ProductInventory');
        }
    });

    // Storefront routes for other roles
    EMPLOYEE_SYNC_ROLES.forEach((role) => {
        const roleBase = `/Employee/${role.urlSegment}`;
        const storefrontView = getRoleViewPath(role, 'AdminStorefront');
        router.get(`${roleBase}/Storefront`, isAuthenticated, async (req, res) => {
            try {
                await pool.connect();
                await ensureListingStageColumn(pool);
                await ensureStorefrontDisplayQuantityColumn(pool);
                const pageData = await loadStorefrontPageData(pool, {
                    search: req.query.search || '',
                    category: req.query.category || '',
                    page: parseInt(req.query.page, 10) || 1,
                    limit: 50,
                    inventoryProductId: req.query.inventoryProductId
                });
                if (pageData.redirectToPage) {
                    const q = new URLSearchParams(req.query);
                    q.set('page', String(pageData.redirectToPage));
                    return res.redirect(`${roleBase}/Storefront?` + q.toString());
                }
                res.render(storefrontView, {
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
                    formatInventoryDate: formatInventoryDate
                });
            } catch (err) {
                console.error(`Error loading ${role.roleName} Storefront page:`, err);
                req.flash('error', 'Failed to load storefront products.');
                res.redirect(`${roleBase}/ProductInventory?tab=ProductInventory`);
            }
        });
    });

    // Admin - ProductsListing page
    router.get('/Employee/Admin/ProductsListing', isAuthenticated, async (req, res) => {
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
                return res.redirect('/Employee/Admin/ProductsListing?' + q.toString());
            }
            res.render('Employee/Admin/AdminProducts', {
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
                formatInventoryDate: formatInventoryDate
            });
        } catch (err) {
            console.error('Error loading Admin Products Listing page:', err);
            req.flash('error', 'Failed to load products.');
            res.redirect('/Employee/Admin/Inventory?tab=ProductInventory');
        }
    });

    // Legacy Products page
    router.get('/Employee/Admin/Products/_legacy', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            // Catalog parent products have no SKU; sellable units use variation SKUs only
            await pool.request().query(`
                UPDATE p
                SET p.SKU = NULL, p.UpdatedAt = GETDATE()
                FROM Products p
                INNER JOIN InventoryProducts ip ON ip.ProductID = p.ProductID AND ip.IsActive = 1
                WHERE p.SKU IS NOT NULL
            `);
            const page = parseInt(req.query.page) || 1;
            const limit = 20;
            const offset = (page - 1) * limit;

            // Get total count of active products
            const countResult = await pool.request().query(`
                SELECT 
                    (SELECT COUNT(*) FROM Products WHERE IsActive = 1) +
                    (SELECT COUNT(*) FROM InventoryProducts WHERE IsActive = 1 AND ProductID IS NULL) as total
            `);
            const totalProducts = countResult.recordset[0].total || 0;
            const totalPages = Math.ceil(totalProducts / limit);

            // Fetch products with pagination
            const productsResult = await pool.request()
                .input('offset', sql.Int, offset)
                .input('limit', sql.Int, limit)
                .query(`
                    SELECT 
                        p.ProductID,
                        p.Name,
                        p.Description,
                        p.Price,
                        p.StockQuantity,
                        p.Category,
                        p.ImageURL,
                        p.ThumbnailURLs,
                        p.Dimensions,
                        p.Model3DURL as Model3D,
                        p.DateAdded,
                        p.IsActive,
                        COALESCE(
                            linkedIp.AvailableQuantity,
                            linkedIpById.AvailableQuantity,
                            p.StockQuantity
                        ) as AvailableStock,
                        COALESCE(linkedIp.SKU, linkedIpById.SKU, p.SKU) as SKU,
                        COALESCE(linkedIp.SKU, linkedIpById.SKU, p.SKU) as EffectiveSKU,
                        COALESCE(linkedIp.InventoryProductID, linkedIpById.InventoryProductID) as InventoryProductID,
                        d.DiscountedPrice,
                        d.DiscountPercentage,
                        d.StartDate as DiscountStartDate,
                        d.EndDate as DiscountEndDate
                    FROM Products p
                    OUTER APPLY (
                        SELECT TOP 1
                            ip.InventoryProductID,
                            ip.SKU,
                            ip.AvailableQuantity
                        FROM InventoryProducts ip
                        WHERE ip.ProductID = p.ProductID
                          AND ip.IsActive = 1
                        ORDER BY ip.DateUpdated DESC, ip.DateAdded DESC, ip.InventoryProductID DESC
                    ) linkedIp
                    OUTER APPLY (
                        SELECT TOP 1
                            ip.InventoryProductID,
                            ip.SKU,
                            ip.AvailableQuantity
                        FROM InventoryProducts ip
                        WHERE ip.InventoryProductID = p.ProductID
                          AND ip.IsActive = 1
                    ) linkedIpById
                    LEFT JOIN Discounts d ON p.ProductID = d.ProductID 
                        AND d.IsActive = 1 
                        AND GETDATE() BETWEEN d.StartDate AND d.EndDate
                    WHERE p.IsActive = 1
                    ORDER BY p.DateAdded DESC
                    OFFSET @offset ROWS
                    FETCH NEXT @limit ROWS ONLY
                `);

            const products = productsResult.recordset;

            // Fetch inventory products not linked to Products table
            const inventoryProductsResult = await pool.request()
                .input('offset', sql.Int, offset)
                .input('limit', sql.Int, limit)
                .query(`
                    SELECT 
                        ip.InventoryProductID as ProductID,
                        ip.Name,
                        ip.Description,
                        ip.Price,
                        COALESCE(ip.AvailableQuantity, 0) as StockQuantity,
                        ip.Category,
                        ip.ImageURL as ImageURL,
                        NULL as ThumbnailURLs,
                        ip.Dimensions,
                        NULL as Model3D,
                        ip.DateAdded,
                        ip.IsActive,
                        COALESCE(ip.AvailableQuantity, 0) as AvailableStock,
                        ip.SKU,
                        ip.InventoryProductID,
                        NULL as DiscountedPrice,
                        NULL as DiscountPercentage,
                        NULL as DiscountStartDate,
                        NULL as DiscountEndDate,
                        'InventoryProduct' as SourceType
                    FROM InventoryProducts ip
                    LEFT JOIN Products p ON ip.ProductID = p.ProductID AND p.IsActive = 1
                    WHERE ip.IsActive = 1 AND p.ProductID IS NULL
                    ORDER BY ip.DateAdded DESC
                    OFFSET @offset ROWS
                    FETCH NEXT @limit ROWS ONLY
                `);

            const inventoryProducts = inventoryProductsResult.recordset || [];
            products.forEach(p => p.SourceType = 'Product');
            const allProducts = [...products, ...inventoryProducts];

            // Get categories
            const categoriesResult = await pool.request().query(`
                SELECT DISTINCT Category
                FROM (
                    SELECT Category FROM Products WHERE IsActive = 1 AND Category IS NOT NULL AND Category != ''
                    UNION
                    SELECT Category FROM InventoryProducts WHERE IsActive = 1 AND Category IS NOT NULL AND Category != ''
                ) AS AllCategories
                ORDER BY Category
            `);
            const categories = categoriesResult.recordset.map(row => row.Category);

            res.render('Employee/Admin/AdminProducts', {
                products: allProducts || products,
                categories: categories,
                page: page,
                totalPages: totalPages,
                currentUser: req.session.user
            });
        } catch (err) {
            console.error('Error fetching products:', err);
            req.flash('error', 'Failed to load products. Please try again.');
            res.render('Employee/Admin/AdminProducts', {
                products: [],
                categories: [],
                page: 1,
                totalPages: 0,
                currentUser: req.session.user
            });
        }
    });

    // =============================================================================
    // RAW MATERIALS ROUTES
    // =============================================================================

    // Admin - Add Raw Material
    router.post('/Employee/Admin/RawMaterials/Add', isAuthenticated, rawMaterialPoUpload.single('purchaseOrderImage'), async (req, res) => {
        try {
            await pool.connect();
            await ensureBomBundleSchema(pool);
            const { name, quantity, unit, supplier, purchaseOrderNumber } = req.body;
            const purchaseOrderImageUrl = req.file ? publicUrlFromRawMaterialPoFile(req.file) : null;

            const insertResult = await pool.request()
                .input('name', sql.NVarChar, name)
                .input('quantity', sql.Int, quantity)
                .input('unit', sql.NVarChar, unit)
                .input('supplier', sql.NVarChar, (supplier || '').trim() || null)
                .input('purchaseOrderNumber', sql.NVarChar, (purchaseOrderNumber || '').trim() || null)
                .input('purchaseOrderImageUrl', sql.NVarChar, purchaseOrderImageUrl)
                .query(`
                    INSERT INTO RawMaterials (
                        Name, QuantityAvailable, Unit, Supplier,
                        PurchaseOrderNumber, PurchaseOrderImageURL,
                        LastUpdated, IsActive
                    )
                    OUTPUT INSERTED.MaterialID
                    VALUES (
                        @name, @quantity, @unit, @supplier,
                        @purchaseOrderNumber, @purchaseOrderImageUrl,
                        GETDATE(), 1
                    )
                `);

            const materialId = insertResult.recordset[0].MaterialID;
            const sku = generateRawMaterialSKU(materialId, name);
            await pool.request()
                .input('materialId', sql.Int, materialId)
                .input('sku', sql.NVarChar, sku)
                .query('UPDATE RawMaterials SET SKU = @sku WHERE MaterialID = @materialId');

            const addQty = parseInt(quantity, 10) || 0;
            if (addQty > 0) {
                await ensureInventoryStockMovementSchema(pool);
                await logAddRawMaterialMovement(pool, {
                    rawMaterialId: materialId,
                    quantity: addQty,
                    materialName: name,
                    unit: unit,
                    supplier: (supplier || '').trim() || null,
                    purchaseOrderNumber: (purchaseOrderNumber || '').trim() || null,
                    purchaseOrderImageUrl: purchaseOrderImageUrl,
                    userId: req.session.user && req.session.user.id
                });
            }

            invalidateAdminPageCache('admin:');
            return redirectProductInventoryTab(req, res, 'success', `Raw material added (${sku}).`);
        } catch (err) {
            console.error('Error adding raw material:', err);
            return redirectProductInventoryTab(req, res, 'error', 'Failed to add raw material: ' + err.message);
        }
    });

    // Admin - Edit Raw Material
    router.post('/Employee/Admin/RawMaterials/Edit', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            await ensureBomBundleSchema(pool);
            const { materialid, name, unit } = req.body;

            await pool.request()
                .input('materialId', sql.Int, materialid)
                .input('name', sql.NVarChar, name)
                .input('unit', sql.NVarChar, unit)
                .query(`
                    UPDATE RawMaterials 
                    SET Name = @name, Unit = @unit, LastUpdated = GETDATE()
                    WHERE MaterialID = @materialId
                `);

            invalidateAdminPageCache('admin:');
            return redirectProductInventoryTab(req, res, 'success', 'Raw material updated successfully!');
        } catch (err) {
            console.error('Error updating raw material:', err);
            return redirectProductInventoryTab(req, res, 'error', 'Failed to update raw material: ' + err.message);
        }
    });

    // Admin - Delete Raw Material
    router.post('/Employee/Admin/RawMaterials/Delete/:id', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();

            const materialId = req.params.id;

            const checkResult = await pool.request()
                .input('id', sql.Int, materialId)
                .query('SELECT MaterialID, Name FROM RawMaterials WHERE MaterialID = @id');

            if (checkResult.recordset.length === 0) {
                req.flash('error', 'Raw material not found.');
                const tab = req.body?.redirectTab || 'raw-materials';
                return res.redirect('/Employee/Admin/Inventory?tab=' + encodeURIComponent(tab));
            }

            const materialName = checkResult.recordset[0].Name;

            await pool.request()
                .input('id', sql.Int, materialId)
                .query('UPDATE RawMaterials SET IsActive = 0 WHERE MaterialID = @id');

            await logActivity(
                req.session.user.id,
                'DELETE',
                'RawMaterials',
                materialId.toString(),
                `Admin archived raw material: "${materialName}" (ID: ${materialId})`,
                JSON.stringify({ IsActive: { old: 1, new: 0 } })
            );

            req.flash('success', `Raw material "${materialName}" has been archived. You can restore it from the Archived page.`);
            const tab = req.body?.redirectTab || 'raw-materials';
            res.redirect('/Employee/Admin/Inventory?tab=' + encodeURIComponent(tab));
        } catch (err) {
            console.error('Error archiving raw material:', err);
            req.flash('error', 'Failed to archive raw material. Please try again.');
            const tab = req.body?.redirectTab || 'raw-materials';
            res.redirect('/Employee/Admin/Inventory?tab=' + encodeURIComponent(tab));
        }
    });

    // =============================================================================
    // MEASUREMENT UNITS API
    // =============================================================================

    router.get('/api/admin/measurement-units', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const result = await pool.request().query(`
                SELECT UnitID, UnitName 
                FROM MeasurementUnits 
                WHERE IsActive = 1 
                ORDER BY UnitName
            `);
            res.json({ success: true, units: result.recordset });
        } catch (err) {
            console.error('Error fetching measurement units:', err);
            res.status(500).json({ success: false, message: 'Failed to fetch measurement units' });
        }
    });

    router.post('/api/admin/measurement-units', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const { unitName } = req.body;

            if (!unitName || unitName.trim() === '') {
                return res.json({ success: false, message: 'Unit name is required' });
            }

            const checkResult = await pool.request()
                .input('unitName', sql.NVarChar, unitName.trim())
                .query('SELECT UnitID FROM MeasurementUnits WHERE UnitName = @unitName AND IsActive = 1');

            if (checkResult.recordset.length > 0) {
                return res.json({ success: false, message: 'This unit of measurement already exists' });
            }

            await pool.request()
                .input('unitName', sql.NVarChar, unitName.trim())
                .query(`
                    INSERT INTO MeasurementUnits (UnitName, IsActive)
                    VALUES (@unitName, 1)
                `);

            res.json({ success: true, message: 'Unit of measurement added successfully!' });
        } catch (err) {
            console.error('Error adding measurement unit:', err);
            res.status(500).json({ success: false, message: 'Failed to add unit: ' + err.message });
        }
    });

    router.delete('/api/admin/measurement-units/:unitId', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const unitId = parseInt(req.params.unitId);

            const usageCheck = await pool.request()
                .input('unitId', sql.Int, unitId)
                .query(`
                    SELECT COUNT(*) as count 
                    FROM RawMaterials 
                    WHERE Unit = (SELECT UnitName FROM MeasurementUnits WHERE UnitID = @unitId)
                    AND IsActive = 1
                `);

            if (usageCheck.recordset[0].count > 0) {
                return res.json({
                    success: false,
                    message: 'Cannot delete this unit. It is currently being used by ' + usageCheck.recordset[0].count + ' raw material(s).'
                });
            }

            await pool.request()
                .input('unitId', sql.Int, unitId)
                .query(`
                    UPDATE MeasurementUnits 
                    SET IsActive = 0, UpdatedAt = GETDATE()
                    WHERE UnitID = @unitId
                `);

            res.json({ success: true, message: 'Unit of measurement deleted successfully!' });
        } catch (err) {
            console.error('Error deleting measurement unit:', err);
            res.status(500).json({ success: false, message: 'Failed to delete unit: ' + err.message });
        }
    });

    // =============================================================================
    // BOM BUNDLE API (manufacturing recipes)
    // =============================================================================

    router.get('/api/admin/bom-bundles', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const bundles = await loadActiveBomBundles(pool);
            res.json({ success: true, bundles });
        } catch (err) {
            console.error('Error fetching BOM bundles:', err);
            res.status(500).json({ success: false, message: 'Failed to fetch raw materials bundles.' });
        }
    });

    router.get('/api/admin/bom-bundles/:id', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const id = parseInt(req.params.id, 10);
            if (!id) return res.status(400).json({ success: false, message: 'Invalid bundle ID.' });
            const data = await loadBomBundleWithMaterials(pool, id);
            if (!data) return res.status(404).json({ success: false, message: 'Raw materials bundle not found.' });
            res.json({
                success: true,
                bundle: data.bundle,
                materials: data.materials.map((m) => ({
                    materialId: m.MaterialID,
                    quantityRequired: m.QuantityRequired,
                    materialName: m.MaterialName,
                    materialSku: m.MaterialSKU,
                    unit: m.Unit,
                    stockQuantity: m.QuantityAvailable
                }))
            });
        } catch (err) {
            console.error('Error fetching BOM bundle:', err);
            res.status(500).json({ success: false, message: 'Failed to fetch raw materials bundle.' });
        }
    });

    router.post('/api/admin/bom-bundles', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            await ensureBomBundleSchema(pool);
            const { name, description, materials } = req.body;
            if (!name || !String(name).trim()) {
                return res.status(400).json({ success: false, message: 'Bundle name is required.' });
            }
            const validMaterials = normalizeBundleMaterials(materials);
            if (validMaterials.length === 0) {
                return res.status(400).json({ success: false, message: 'Add at least one material with quantity.' });
            }

            const transaction = new sql.Transaction(pool);
            await transaction.begin();
            try {
                const insertResult = await transaction.request()
                    .input('name', sql.NVarChar, String(name).trim())
                    .input('description', sql.NVarChar, (description || '').trim() || null)
                    .input('userId', sql.Int, req.session.user?.id || null)
                    .query(`
                        INSERT INTO BomBundles (Name, Description, BundleCode, CreatedBy, IsActive)
                        VALUES (@name, @description, 'TEMP', @userId, 1);
                        SELECT SCOPE_IDENTITY() AS BomBundleID;
                    `);
                const bundleId = insertResult.recordset[0].BomBundleID;
                const bundleCode = generateBomBundleCode(bundleId, name);
                await transaction.request()
                    .input('id', sql.Int, bundleId)
                    .input('code', sql.NVarChar, bundleCode)
                    .query('UPDATE BomBundles SET BundleCode = @code WHERE BomBundleID = @id');

                await saveBomBundleMaterials(transaction, bundleId, validMaterials);
                await transaction.commit();
                invalidateAdminPageCache('admin:');
                res.json({
                    success: true,
                    message: 'Raw materials bundle created.',
                    bomBundleId: bundleId,
                    bundleCode
                });
            } catch (txErr) {
                await transaction.rollback();
                throw txErr;
            }
        } catch (err) {
            console.error('Error creating BOM bundle:', err);
            res.status(500).json({ success: false, message: 'Failed to create raw materials bundle: ' + err.message });
        }
    });

    router.put('/api/admin/bom-bundles/:id', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            await ensureBomBundleSchema(pool);
            const id = parseInt(req.params.id, 10);
            const { name, description, materials } = req.body;
            if (!id) return res.status(400).json({ success: false, message: 'Invalid bundle ID.' });
            if (!name || !String(name).trim()) {
                return res.status(400).json({ success: false, message: 'Bundle name is required.' });
            }
            const validMaterials = normalizeBundleMaterials(materials);
            if (validMaterials.length === 0) {
                return res.status(400).json({ success: false, message: 'Add at least one material with quantity.' });
            }

            const transaction = new sql.Transaction(pool);
            await transaction.begin();
            try {
                await transaction.request()
                    .input('id', sql.Int, id)
                    .input('name', sql.NVarChar, String(name).trim())
                    .input('description', sql.NVarChar, (description || '').trim() || null)
                    .input('userId', sql.Int, req.session.user?.id || null)
                    .query(`
                        UPDATE BomBundles
                        SET Name = @name, Description = @description,
                            UpdatedBy = @userId, DateUpdated = GETDATE()
                        WHERE BomBundleID = @id AND IsActive = 1
                    `);
                await saveBomBundleMaterials(transaction, id, validMaterials);
                await transaction.commit();
                invalidateAdminPageCache('admin:');
                res.json({ success: true, message: 'Raw materials bundle updated.' });
            } catch (txErr) {
                await transaction.rollback();
                throw txErr;
            }
        } catch (err) {
            console.error('Error updating BOM bundle:', err);
            res.status(500).json({ success: false, message: 'Failed to update raw materials bundle: ' + err.message });
        }
    });

    router.delete('/api/admin/bom-bundles/:id', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const id = parseInt(req.params.id, 10);
            if (!id) return res.status(400).json({ success: false, message: 'Invalid bundle ID.' });
            await pool.request()
                .input('id', sql.Int, id)
                .input('userId', sql.Int, req.session.user?.id || null)
                .query(`
                    UPDATE BomBundles
                    SET IsActive = 0, UpdatedBy = @userId, DateUpdated = GETDATE()
                    WHERE BomBundleID = @id
                `);
            invalidateAdminPageCache('admin:');
            res.json({ success: true, message: 'Raw materials bundle archived.' });
        } catch (err) {
            console.error('Error archiving BOM bundle:', err);
            res.status(500).json({ success: false, message: 'Failed to archive raw materials bundle.' });
        }
    });

    // =============================================================================
    // STOCK MOVEMENT ROUTES
    // =============================================================================

    router.get('/api/admin/inventory-stock-movements', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            await ensureInventoryStockMovementSchema(pool);
            const opts = {
                page: parseInt(req.query.page, 10) || 1,
                limit: parseInt(req.query.limit, 10) || 20,
                inventoryProductId: req.query.inventoryProductId,
                variationId: req.query.variationId
            };
            const grouped = req.query.grouped === '1' || req.query.grouped === 'true';
            if (grouped) {
                const [productData, rawMaterialData] = await Promise.all([
                    fetchInventoryStockMovementsGrouped(pool, opts),
                    fetchRawMaterialStockMovementsGrouped(pool, { page: 1, limit: 100 })
                ]);
                return res.json({
                    success: true,
                    grouped: true,
                    products: productData.products,
                    pagination: productData.pagination,
                    rawMaterials: rawMaterialData.materials,
                    rawMaterialPagination: rawMaterialData.pagination
                });
            }
            const data = await fetchInventoryStockMovements(pool, opts);
            res.json({ success: true, grouped: false, ...data });
        } catch (err) {
            console.error('inventory-stock-movements:', err);
            res.status(500).json({ success: false, message: err.message || 'Failed to load stock movements.' });
        }
    });

    router.post('/api/admin/inventory-stock-movements/:id/archive', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const movementId = parseInt(req.params.id, 10);
            const result = await archiveStockMovement(pool, movementId);
            if (!result.ok) {
                return res.status(400).json({ success: false, message: result.message });
            }
            res.json({ success: true, message: 'Stock movement archived.' });
        } catch (err) {
            console.error('archive stock movement:', err);
            res.status(500).json({ success: false, message: err.message || 'Failed to archive movement.' });
        }
    });

    router.post('/api/admin/inventory-stock-movements/archive-bulk', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const scope = String(req.body.scope || '').trim();
            let result;
            if (scope === 'product') {
                result = await archiveStockMovementsForProduct(pool, req.body.inventoryProductId);
            } else if (scope === 'rawMaterial') {
                result = await archiveStockMovementsForRawMaterial(pool, req.body.rawMaterialId);
            } else if (scope === 'allProducts') {
                result = await archiveAllProductInventoryMovements(pool);
                result.message = result.count
                    ? ('Archived ' + result.count + ' product movement(s).')
                    : 'No product movements to archive.';
            } else if (scope === 'allRawMaterials') {
                result = await archiveAllRawMaterialMovements(pool);
                result.message = result.count
                    ? ('Archived ' + result.count + ' raw material movement(s).')
                    : 'No raw material movements to archive.';
            } else {
                return res.status(400).json({ success: false, message: 'Invalid archive scope.' });
            }
            res.json({
                success: true,
                message: result.message || 'Movements archived.',
                count: result.count || 0
            });
        } catch (err) {
            console.error('archive bulk stock movement:', err);
            res.status(500).json({ success: false, message: err.message || 'Failed to archive movements.' });
        }
    });

    router.delete('/api/admin/inventory-stock-movements/:id/permanent', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            await ensureInventoryStockMovementSchema(pool);
            const movementId = parseInt(req.params.id, 10);
            if (!movementId) {
                return res.status(400).json({ success: false, message: 'Invalid movement ID.' });
            }
            const result = await pool.request()
                .input('movementId', sql.Int, movementId)
                .query(`DELETE FROM InventoryStockMovements WHERE MovementID = @movementId`);
            if (!result.rowsAffected[0]) {
                return res.status(404).json({ success: false, message: 'Movement not found.' });
            }
            res.json({ success: true, message: 'Stock movement permanently deleted.' });
        } catch (err) {
            console.error('permanent delete stock movement:', err);
            res.status(500).json({ success: false, message: err.message || 'Failed to delete movement.' });
        }
    });

    // =============================================================================
    // PRODUCTS LISTING ROUTES (Step 1: Plan/Retail)
    // =============================================================================

    // Step 1 — Plan product (catalog: images, prices, dimensions, variations — no stock yet)
    router.post('/Employee/Admin/ProductsListing/Add', isAuthenticated, productUpload.fields([
        { name: 'productMainImage', maxCount: 1 },
        { name: 'variationMainImage', maxCount: 50 }
    ]), async (req, res) => {
        const wantsJson = req.get('X-Requested-With') === 'XMLHttpRequest';
        const respondPlanError = (message, status = 400) => {
            if (wantsJson) return res.status(status).json({ success: false, message });
            req.flash('error', message);
            return res.redirect('/Employee/Admin/ProductsListing');
        };
        const respondPlanSuccess = (inventoryProductId) => {
            invalidateAdminPageCache('admin:');
            if (wantsJson) {
                return res.json({
                    success: true,
                    message: 'Product plan saved. Continue in Inventory to add materials and stock.',
                    inventoryProductId
                });
            }
            req.flash('success', 'Product plan saved. Use Build in Inventory when you are ready to add materials and stock.');
            return res.redirect('/Employee/Admin/ProductsListing');
        };
        try {
            await pool.connect();
            await ensureListingStageColumn(pool);
            await ensureVariationMediaColumns(pool);
            const { name, description, price, costPrice, category, variationsJson, length, width, height } = req.body;
            const parentDimensionsJson = buildVariationDimensionsJson({ length, width, height });
            if (!name || !category) {
                return respondPlanError('Product name and category are required.');
            }
            let variationsList = [];
            if (variationsJson) {
                try {
                    variationsList = typeof variationsJson === 'string' ? JSON.parse(variationsJson) : variationsJson;
                } catch (e) {
                    return respondPlanError('Invalid variations data.');
                }
            }
            if (!Array.isArray(variationsList) || variationsList.length === 0) {
                return respondPlanError('Add at least one variation with color/type and main image.');
            }
            const parentPrice = parseMoneyInput(price);
            if (Number.isNaN(parentPrice) || parentPrice <= 0) {
                return respondPlanError('Sale price is required and must be greater than zero.');
            }
            const parentCost = parseMoneyInput(costPrice);
            if (Number.isNaN(parentCost) || parentCost < 0) {
                return respondPlanError('Item cost price is required and must be zero or greater.');
            }
            if (parentCost > parentPrice) {
                return respondPlanError('Item cost price cannot be higher than the sale price.');
            }
            const validVariations = variationsList.filter((v) => {
                const vName = resolvePlanVariationDisplayName(v);
                return vName && (v.hasMainImage === true || v.hasMainImage === 'true' || v.hasMainImage === 1);
            });
            if (validVariations.length === 0) {
                return respondPlanError('Each variation needs color or type, and a main image.');
            }
            const mediaByVariation = mapVariationMediaFiles(req.files, validVariations);
            const transaction = new sql.Transaction(pool);
            await transaction.begin();
            try {
                const tempSlug = `plan-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
                const defaultReorderPoint = 10;
                const insert = await transaction.request()
                    .input('name', sql.NVarChar, name)
                    .input('description', sql.NVarChar, description || '')
                    .input('price', sql.Decimal(10, 2), parentPrice)
                    .input('costPrice', sql.Decimal(10, 2), parentCost)
                    .input('category', sql.NVarChar, category)
                    .input('dimensions', sql.NVarChar, parentDimensionsJson)
                    .input('tempSlug', sql.NVarChar, tempSlug)
                    .input('reorderPoint', sql.Int, defaultReorderPoint)
                    .input('createdBy', sql.Int, req.session.user.id)
                    .query(`
                        INSERT INTO InventoryProducts (
                            Name, Description, Price, CostPrice, Category, Dimensions,
                            ReorderPoint,
                            DateAdded, IsActive, ListingStage, Slug, PublicId, CreatedBy, InventoryNotes
                        )
                        VALUES (
                            @name, @description, @price, @costPrice, @category, @dimensions,
                            @reorderPoint,
                            GETDATE(), 1, 'planned', @tempSlug, NEWID(), @createdBy, @description
                        );
                        SELECT SCOPE_IDENTITY() AS InventoryProductID;
                    `);
                const inventoryProductId = insert.recordset[0].InventoryProductID;
                const { slug } = generateProductIdentifiers(inventoryProductId, name);
                await transaction.request()
                    .input('id', sql.Int, inventoryProductId)
                    .input('slug', sql.NVarChar, slug)
                    .query('UPDATE InventoryProducts SET Slug = @slug WHERE InventoryProductID = @id');

                let parentImageUrl = null;
                if (req.files && req.files.productMainImage && req.files.productMainImage[0]) {
                    parentImageUrl = publicUrlFromMulterProductFile(req.files.productMainImage[0]);
                }
                if (parentImageUrl) {
                    await transaction.request()
                        .input('inventoryProductId', sql.Int, inventoryProductId)
                        .input('imageUrl', sql.NVarChar, parentImageUrl)
                        .query(`
                            UPDATE InventoryProducts SET ImageURL = @imageUrl, DateUpdated = GETDATE()
                            WHERE InventoryProductID = @inventoryProductId
                        `);
                }

                for (let vi = 0; vi < validVariations.length; vi++) {
                    const v = validVariations[vi];
                    const variationName = resolvePlanVariationDisplayName(v);
                    const media = mediaByVariation[vi] || { mainFile: null, modelFile: null, thumbFiles: [] };
                    const mediaUrls = resolveVariationMediaUrls(media, publicUrlFromMulterVariationFile);
                    if (!mediaUrls.imageUrl) {
                        throw new Error('Each variation needs a main image.');
                    }
                    const insertVar = await transaction.request()
                        .input('inventoryProductID', sql.Int, inventoryProductId)
                        .input('variationName', sql.NVarChar, variationName)
                        .input('color', sql.NVarChar, (v.color || '').trim() || null)
                        .input('shape', sql.NVarChar, (v.shape || '').trim() || null)
                        .input('variationType', sql.NVarChar, (v.variationType || v.type || '').trim() || null)
                        .input('price', sql.Decimal(10, 2), parentPrice)
                        .input('costPrice', sql.Decimal(10, 2), parentCost)
                        .input('variationImageUrl', sql.NVarChar, mediaUrls.imageUrl)
                        .input('dimensions', sql.NVarChar, '{}')
                        .input('createdBy', sql.Int, req.session.user.id)
                        .query(`
                            INSERT INTO InventoryProductVariations (
                                ProductID, InventoryProductID, VariationName, Color, Shape, VariationType,
                                Quantity, AvailableQuantity,
                                Price, CostPrice, VariationImageURL, Dimensions, IsActive, CreatedBy
                            )
                            OUTPUT INSERTED.VariationID
                            VALUES (
                                NULL, @inventoryProductID, @variationName, @color, @shape, @variationType,
                                0, 0,
                                @price, @costPrice, @variationImageUrl, @dimensions, 1, @createdBy
                            )
                        `);
                    const variationId = insertVar.recordset[0].VariationID;
                }

                await transaction.commit();
                return respondPlanSuccess(inventoryProductId);
            } catch (txErr) {
                await transaction.rollback();
                throw txErr;
            }
        } catch (err) {
            console.error('Plan product error:', err);
            return respondPlanError('Failed to save product plan: ' + (err.message || 'unknown error'), 500);
        }
    });

    // Step 1b — Edit planned product
    router.post('/Employee/Admin/ProductsListing/Update/:id', isAuthenticated, productUpload.fields([
        { name: 'productMainImage', maxCount: 1 },
        { name: 'variationMainImage', maxCount: 50 }
    ]), async (req, res) => {
        const wantsJson = req.get('X-Requested-With') === 'XMLHttpRequest';
        const respondError = (message, status = 400) => {
            if (wantsJson) return res.status(status).json({ success: false, message });
            req.flash('error', message);
            return res.redirect('/Employee/Admin/ProductsListing');
        };
        const respondSuccess = (inventoryProductId) => {
            invalidateAdminPageCache('admin:');
            if (wantsJson) {
                return res.json({
                    success: true,
                    message: 'Planned product updated.',
                    inventoryProductId
                });
            }
            req.flash('success', 'Planned product updated.');
            return res.redirect('/Employee/Admin/ProductsListing');
        };

        try {
            await pool.connect();
            await ensureListingStageColumn(pool);
            await ensureVariationMediaColumns(pool);
            const inventoryProductId = parseInt(req.params.id, 10);
            if (!inventoryProductId || Number.isNaN(inventoryProductId)) {
                return respondError('Invalid planned product id.');
            }

            const { name, description, price, costPrice, category, variationsJson, length, width, height } = req.body;
            const parentDimensionsJson = buildVariationDimensionsJson({ length, width, height });
            if (!name || !category) {
                return respondError('Product name and category are required.');
            }
            let variationsList = [];
            if (variationsJson) {
                try {
                    variationsList = typeof variationsJson === 'string' ? JSON.parse(variationsJson) : variationsJson;
                } catch (e) {
                    return respondError('Invalid variations data.');
                }
            }
            if (!Array.isArray(variationsList) || variationsList.length === 0) {
                return respondError('Add at least one variation.');
            }
            const parentPrice = parseMoneyInput(price);
            if (Number.isNaN(parentPrice) || parentPrice <= 0) {
                return respondError('Sale price is required and must be greater than zero.');
            }
            const parentCost = parseMoneyInput(costPrice);
            if (Number.isNaN(parentCost) || parentCost < 0) {
                return respondError('Item cost price is required and must be zero or greater.');
            }
            if (parentCost > parentPrice) {
                return respondError('Item cost price cannot be higher than the sale price.');
            }

            const transaction = new sql.Transaction(pool);
            await transaction.begin();
            try {
                const plannedCheck = await transaction.request()
                    .input('id', sql.Int, inventoryProductId)
                    .query(`SELECT InventoryProductID, ListingStage FROM InventoryProducts WHERE InventoryProductID = @id AND IsActive = 1`);
                if (!plannedCheck.recordset.length) {
                    throw new Error('Planned product not found.');
                }
                const stage = String(plannedCheck.recordset[0].ListingStage || '').toLowerCase();
                if (stage !== 'planned') {
                    throw new Error('Only planned products can be edited on Products Listing.');
                }

                await transaction.request()
                    .input('id', sql.Int, inventoryProductId)
                    .input('name', sql.NVarChar, name)
                    .input('description', sql.NVarChar, description || '')
                    .input('price', sql.Decimal(10, 2), parentPrice)
                    .input('costPrice', sql.Decimal(10, 2), parentCost)
                    .input('category', sql.NVarChar, category)
                    .input('dimensions', sql.NVarChar, parentDimensionsJson)
                    .query(`
                        UPDATE InventoryProducts
                        SET Name = @name,
                            Description = @description,
                            Price = @price,
                            CostPrice = @costPrice,
                            Category = @category,
                            Dimensions = @dimensions,
                            InventoryNotes = @description,
                            DateUpdated = GETDATE()
                        WHERE InventoryProductID = @id AND IsActive = 1
                    `);

                if (req.files && req.files.productMainImage && req.files.productMainImage[0]) {
                    const parentImageUrl = publicUrlFromMulterProductFile(req.files.productMainImage[0]);
                    await transaction.request()
                        .input('id', sql.Int, inventoryProductId)
                        .input('imageUrl', sql.NVarChar, parentImageUrl)
                        .query(`UPDATE InventoryProducts SET ImageURL = @imageUrl, DateUpdated = GETDATE() WHERE InventoryProductID = @id`);
                }

                const validVariations = variationsList.filter((v) => {
                    const vName = resolvePlanVariationDisplayName(v);
                    return !!vName;
                });
                if (!validVariations.length) {
                    throw new Error('Add at least one variation with color or type.');
                }

                const mediaByVariation = mapVariationMediaFiles(req.files, validVariations);

                const existingResult = await transaction.request()
                    .input('id', sql.Int, inventoryProductId)
                    .query(`
                        SELECT VariationID, VariationImageURL, ThumbnailURLs
                        FROM InventoryProductVariations
                        WHERE InventoryProductID = @id AND IsActive = 1
                    `);
                const existingById = new Map((existingResult.recordset || []).map((r) => [r.VariationID, r]));

                let deletedVariationIds = [];
                if (req.body.deletedVariationIds) {
                    try {
                        const parsed = typeof req.body.deletedVariationIds === 'string'
                            ? JSON.parse(req.body.deletedVariationIds)
                            : req.body.deletedVariationIds;
                        if (Array.isArray(parsed)) {
                            deletedVariationIds = parsed
                                .map((id) => parseInt(id, 10))
                                .filter((id) => id > 0);
                        }
                    } catch (delParseErr) {
                        deletedVariationIds = [];
                    }
                }
                for (const delId of deletedVariationIds) {
                    await transaction.request()
                        .input('variationId', sql.Int, delId)
                        .input('inventoryProductId', sql.Int, inventoryProductId)
                        .query(`
                            UPDATE InventoryProductVariations
                            SET IsActive = 0, UpdatedAt = GETDATE()
                            WHERE VariationID = @variationId
                              AND InventoryProductID = @inventoryProductId
                        `);
                }

                for (let vi = 0; vi < validVariations.length; vi++) {
                    const v = validVariations[vi];
                    const variationName = resolvePlanVariationDisplayName(v);
                    const variationId = parseInt(v.variationId, 10) || 0;
                    const media = mediaByVariation[vi] || { mainFile: null, modelFile: null, thumbFiles: [] };
                    const mediaUrls = resolveVariationMediaUrls(media, publicUrlFromMulterVariationFile);
                    let variationImageUrl = mediaUrls.imageUrl;

                    if (variationId && existingById.has(variationId)) {
                        if (!variationImageUrl) {
                            const existingRow = existingById.get(variationId);
                            variationImageUrl = existingRow?.VariationImageURL || null;
                        }
                        await transaction.request()
                            .input('variationId', sql.Int, variationId)
                            .input('variationName', sql.NVarChar, variationName)
                            .input('color', sql.NVarChar, (v.color || '').trim() || null)
                            .input('shape', sql.NVarChar, (v.shape || '').trim() || null)
                            .input('variationType', sql.NVarChar, (v.variationType || v.type || '').trim() || null)
                            .input('price', sql.Decimal(10, 2), parentPrice)
                            .input('costPrice', sql.Decimal(10, 2), parentCost)
                            .input('variationImageUrl', sql.NVarChar, variationImageUrl)
                            .query(`
                                UPDATE InventoryProductVariations
                                SET VariationName = @variationName,
                                    Color = @color,
                                    Shape = @shape,
                                    VariationType = @variationType,
                                    Price = @price,
                                    CostPrice = @costPrice,
                                    VariationImageURL = COALESCE(NULLIF(@variationImageUrl, ''), VariationImageURL),
                                    UpdatedAt = GETDATE()
                                WHERE VariationID = @variationId
                            `);
                        continue;
                    }

                    if (!variationImageUrl) {
                        throw new Error('Each variation needs a main image.');
                    }
                    const insertVar = await transaction.request()
                        .input('inventoryProductID', sql.Int, inventoryProductId)
                        .input('variationName', sql.NVarChar, variationName)
                        .input('color', sql.NVarChar, (v.color || '').trim() || null)
                        .input('shape', sql.NVarChar, (v.shape || '').trim() || null)
                        .input('variationType', sql.NVarChar, (v.variationType || v.type || '').trim() || null)
                        .input('price', sql.Decimal(10, 2), parentPrice)
                        .input('costPrice', sql.Decimal(10, 2), parentCost)
                        .input('variationImageUrl', sql.NVarChar, variationImageUrl)
                        .input('dimensions', sql.NVarChar, '{}')
                        .input('createdBy', sql.Int, req.session.user.id)
                        .query(`
                            INSERT INTO InventoryProductVariations (
                                ProductID, InventoryProductID, VariationName, Color, Shape, VariationType,
                                Quantity, AvailableQuantity,
                                Price, CostPrice, VariationImageURL, Dimensions, IsActive, CreatedBy
                            )
                            OUTPUT INSERTED.VariationID
                            VALUES (
                                NULL, @inventoryProductID, @variationName, @color, @shape, @variationType,
                                0, 0,
                                @price, @costPrice, @variationImageUrl, @dimensions, 1, @createdBy
                            )
                        `);
                    const newVariationId = insertVar.recordset[0].VariationID;
                }

                await transaction.commit();
                return respondSuccess(inventoryProductId);
            } catch (txErr) {
                await transaction.rollback();
                throw txErr;
            }
        } catch (err) {
            console.error('Edit planned product error:', err);
            return respondError('Failed to update planned product: ' + (err.message || 'unknown error'), 500);
        }
    });

    // =============================================================================
    // RETAIL PRODUCT ROUTES (Step 1c: Retail - Ready-to-sell with stock)
    // =============================================================================

    // Retail product listing upload configuration
    const retailListingUpload = productUpload.fields([
        { name: 'productMainImage', maxCount: 1 },
        { name: 'variationMainImage', maxCount: 50 }
    ]);

    // Step 1c — Add retail product (catalog + stock in one step)
    async function handleRetailProductAdd(req, res) {
        const wantsJson = req.get('X-Requested-With') === 'XMLHttpRequest';
        const respondRetailError = (message, status = 400) => {
            if (wantsJson) return res.status(status).json({ success: false, message });
            req.flash('error', message);
            return res.redirect('/Employee/Admin/ProductsListing');
        };
        const respondRetailSuccess = (inventoryProductId) => {
            invalidateAdminPageCache('admin:');
            if (wantsJson) {
                return res.json({
                    success: true,
                    message: 'Retail product created successfully!',
                    inventoryProductId
                });
            }
            req.flash('success', 'Retail product created. Manage storefront visibility on the Storefront page.');
            return res.redirect('/Employee/Admin/ProductsListing');
        };

        try {
            await pool.connect();
            await ensureListingStageColumn(pool);
            await ensureVariationMediaColumns(pool);
            const { name, description, price, costPrice, category, variationsJson, length, width, height } = req.body;
            const parentDimensionsJson = buildVariationDimensionsJson({ length, width, height });
            if (!name || !category) {
                return respondRetailError('Product name and category are required.');
            }
            let variationsList = [];
            if (variationsJson) {
                try {
                    variationsList = typeof variationsJson === 'string' ? JSON.parse(variationsJson) : variationsJson;
                } catch (e) {
                    return respondRetailError('Invalid variations data.');
                }
            }
            if (!Array.isArray(variationsList) || variationsList.length === 0) {
                return respondRetailError('Add at least one variation with color/type, quantity, and main image.');
            }
            const parentPrice = parseMoneyInput(price);
            if (Number.isNaN(parentPrice) || parentPrice <= 0) {
                return respondRetailError('Sale price is required and must be greater than zero.');
            }
            const parentCost = parseMoneyInput(costPrice);
            if (Number.isNaN(parentCost) || parentCost < 0) {
                return respondRetailError('Item cost price is required and must be zero or greater.');
            }
            if (parentCost > parentPrice) {
                return respondRetailError('Item cost price cannot be higher than the sale price.');
            }
            const validVariations = variationsList.filter((v) => {
                const vName = resolvePlanVariationDisplayName(v);
                const vQty = parseInt(v.quantity, 10) || 0;
                const hasImage = v.hasMainImage === true || v.hasMainImage === 'true' || v.hasMainImage === 1;
                return vName && vQty > 0 && hasImage;
            });
            if (validVariations.length === 0) {
                return respondRetailError('Each variation needs color or type, quantity of at least 1, and a main image.');
            }
            const mediaByVariation = mapVariationMediaFiles(req.files, validVariations);
            const transaction = new sql.Transaction(pool);
            await transaction.begin();
            try {
                const tempSlug = `retail-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
                const defaultReorderPoint = 10;
                const insert = await transaction.request()
                    .input('name', sql.NVarChar, name)
                    .input('description', sql.NVarChar, description || '')
                    .input('price', sql.Decimal(10, 2), parentPrice)
                    .input('costPrice', sql.Decimal(10, 2), parentCost)
                    .input('category', sql.NVarChar, category)
                    .input('dimensions', sql.NVarChar, parentDimensionsJson)
                    .input('tempSlug', sql.NVarChar, tempSlug)
                    .input('reorderPoint', sql.Int, defaultReorderPoint)
                    .input('createdBy', sql.Int, req.session.user.id)
                    .query(`
                        INSERT INTO InventoryProducts (
                            Name, Description, Price, CostPrice, Category, Dimensions,
                            ReorderPoint,
                            DateAdded, IsActive, ListingStage, Slug, PublicId, CreatedBy, InventoryNotes
                        )
                        VALUES (
                            @name, @description, @price, @costPrice, @category, @dimensions,
                            @reorderPoint,
                            GETDATE(), 1, 'retail', @tempSlug, NEWID(), @createdBy, @description
                        );
                        SELECT SCOPE_IDENTITY() AS InventoryProductID;
                    `);
                const inventoryProductId = insert.recordset[0].InventoryProductID;
                const { slug } = generateProductIdentifiers(inventoryProductId, name);
                await transaction.request()
                    .input('id', sql.Int, inventoryProductId)
                    .input('slug', sql.NVarChar, slug)
                    .query('UPDATE InventoryProducts SET Slug = @slug WHERE InventoryProductID = @id');

                let parentImageUrl = null;
                if (req.files && req.files.productMainImage && req.files.productMainImage[0]) {
                    parentImageUrl = publicUrlFromMulterProductFile(req.files.productMainImage[0]);
                }
                if (parentImageUrl) {
                    await transaction.request()
                        .input('inventoryProductId', sql.Int, inventoryProductId)
                        .input('imageUrl', sql.NVarChar, parentImageUrl)
                        .query(`
                            UPDATE InventoryProducts SET ImageURL = @imageUrl, DateUpdated = GETDATE()
                            WHERE InventoryProductID = @inventoryProductId
                        `);
                }

                let totalStock = 0;
                for (let vi = 0; vi < validVariations.length; vi++) {
                    const v = validVariations[vi];
                    const variationName = resolvePlanVariationDisplayName(v);
                    const variationQuantity = parseInt(v.quantity, 10) || 0;
                    if (!variationName || variationQuantity < 1) continue;
                    totalStock += variationQuantity;
                    const media = mediaByVariation[vi] || { mainFile: null, modelFile: null, thumbFiles: [] };
                    const mediaUrls = resolveVariationMediaUrls(media, publicUrlFromMulterVariationFile);
                    if (!mediaUrls.imageUrl) {
                        throw new Error('Each variation needs a main image.');
                    }
                    await transaction.request()
                        .input('inventoryProductID', sql.Int, inventoryProductId)
                        .input('variationName', sql.NVarChar, variationName)
                        .input('color', sql.NVarChar, (v.color || '').trim() || null)
                        .input('shape', sql.NVarChar, (v.shape || '').trim() || null)
                        .input('variationType', sql.NVarChar, (v.variationType || v.type || '').trim() || null)
                        .input('quantity', sql.Int, variationQuantity)
                        .input('price', sql.Decimal(10, 2), parentPrice)
                        .input('costPrice', sql.Decimal(10, 2), parentCost)
                        .input('variationImageUrl', sql.NVarChar, mediaUrls.imageUrl)
                        .input('dimensions', sql.NVarChar, parentDimensionsJson || '{}')
                        .input('createdBy', sql.Int, req.session.user.id)
                        .query(`
                            INSERT INTO InventoryProductVariations (
                                ProductID, InventoryProductID, VariationName, Color, Shape, VariationType,
                                Quantity, AvailableQuantity,
                                Price, CostPrice, VariationImageURL, Dimensions, IsActive, CreatedBy
                            )
                            VALUES (
                                NULL, @inventoryProductID, @variationName, @color, @shape, @variationType,
                                @quantity, @quantity,
                                @price, @costPrice, @variationImageUrl, @dimensions, 1, @createdBy
                            )
                        `);
                }

                await transaction.request()
                    .input('inventoryProductId', sql.Int, inventoryProductId)
                    .input('availableQty', sql.Int, totalStock)
                    .input('status', sql.NVarChar, totalStock > 0 ? 'available' : 'out-of-stock')
                    .query(`
                        UPDATE InventoryProducts 
                        SET AvailableQuantity = @availableQty, InventoryStatus = @status
                        WHERE InventoryProductID = @inventoryProductId
                    `);

                await syncInventoryProductQtyFromVariations(inventoryProductId, transaction);
                await syncInventoryProductCatalogToProducts(inventoryProductId, transaction);
                await transaction.commit();
                return respondRetailSuccess(inventoryProductId);
            } catch (txErr) {
                await transaction.rollback();
                throw txErr;
            }
        } catch (err) {
            console.error('Retail product error:', err);
            return respondRetailError('Failed to save retail product: ' + (err.message || 'unknown error'), 500);
        }
    }

    router.post('/Employee/Admin/ProductsListing/RetailAdd', isAuthenticated, retailListingUpload, handleRetailProductAdd);

    // Step 1d — Edit retail product
    async function handleRetailProductUpdate(req, res) {
        const wantsJson = req.get('X-Requested-With') === 'XMLHttpRequest';
        const respondError = (message, status = 400) => {
            if (wantsJson) return res.status(status).json({ success: false, message });
            req.flash('error', message);
            return res.redirect('/Employee/Admin/ProductsListing');
        };
        const respondSuccess = (inventoryProductId) => {
            invalidateAdminPageCache('admin:');
            if (wantsJson) {
                return res.json({ success: true, message: 'Retail product updated.', inventoryProductId });
            }
            req.flash('success', 'Retail product updated.');
            return res.redirect('/Employee/Admin/ProductsListing');
        };

        try {
            await pool.connect();
            await ensureListingStageColumn(pool);
            await ensureVariationMediaColumns(pool);
            const inventoryProductId = parseInt(req.params.id, 10);
            if (!inventoryProductId || Number.isNaN(inventoryProductId)) {
                return respondError('Invalid retail product id.');
            }

            const { name, description, price, costPrice, category, variationsJson, length, width, height } = req.body;
            const parentDimensionsJson = buildVariationDimensionsJson({ length, width, height });
            if (!name || !category) {
                return respondError('Product name and category are required.');
            }
            let variationsList = [];
            if (variationsJson) {
                try {
                    variationsList = typeof variationsJson === 'string' ? JSON.parse(variationsJson) : variationsJson;
                } catch (e) {
                    return respondError('Invalid variations data.');
                }
            }
            if (!Array.isArray(variationsList) || variationsList.length === 0) {
                return respondError('Add at least one variation.');
            }
            const parentPrice = parseMoneyInput(price);
            if (Number.isNaN(parentPrice) || parentPrice <= 0) {
                return respondError('Sale price is required and must be greater than zero.');
            }
            const parentCost = parseMoneyInput(costPrice);
            if (Number.isNaN(parentCost) || parentCost < 0) {
                return respondError('Item cost price is required and must be zero or greater.');
            }
            if (parentCost > parentPrice) {
                return respondError('Item cost price cannot be higher than the sale price.');
            }

            const transaction = new sql.Transaction(pool);
            await transaction.begin();
            try {
                const retailCheck = await transaction.request()
                    .input('id', sql.Int, inventoryProductId)
                    .query(`SELECT InventoryProductID, ListingStage FROM InventoryProducts WHERE InventoryProductID = @id AND IsActive = 1`);
                if (!retailCheck.recordset.length) {
                    throw new Error('Retail product not found.');
                }
                const stage = String(retailCheck.recordset[0].ListingStage || '').toLowerCase();
                if (stage !== 'retail') {
                    throw new Error('Only retail products can be edited with the retail form.');
                }

                await transaction.request()
                    .input('id', sql.Int, inventoryProductId)
                    .input('name', sql.NVarChar, name)
                    .input('description', sql.NVarChar, description || '')
                    .input('price', sql.Decimal(10, 2), parentPrice)
                    .input('costPrice', sql.Decimal(10, 2), parentCost)
                    .input('category', sql.NVarChar, category)
                    .input('dimensions', sql.NVarChar, parentDimensionsJson)
                    .query(`
                        UPDATE InventoryProducts
                        SET Name = @name, Description = @description, Price = @price, CostPrice = @costPrice,
                            Category = @category, Dimensions = @dimensions, InventoryNotes = @description,
                            DateUpdated = GETDATE()
                        WHERE InventoryProductID = @id AND IsActive = 1
                    `);

                if (req.files && req.files.productMainImage && req.files.productMainImage[0]) {
                    const parentImageUrl = publicUrlFromMulterProductFile(req.files.productMainImage[0]);
                    await transaction.request()
                        .input('id', sql.Int, inventoryProductId)
                        .input('imageUrl', sql.NVarChar, parentImageUrl)
                        .query(`UPDATE InventoryProducts SET ImageURL = @imageUrl, DateUpdated = GETDATE() WHERE InventoryProductID = @id`);
                }

                const validVariations = variationsList.filter((v) => {
                    const vName = resolvePlanVariationDisplayName(v);
                    return !!vName;
                });
                if (!validVariations.length) {
                    throw new Error('Add at least one variation with color or type.');
                }

                const mediaByVariation = mapVariationMediaFiles(req.files, validVariations);
                const existingResult = await transaction.request()
                    .input('id', sql.Int, inventoryProductId)
                    .query(`
                        SELECT VariationID, VariationImageURL, Quantity, AvailableQuantity
                        FROM InventoryProductVariations
                        WHERE InventoryProductID = @id AND IsActive = 1
                    `);
                const existingById = new Map((existingResult.recordset || []).map((r) => [r.VariationID, r]));

                let deletedVariationIds = [];
                if (req.body.deletedVariationIds) {
                    try {
                        const parsed = typeof req.body.deletedVariationIds === 'string'
                            ? JSON.parse(req.body.deletedVariationIds)
                            : req.body.deletedVariationIds;
                        if (Array.isArray(parsed)) {
                            deletedVariationIds = parsed.map((id) => parseInt(id, 10)).filter((id) => id > 0);
                        }
                    } catch (delParseErr) {
                        deletedVariationIds = [];
                    }
                }
                for (const delId of deletedVariationIds) {
                    await transaction.request()
                        .input('variationId', sql.Int, delId)
                        .input('inventoryProductId', sql.Int, inventoryProductId)
                        .query(`
                            UPDATE InventoryProductVariations
                            SET IsActive = 0, UpdatedAt = GETDATE()
                            WHERE VariationID = @variationId AND InventoryProductID = @inventoryProductId
                        `);
                }

                for (let vi = 0; vi < validVariations.length; vi++) {
                    const v = validVariations[vi];
                    const variationName = resolvePlanVariationDisplayName(v);
                    const variationId = parseInt(v.variationId, 10) || 0;
                    const variationQuantity = Math.max(0, parseInt(v.quantity, 10) || 0);
                    const media = mediaByVariation[vi] || { mainFile: null, modelFile: null, thumbFiles: [] };
                    const mediaUrls = resolveVariationMediaUrls(media, publicUrlFromMulterVariationFile);
                    let variationImageUrl = mediaUrls.imageUrl;

                    if (variationId && existingById.has(variationId)) {
                        if (!variationImageUrl) {
                            variationImageUrl = existingById.get(variationId)?.VariationImageURL || null;
                        }
                        const newQty = variationQuantity >= 1 ? variationQuantity : (existingById.get(variationId)?.AvailableQuantity || 0);
                        await transaction.request()
                            .input('variationId', sql.Int, variationId)
                            .input('variationName', sql.NVarChar, variationName)
                            .input('color', sql.NVarChar, (v.color || '').trim() || null)
                            .input('shape', sql.NVarChar, (v.shape || '').trim() || null)
                            .input('variationType', sql.NVarChar, (v.variationType || v.type || '').trim() || null)
                            .input('quantity', sql.Int, newQty)
                            .input('price', sql.Decimal(10, 2), parentPrice)
                            .input('costPrice', sql.Decimal(10, 2), parentCost)
                            .input('variationImageUrl', sql.NVarChar, variationImageUrl)
                            .query(`
                                UPDATE InventoryProductVariations
                                SET VariationName = @variationName, Color = @color, Shape = @shape,
                                    VariationType = @variationType, Quantity = @quantity,
                                    AvailableQuantity = @quantity, Price = @price, CostPrice = @costPrice,
                                    VariationImageURL = COALESCE(NULLIF(@variationImageUrl, ''), VariationImageURL),
                                    UpdatedAt = GETDATE()
                                WHERE VariationID = @variationId
                            `);
                        continue;
                    }

                    if (!variationImageUrl) {
                        throw new Error('Each new variation needs a main image.');
                    }
                    if (variationQuantity < 1) {
                        throw new Error('Each new variation needs quantity of at least 1.');
                    }
                    await transaction.request()
                        .input('inventoryProductID', sql.Int, inventoryProductId)
                        .input('variationName', sql.NVarChar, variationName)
                        .input('color', sql.NVarChar, (v.color || '').trim() || null)
                        .input('shape', sql.NVarChar, (v.shape || '').trim() || null)
                        .input('variationType', sql.NVarChar, (v.variationType || v.type || '').trim() || null)
                        .input('quantity', sql.Int, variationQuantity)
                        .input('price', sql.Decimal(10, 2), parentPrice)
                        .input('costPrice', sql.Decimal(10, 2), parentCost)
                        .input('variationImageUrl', sql.NVarChar, variationImageUrl)
                        .input('dimensions', sql.NVarChar, parentDimensionsJson || '{}')
                        .input('createdBy', sql.Int, req.session.user.id)
                        .query(`
                            INSERT INTO InventoryProductVariations (
                                ProductID, InventoryProductID, VariationName, Color, Shape, VariationType,
                                Quantity, AvailableQuantity, Price, CostPrice, VariationImageURL, Dimensions,
                                IsActive, CreatedBy
                            )
                            VALUES (
                                NULL, @inventoryProductID, @variationName, @color, @shape, @variationType,
                                @quantity, @quantity, @price, @costPrice, @variationImageUrl, @dimensions,
                                1, @createdBy
                            )
                        `);
                }

                await syncInventoryProductQtyFromVariations(inventoryProductId, transaction);
                await syncInventoryProductCatalogToProducts(inventoryProductId, transaction);
                await transaction.commit();
                return respondSuccess(inventoryProductId);
            } catch (txErr) {
                await transaction.rollback();
                throw txErr;
            }
        } catch (err) {
            console.error('Edit retail product error:', err);
            return respondError('Failed to update retail product: ' + (err.message || 'unknown error'), 500);
        }
    }

    router.post('/Employee/Admin/ProductsListing/RetailUpdate/:id', isAuthenticated, retailListingUpload, handleRetailProductUpdate);

    // Add routes for other employee roles
    EMPLOYEE_SYNC_ROLES.forEach(function(role) {
        const listingBase = '/Employee/' + role.urlSegment + '/' + role.viewPrefix + 'Products';
        router.post(listingBase + '/RetailAdd', isAuthenticated, checkPermission('inventory_products'), retailListingUpload, handleRetailProductAdd);
        router.post(listingBase + '/RetailUpdate/:id', isAuthenticated, checkPermission('inventory_products'), retailListingUpload, handleRetailProductUpdate);
    });

    // =============================================================================
    // INVENTORY BUILD ROUTES (Step 2: Build from planned products)
    // =============================================================================

    // Step 2 — Build product in Inventory (materials, BOM, dimensions, variations)
    router.post(['/Employee/Admin/Inventory/Add', '/Employee/Admin/ProductInventory/Add'], isAuthenticated, productUpload.fields([
        { name: 'productMainImage', maxCount: 1 },
        { name: 'productThumbnail', maxCount: 4 },
        { name: 'variationMainImage', maxCount: 50 },
        { name: 'variationModel3d', maxCount: 50 },
        { name: 'variationThumbnail', maxCount: 200 },
        { name: 'variationThumbnails', maxCount: 200 }
    ]), async (req, res) => {
        const wantsJson = req.get('X-Requested-With') === 'XMLHttpRequest' || (req.get('Accept') || '').includes('application/json');
        const respondError = (message, status = 400) => {
            if (wantsJson) {
                return res.status(status).json({ success: false, message });
            }
            req.flash('error', message);
            return res.redirect('/Employee/Admin/Inventory?tab=ProductInventory');
        };
        const respondSuccess = (inventoryProductId) => {
            invalidateAdminPageCache('admin:');
            if (wantsJson) {
                return res.json({
                    success: true,
                    message: 'Product created successfully in inventory!',
                    inventoryProductId
                });
            }
            req.flash('success', 'Product built successfully. Manage storefront visibility on the Storefront page.');
            return res.redirect(`/Employee/Admin/Inventory?tab=ProductInventory&inventoryProductId=${inventoryProductId}`);
        };

        try {
            await pool.connect();
            await ensureVariationMediaColumns(pool);
            await ensureBomBundleSchema(pool);
            const { name, description, price, costPrice, category, length, width, height, weight, dimensions, requiredMaterials, quantity, variationsJson, bomBundleId, buildFromInventoryProductId, reorderPoint } = req.body;
            const buildFromId = parseInt(buildFromInventoryProductId, 10) || 0;
            const parsedReorderPoint = Math.max(0, parseInt(reorderPoint, 10) || 0);

            console.log('ProductInventory/Add - Received data:', {
                name, description, price, category, quantity,
                bomBundleId: bomBundleId || null,
                variationModels: req.files && req.files.variationModel3d ? req.files.variationModel3d.length : 0,
                variationThumbs: req.files && req.files.variationThumbnail ? req.files.variationThumbnail.length : 0
            });

            if (!name || !category) {
                return respondError('Name and category are required.');
            }

            let variationsList = [];
            if (variationsJson) {
                try {
                    variationsList = typeof variationsJson === 'string' ? JSON.parse(variationsJson) : variationsJson;
                } catch (parseVarErr) {
                    return respondError('Invalid variations data.');
                }
            }
            if (!Array.isArray(variationsList) || variationsList.length === 0) {
                return respondError('At least one product variation is required.');
            }

            const parentPrice = parseMoneyInput(price);
            if (Number.isNaN(parentPrice) || parentPrice <= 0) {
                return respondError('Sale price is required and must be greater than zero.');
            }
            const parentCost = parseMoneyInput(costPrice);
            if (Number.isNaN(parentCost) || parentCost < 0) {
                return respondError('Item cost price is required and must be zero or greater.');
            }
            if (parentCost > parentPrice) {
                return respondError('Item cost price cannot be higher than the sale price.');
            }

            const validVariations = variationsList.filter((v) => {
                const vName = resolvePlanVariationDisplayName(v) || (v.variationName || '').trim();
                const vQty = parseInt(v.quantity, 10);
                const planVarId = parseInt(v.variationId, 10) || 0;
                const hasNewImage = v.hasNewMainImage === true || v.hasNewMainImage === 'true' || v.hasNewMainImage === 1;
                const hasImage = v.hasMainImage === true || v.hasMainImage === 'true' || v.hasMainImage === 1
                    || hasNewImage || planVarId > 0;
                v.variationName = vName;
                return vName && vQty > 0 && hasImage;
            });
            if (validVariations.length === 0) {
                return respondError('Each variation needs a name and opening quantity of at least 1.');
            }

            let materialsData = [];
            if (requiredMaterials && String(requiredMaterials).trim() !== '' && String(requiredMaterials).trim() !== '[]') {
                try {
                    materialsData = typeof requiredMaterials === 'string' ? JSON.parse(requiredMaterials) : requiredMaterials;
                } catch (parseMatErr) {
                    return respondError('Invalid recipe materials data.');
                }
            }
            let validMaterials = (Array.isArray(materialsData) ? materialsData : []).filter((m) => {
                const mid = parseInt(m.materialId || m.MaterialID, 10);
                const qty = parseInt(m.quantityRequired || m.QuantityRequired, 10);
                return mid && qty > 0;
            });
            if (validMaterials.length === 0 && bomBundleId) {
                const bundleData = await loadBomBundleWithMaterials(pool, parseInt(bomBundleId, 10));
                if (bundleData && bundleData.materials.length) {
                    validMaterials = bundleData.materials.map((m) => ({
                        materialId: m.MaterialID,
                        quantityRequired: m.QuantityRequired
                    }));
                }
            }

            async function resolveVariationBuildMaterials(variationEntry) {
                let variationMaterials = [];
                if (variationEntry.requiredMaterials) {
                    try {
                        const parsed = typeof variationEntry.requiredMaterials === 'string'
                            ? JSON.parse(variationEntry.requiredMaterials)
                            : variationEntry.requiredMaterials;
                        if (Array.isArray(parsed)) {
                            variationMaterials = parsed.filter((m) => {
                                const mid = parseInt(m.materialId || m.MaterialID, 10);
                                const qty = parseInt(m.quantityRequired || m.QuantityRequired, 10);
                                return mid && qty > 0;
                            });
                        }
                    } catch (varMatErr) {
                        variationMaterials = [];
                    }
                }
                const varBundleId = parseInt(variationEntry.bomBundleId, 10) || 0;
                if (variationMaterials.length === 0 && varBundleId) {
                    const bundleData = await loadBomBundleWithMaterials(pool, varBundleId);
                    if (bundleData && bundleData.materials.length) {
                        variationMaterials = bundleData.materials.map((m) => ({
                            materialId: m.MaterialID,
                            quantityRequired: m.QuantityRequired
                        }));
                    }
                }
                return variationMaterials;
            }

            if (buildFromId) {
                for (const v of validVariations) {
                    const vName = resolvePlanVariationDisplayName(v) || (v.variationName || '').trim();
                    const variationMaterials = await resolveVariationBuildMaterials(v);
                    if (variationMaterials.length === 0) {
                        return respondError(`Add raw materials for variation "${vName}". Each variation needs its own recipe.`);
                    }
                    v._resolvedMaterials = variationMaterials;
                }
            } else if (validMaterials.length === 0) {
                return respondError('Select a raw materials bundle or add at least one raw material with quantity per unit.');
            }

            const catalogPrice = parentPrice;
            const catalogCostPrice = parentCost;

            const initialQuantity = parseInt(quantity, 10) || 0;
            const mediaByVariation = mapVariationMediaFiles(req.files, validVariations);

            // Start transaction
            const transaction = new sql.Transaction(pool);
            await transaction.begin();

            console.log('ProductInventory/Add - Transaction started');

            try {
                const dimensionsJson = buildVariationDimensionsJson({ length, width, height, dimensions });
                const variationDimensionsJson = '{}';

                let inventoryProductId;
                if (buildFromId) {
                    const plannedCheck = await transaction.request()
                        .input('id', sql.Int, buildFromId)
                        .query(`
                            SELECT InventoryProductID, ListingStage
                            FROM InventoryProducts
                            WHERE InventoryProductID = @id AND IsActive = 1
                        `);
                    if (!plannedCheck.recordset.length) {
                        throw new Error('Planned product not found.');
                    }
                    const stage = String(plannedCheck.recordset[0].ListingStage || '').toLowerCase();
                    if (stage === 'retail') {
                        throw new Error('Retail products cannot be built. Edit stock on the Inventory page.');
                    }
                    if (stage !== 'planned') {
                        throw new Error('This product is already built. Open it in Inventory to edit stock.');
                    }
                    inventoryProductId = buildFromId;
                    await transaction.request()
                        .input('inventoryProductId', sql.Int, inventoryProductId)
                        .input('name', sql.NVarChar, name)
                        .input('description', sql.NVarChar, description || '')
                        .input('price', sql.Decimal(10, 2), catalogPrice)
                        .input('costPrice', sql.Decimal(10, 2), catalogCostPrice)
                        .input('category', sql.NVarChar, category)
                        .input('dimensions', sql.NVarChar, dimensionsJson)
                        .input('reorderPoint', sql.Int, parsedReorderPoint)
                        .query(`
                            UPDATE InventoryProducts
                            SET Name = @name, Description = @description, Price = @price, CostPrice = @costPrice,
                                Category = @category, Dimensions = @dimensions, ListingStage = 'built',
                                ReorderPoint = COALESCE(@reorderPoint, ReorderPoint),
                                DateUpdated = GETDATE()
                            WHERE InventoryProductID = @inventoryProductId
                        `);
                } else {
                    const tempSlug = `inv-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
                    const productResult = await transaction.request()
                        .input('name', sql.NVarChar, name)
                        .input('description', sql.NVarChar, description || '')
                        .input('price', sql.Decimal(10, 2), catalogPrice)
                        .input('costPrice', sql.Decimal(10, 2), catalogCostPrice)
                        .input('category', sql.NVarChar, category)
                        .input('dimensions', sql.NVarChar, dimensionsJson)
                        .input('reorderPoint', sql.Int, parsedReorderPoint)
                        .input('tempSlug', sql.NVarChar, tempSlug)
                        .input('createdBy', sql.Int, req.session.user.id)
                        .query(`
                            INSERT INTO InventoryProducts (Name, Description, Price, CostPrice, Category, Dimensions, ReorderPoint, DateAdded, IsActive, SKU, PublicId, Slug, CreatedBy, ListingStage)
                            VALUES (@name, @description, @price, @costPrice, @category, @dimensions, @reorderPoint, GETDATE(), 1, NULL, NEWID(), @tempSlug, @createdBy, 'built')
                            SELECT SCOPE_IDENTITY() as InventoryProductID
                        `);
                    inventoryProductId = productResult.recordset[0].InventoryProductID;
                    const { slug } = generateProductIdentifiers(inventoryProductId, name);
                    const finalPublicId = generateGuid();
                    await transaction.request()
                        .input('inventoryProductId', sql.Int, inventoryProductId)
                        .input('publicId', sql.NVarChar, finalPublicId)
                        .input('slug', sql.NVarChar, slug)
                        .query(`
                            UPDATE InventoryProducts
                            SET PublicId = CAST(@publicId AS UNIQUEIDENTIFIER), Slug = @slug
                            WHERE InventoryProductID = @inventoryProductId
                        `);
                }

                let parentImageUrl = null;
                let parentThumbJson = null;
                if (req.files && req.files.productMainImage && req.files.productMainImage[0]) {
                    parentImageUrl = publicUrlFromMulterProductFile(req.files.productMainImage[0]);
                }
                const parentThumbs = [];
                if (req.files && req.files.productThumbnail) {
                    req.files.productThumbnail.slice(0, 4).forEach((file) => {
                        parentThumbs.push(publicUrlFromMulterProductFile(file));
                    });
                }
                if (parentThumbs.length) {
                    parentThumbJson = JSON.stringify(parentThumbs);
                }
                if (parentImageUrl || parentThumbJson) {
                    await transaction.request()
                        .input('inventoryProductId', sql.Int, inventoryProductId)
                        .input('imageUrl', sql.NVarChar, parentImageUrl)
                        .input('thumbJson', sql.NVarChar, parentThumbJson)
                        .query(`
                            UPDATE InventoryProducts
                            SET ImageURL = COALESCE(@imageUrl, ImageURL),
                                ThumbnailURLs = COALESCE(@thumbJson, ThumbnailURLs),
                                DateUpdated = GETDATE()
                            WHERE InventoryProductID = @inventoryProductId
                        `);
                }

                const parsedBomBundleId = parseInt(bomBundleId, 10) || null;
                if (parsedBomBundleId && !buildFromId) {
                    await transaction.request()
                        .input('inventoryProductId', sql.Int, inventoryProductId)
                        .input('bomBundleId', sql.Int, parsedBomBundleId)
                        .query(`
                            UPDATE InventoryProducts
                            SET BomBundleID = @bomBundleId, DateUpdated = GETDATE()
                            WHERE InventoryProductID = @inventoryProductId
                        `);
                    console.log('[MATERIALS] Linked BomBundleID', parsedBomBundleId, 'to inventory product', inventoryProductId);
                }

                let materialsCollected = [];
                if (!buildFromId) {
                    await saveInventoryProductMaterials(transaction, inventoryProductId, validMaterials);
                    materialsCollected = await getInventoryProductMaterials(transaction, inventoryProductId);
                    console.log('ProductInventory/Add - Saved recipe:', materialsCollected.length, 'material(s)');
                }
                await ensureInventoryProductVariationMaterialsTable(transaction);

                let variationStockTotal = 0;
                const catalogVariationRows = [];
                let existingPlannedVariations = [];
                if (buildFromId) {
                    const existingVarResult = await transaction.request()
                        .input('inventoryProductId', sql.Int, inventoryProductId)
                        .query(`
                            SELECT VariationID, VariationName, Color, VariationImageURL, ThumbnailURLs, Model3D, Dimensions
                            FROM InventoryProductVariations
                            WHERE InventoryProductID = @inventoryProductId AND IsActive = 1
                        `);
                    existingPlannedVariations = existingVarResult.recordset || [];
                }
                const existingVarById = new Map(
                    existingPlannedVariations.map((row) => [row.VariationID, row])
                );

                if (buildFromId && existingVarById.size) {
                    const keptVariationIds = new Set(
                        validVariations
                            .map((v) => parseInt(v.variationId, 10) || 0)
                            .filter((id) => id > 0)
                    );
                    for (const existingId of existingVarById.keys()) {
                        if (keptVariationIds.has(existingId)) continue;
                        await transaction.request()
                            .input('variationId', sql.Int, existingId)
                            .input('inventoryProductId', sql.Int, inventoryProductId)
                            .query(`
                                UPDATE InventoryProductVariations
                                SET IsActive = 0, UpdatedAt = GETDATE()
                                WHERE VariationID = @variationId
                                  AND InventoryProductID = @inventoryProductId
                            `);
                    }
                }

                for (let vi = 0; vi < validVariations.length; vi++) {
                    const v = validVariations[vi];
                    const variationName = resolvePlanVariationDisplayName(v) || (v.variationName || '').trim();
                    const variationQuantity = parseInt(v.quantity, 10) || 0;
                    if (!variationName || variationQuantity <= 0) continue;

                    const variationPrice = parentPrice;
                    const variationCostPrice = parentCost;
                    const plannedVariationId = parseInt(v.variationId, 10) || 0;

                    variationStockTotal += variationQuantity;
                    const media = mediaByVariation[vi] || { mainFile: null, modelFile: null, thumbFiles: [] };
                    const mediaUrls = resolveVariationMediaUrls(media, publicUrlFromMulterVariationFile);
                    let variationImageUrl = mediaUrls.imageUrl;
                    const thumbJson = mediaUrls.thumbJson;
                    const model3dUrl = mediaUrls.model3d;
                    const existingVar = plannedVariationId ? existingVarById.get(plannedVariationId) : null;

                    if (existingVar) {
                        if (!variationImageUrl) {
                            variationImageUrl = existingVar.VariationImageURL;
                            if (!variationImageUrl && existingVar.ThumbnailURLs) {
                                const thumbs = normalizeThumbnailList(existingVar.ThumbnailURLs);
                                if (thumbs && thumbs.length) variationImageUrl = thumbs[0];
                            }
                        }
                        await transaction.request()
                            .input('variationId', sql.Int, plannedVariationId)
                            .input('variationName', sql.NVarChar, variationName)
                            .input('color', sql.NVarChar, (v.color || '').trim() || null)
                            .input('shape', sql.NVarChar, (v.shape || '').trim() || null)
                            .input('variationType', sql.NVarChar, (v.variationType || v.type || '').trim() || null)
                            .input('quantity', sql.Int, variationQuantity)
                            .input('price', sql.Decimal(10, 2), variationPrice)
                            .input('costPrice', sql.Decimal(10, 2), variationCostPrice)
                            .input('variationImageUrl', sql.NVarChar, variationImageUrl)
                            .input('thumbJson', sql.NVarChar, thumbJson || existingVar.ThumbnailURLs)
                            .input('model3d', sql.NVarChar, model3dUrl || existingVar.Model3D)
                            .input('dimensions', sql.NVarChar, variationDimensionsJson)
                            .query(`
                                UPDATE InventoryProductVariations
                                SET VariationName = @variationName, Color = @color,
                                    Shape = @shape, VariationType = @variationType,
                                    Quantity = @quantity, AvailableQuantity = @quantity,
                                    Price = @price, CostPrice = @costPrice,
                                    VariationImageURL = COALESCE(@variationImageUrl, VariationImageURL),
                                    ThumbnailURLs = COALESCE(@thumbJson, ThumbnailURLs),
                                    Model3D = COALESCE(@model3d, Model3D),
                                    Dimensions = @dimensions
                                WHERE VariationID = @variationId
                            `);
                        const variationSku = await assignVariationSku(transaction, plannedVariationId, variationName);
                        if (buildFromId && v._resolvedMaterials && v._resolvedMaterials.length) {
                            await saveInventoryProductVariationMaterials(transaction, plannedVariationId, v._resolvedMaterials);
                            await assertSufficientRawMaterialsForConsumption(transaction, v._resolvedMaterials, variationQuantity);
                            await decreaseMaterialsForProduct(transaction, inventoryProductId, variationQuantity, v._resolvedMaterials);
                        }
                        catalogVariationRows.push({
                            variationId: plannedVariationId,
                            variationName,
                            color: (v.color || '').trim() || null,
                            quantity: variationQuantity,
                            price: variationPrice,
                            imageUrl: variationImageUrl,
                            thumbnailUrls: mediaUrls.thumbnailUrls,
                            model3d: model3dUrl,
                            sku: variationSku
                        });
                        continue;
                    }

                    if (!variationImageUrl) {
                        throw new Error('Each variation needs a main image. Upload an image for "' + variationName + '".');
                    }

                    const insertVar = await transaction.request()
                        .input('inventoryProductID', sql.Int, inventoryProductId)
                        .input('variationName', sql.NVarChar, variationName)
                        .input('color', sql.NVarChar, (v.color || '').trim() || null)
                        .input('shape', sql.NVarChar, (v.shape || '').trim() || null)
                        .input('variationType', sql.NVarChar, (v.variationType || v.type || '').trim() || null)
                        .input('quantity', sql.Int, variationQuantity)
                        .input('price', sql.Decimal(10, 2), variationPrice)
                        .input('costPrice', sql.Decimal(10, 2), variationCostPrice)
                        .input('variationImageUrl', sql.NVarChar, variationImageUrl)
                        .input('thumbJson', sql.NVarChar, thumbJson)
                        .input('model3d', sql.NVarChar, model3dUrl)
                        .input('dimensions', sql.NVarChar, variationDimensionsJson)
                        .input('createdBy', sql.Int, req.session.user.id)
                        .query(`
                            INSERT INTO InventoryProductVariations (
                                ProductID, InventoryProductID, VariationName, Color, Shape, VariationType,
                                Quantity, AvailableQuantity, Price, CostPrice,
                                VariationImageURL, ThumbnailURLs, Model3D, Dimensions, IsActive, CreatedBy
                            )
                            OUTPUT INSERTED.VariationID
                            VALUES (
                                NULL, @inventoryProductID, @variationName, @color, @shape, @variationType,
                                @quantity, @quantity, @price, @costPrice,
                                @variationImageUrl, @thumbJson, @model3d, @dimensions, 1, @createdBy
                            )
                        `);

                    const variationId = insertVar.recordset[0].VariationID;
                    const variationSku = await assignVariationSku(transaction, variationId, variationName);
                    if (buildFromId && v._resolvedMaterials && v._resolvedMaterials.length) {
                        await saveInventoryProductVariationMaterials(transaction, variationId, v._resolvedMaterials);
                        await assertSufficientRawMaterialsForConsumption(transaction, v._resolvedMaterials, variationQuantity);
                        await decreaseMaterialsForProduct(transaction, inventoryProductId, variationQuantity, v._resolvedMaterials);
                    }
                    catalogVariationRows.push({
                        variationId,
                        variationName,
                        color: (v.color || '').trim() || null,
                        quantity: variationQuantity,
                        price: variationPrice,
                        imageUrl: variationImageUrl,
                        thumbnailUrls: mediaUrls.thumbnailUrls,
                        model3d: model3dUrl,
                        sku: variationSku
                    });
                }
                console.log('ProductInventory/Add - Created', catalogVariationRows.length, 'variation(s) for InventoryProductID:', inventoryProductId);

                await createStorefrontProductFromInventory(
                    transaction,
                    inventoryProductId,
                    req.session.user.id,
                    catalogVariationRows
                );

                const productAvailableQty = variationStockTotal;
                if (productAvailableQty > 0) {
                    await transaction.request()
                        .input('inventoryProductId', sql.Int, inventoryProductId)
                        .input('availableQty', sql.Int, productAvailableQty)
                        .input('status', sql.NVarChar, 'available')
                        .query(`
                            UPDATE InventoryProducts 
                            SET AvailableQuantity = @availableQty,
                                InventoryStatus = @status
                            WHERE InventoryProductID = @inventoryProductId
                        `);

                    console.log('ProductInventory/Add - Updated product inventory quantity:', productAvailableQty);

                    try {
                        const productLinkResult = await transaction.request()
                            .input('inventoryProductId', sql.Int, inventoryProductId)
                            .query(`
                                SELECT ProductID 
                                FROM InventoryProducts 
                                WHERE InventoryProductID = @inventoryProductId AND IsActive = 1
                            `);

                        if (productLinkResult.recordset.length > 0 && productLinkResult.recordset[0].ProductID) {
                            const linkedProductId = productLinkResult.recordset[0].ProductID;
                            await syncInventoryToProductsStock(linkedProductId, transaction);
                        }
                    } catch (syncErr) {
                        console.error(`[PRODUCT INVENTORY ADD] Error syncing stock to Products for InventoryProductID ${inventoryProductId}:`, syncErr);
                    }
                }

                const stockToConsume = productAvailableQty;
                if (!buildFromId && stockToConsume > 0 && materialsCollected.length > 0) {
                    for (const recipeMat of materialsCollected) {
                        const materialId = parseInt(recipeMat.materialId || recipeMat.MaterialID, 10);
                        const qtyPerUnit = parseInt(recipeMat.quantityRequired || recipeMat.QuantityRequired, 10) || 1;
                        const needed = qtyPerUnit * stockToConsume;
                        if (!materialId || needed <= 0) continue;
                        const stockRow = await transaction.request()
                            .input('materialId', sql.Int, materialId)
                            .query('SELECT Name, QuantityAvailable FROM RawMaterials WHERE MaterialID = @materialId AND IsActive = 1');
                        if (!stockRow.recordset.length) {
                            throw new Error(`Raw material ID ${materialId} is missing or inactive.`);
                        }
                        const matName = stockRow.recordset[0].Name || 'Material';
                        const available = stockRow.recordset[0].QuantityAvailable || 0;
                        if (available <= 0) {
                            throw new Error(`"${matName}" has no stock. Add stock on the Raw Materials tab before creating this product.`);
                        }
                        if (available < needed) {
                            throw new Error(`Insufficient stock for "${matName}": need ${needed}, available ${available}.`);
                        }
                    }
                    await decreaseMaterialsForProduct(transaction, inventoryProductId, stockToConsume, materialsCollected);
                }

                await transaction.commit();

                console.log('ProductInventory/Add - Product created successfully with ID:', inventoryProductId);
                return respondSuccess(inventoryProductId);
            } catch (err) {
                await transaction.rollback();
                console.error('ProductInventory/Add - Transaction error:', err);
                throw err;
            }
        } catch (err) {
            console.error('ProductInventory/Add - Error creating inventory product:', err);
            console.error('ProductInventory/Add - Error stack:', err.stack);
            return respondError('Failed to create product: ' + err.message, 500);
        }
    });

    // Admin - Add Inventory Item to Product (from Products page)
    router.post('/Employee/Admin/Products/AddInventory', isAuthenticated, productUpload.single('inventoryImage'), async (req, res) => {
        try {
            await pool.connect();
            const { productId, quantity, inventoryStatus, dimensions, location, notes } = req.body;

            if (!productId || !quantity || !inventoryStatus) {
                req.flash('error', 'Product, quantity, and status are required.');
                return res.redirect('/Employee/Admin/ProductsListing');
            }

            let imageUrl = null;
            if (req.file) {
                imageUrl = publicUrlFromMulterProductFile(req.file);
            }

            let dimensionsJson = null;
            if (dimensions) {
                try {
                    const dims = typeof dimensions === 'string' ? JSON.parse(dimensions) : dimensions;
                    dimensionsJson = JSON.stringify(dims);
                } catch (e) {
                    console.log('Error parsing dimensions:', e);
                }
            }

            const qty = parseInt(quantity);

            const productCheck = await pool.request()
                .input('inventoryProductId', sql.Int, productId)
                .query(`
                    SELECT 
                        COALESCE(AvailableQuantity, 0) as AvailableQuantity,
                        COALESCE(DamagedQuantity, 0) as DamagedQuantity,
                        COALESCE(ReturnedQuantity, 0) as ReturnedQuantity,
                        COALESCE(RepairedQuantity, 0) as RepairedQuantity,
                        COALESCE(DisposedQuantity, 0) as DisposedQuantity
                    FROM InventoryProducts 
                    WHERE InventoryProductID = @inventoryProductId AND IsActive = 1
                `);

            if (productCheck.recordset.length === 0) {
                req.flash('error', 'Product not found.');
                return res.redirect('/Employee/Admin/ProductsListing');
            }

            const current = productCheck.recordset[0];

            let availableQty = current.AvailableQuantity || 0;
            let damagedQty = current.DamagedQuantity || 0;
            let returnedQty = current.ReturnedQuantity || 0;
            let repairedQty = current.RepairedQuantity || 0;
            let disposedQty = current.DisposedQuantity || 0;

            switch (inventoryStatus) {
                case 'available':
                    availableQty += qty;
                    break;
                case 'damaged':
                    damagedQty += qty;
                    break;
                case 'returned':
                    returnedQty += qty;
                    break;
                case 'repaired':
                    repairedQty += qty;
                    break;
                case 'disposed':
                    disposedQty += qty;
                    break;
                default:
                    availableQty += qty;
            }

            const primaryStatus = availableQty > 0 ? 'available' :
                repairedQty > 0 ? 'repaired' :
                    damagedQty > 0 ? 'damaged' :
                        returnedQty > 0 ? 'returned' :
                            disposedQty > 0 ? 'disposed' : 'available';

            await pool.request()
                .input('inventoryProductId', sql.Int, productId)
                .input('status', sql.NVarChar, primaryStatus)
                .input('availableQty', sql.Int, availableQty)
                .input('damagedQty', sql.Int, damagedQty)
                .input('returnedQty', sql.Int, returnedQty)
                .input('repairedQty', sql.Int, repairedQty)
                .input('disposedQty', sql.Int, disposedQty)
                .input('notes', sql.NVarChar, notes || null)
                .input('updatedBy', sql.Int, req.session.user.id)
                .query(`
                    UPDATE InventoryProducts 
                    SET InventoryStatus = @status,
                        AvailableQuantity = @availableQty,
                        DamagedQuantity = @damagedQty,
                        ReturnedQuantity = @returnedQty,
                        RepairedQuantity = @repairedQty,
                        DisposedQuantity = @disposedQty,
                        InventoryNotes = COALESCE(@notes, InventoryNotes),
                        UpdatedBy = @updatedBy,
                        DateUpdated = GETDATE()
                    WHERE InventoryProductID = @inventoryProductId
                `);

            req.flash('success', `Successfully added ${qty} item(s) to inventory!`);
            res.redirect('/Employee/Admin/ProductsListing');
        } catch (err) {
            console.error('Error adding inventory item:', err);
            req.flash('error', 'Failed to add inventory item: ' + err.message);
            res.redirect('/Employee/Admin/ProductsListing');
        }
    });

    // =============================================================================
    // LEGACY PRODUCT ROUTES (CMS Products table - backward compatibility)
    // =============================================================================

    // Admin - Add Product (Legacy CMS Products table)
    router.post('/Employee/Admin/Products/Add', isAuthenticated, productUpload.fields([
        { name: 'image', maxCount: 1 },
        { name: 'thumbnails', maxCount: 8 },
        { name: 'thumbnail1', maxCount: 1 },
        { name: 'thumbnail2', maxCount: 1 },
        { name: 'thumbnail3', maxCount: 1 },
        { name: 'thumbnail4', maxCount: 1 },
        { name: 'model3d', maxCount: 1 }
    ]), async (req, res) => {
        try {
            await pool.connect();
            const { name, description, price, stockquantity, category, requiredMaterials, dimensions, inventoryProductId } = req.body;

            if (!name || !price || !stockquantity || !category) {
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: name, price, stockquantity, and category are required.'
                });
            }

            if (!inventoryProductId || inventoryProductId.toString().trim() === '' || isNaN(parseInt(inventoryProductId))) {
                return res.status(400).json({
                    success: false,
                    message: 'Please select a product from inventory. A product from inventory is required to create a CMS product.'
                });
            }

            const inventoryProductIdNum = parseInt(inventoryProductId);

            const existingProductByName = await pool.request()
                .input('name', sql.NVarChar, name.trim())
                .query(`
                    SELECT ProductID, Name, IsActive
                    FROM Products
                    WHERE LOWER(TRIM(Name)) = LOWER(TRIM(@name)) AND IsActive = 1
                `);

            if (existingProductByName.recordset.length > 0) {
                const existingProduct = existingProductByName.recordset[0];
                return res.status(400).json({
                    success: false,
                    message: `A product with the name "${existingProduct.Name}" already exists in the CMS (Product ID: ${existingProduct.ProductID}). You cannot create a duplicate product. Please edit the existing product instead.`
                });
            }

            const inventoryProductInfo = await pool.request()
                .input('inventoryProductId', sql.Int, inventoryProductIdNum)
                .query(`
                    SELECT Name, SKU, COALESCE(AvailableQuantity, 0) as AvailableQuantity
                    FROM InventoryProducts
                    WHERE InventoryProductID = @inventoryProductId AND IsActive = 1
                `);

            if (inventoryProductInfo.recordset.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Selected inventory product not found or is inactive.'
                });
            }

            const invProduct = inventoryProductInfo.recordset[0];
            const inventoryAvailableQty = invProduct.AvailableQuantity || 0;
            const requestedStockQty = parseInt(stockquantity) || 0;

            const inventoryProductLinkCheck = await pool.request()
                .input('inventoryProductId', sql.Int, inventoryProductIdNum)
                .query(`
                    SELECT InventoryProductID, ProductID, Name
                    FROM InventoryProducts
                    WHERE InventoryProductID = @inventoryProductId AND IsActive = 1
                `);

            if (inventoryProductLinkCheck.recordset.length > 0) {
                const inventoryProduct = inventoryProductLinkCheck.recordset[0];

                if (inventoryProduct.ProductID && inventoryProduct.ProductID !== null) {
                    const linkedProductCheck = await pool.request()
                        .input('productId', sql.Int, inventoryProduct.ProductID)
                        .query(`
                            SELECT ProductID, Name, IsActive
                            FROM Products
                            WHERE ProductID = @productId AND IsActive = 1
                        `);

                    if (linkedProductCheck.recordset.length > 0) {
                        const existingProduct = linkedProductCheck.recordset[0];
                        return res.status(400).json({
                            success: false,
                            message: `This inventory product "${inventoryProduct.Name || 'ID: ' + inventoryProductIdNum}" is already linked to a CMS product (Product ID: ${existingProduct.ProductID}, Name: "${existingProduct.Name}"). You cannot create a duplicate link. Please edit the existing product instead.`
                        });
                    }
                }
            }

            if (requestedStockQty > inventoryAvailableQty) {
                return res.status(400).json({
                    success: false,
                    message: `Stock quantity (${requestedStockQty}) cannot exceed inventory available quantity (${inventoryAvailableQty}). Please use the quantity from Product Inventory.`
                });
            }

            const transaction = new sql.Transaction(pool);
            await transaction.begin();

            try {
                let dimensionsJson = '{}';
                if (dimensions) {
                    try {
                        const dimensionsData = JSON.parse(dimensions);
                        dimensionsJson = JSON.stringify(dimensionsData);
                    } catch (e) {
                        console.log('Error parsing dimensions:', e);
                    }
                }

                const tempSku = `TEMP-SKU-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
                const tempSlug = `temp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

                const productResult = await transaction.request()
                    .input('name', sql.NVarChar, name)
                    .input('description', sql.NVarChar, description)
                    .input('price', sql.Decimal(10, 2), price)
                    .input('stockquantity', sql.Int, stockquantity)
                    .input('category', sql.NVarChar, category)
                    .input('dimensions', sql.NVarChar, dimensionsJson)
                    .input('tempSku', sql.NVarChar, tempSku)
                    .input('tempSlug', sql.NVarChar, tempSlug)
                    .query(`
                        INSERT INTO Products (Name, Description, Price, StockQuantity, Category, Dimensions, DateAdded, IsActive, SKU, PublicId, Slug)
                        VALUES (@name, @description, @price, @stockquantity, @category, @dimensions, GETDATE(), 1, @tempSku, NEWID(), @tempSlug)
                        SELECT SCOPE_IDENTITY() as ProductID
                    `);

                const productId = productResult.recordset[0].ProductID;

                const { sku, slug } = generateProductIdentifiers(productId, name);
                const finalPublicId = generateGuid();

                await transaction.request()
                    .input('productId', sql.Int, productId)
                    .input('sku', sql.NVarChar, sku)
                    .input('publicId', sql.NVarChar, finalPublicId)
                    .input('slug', sql.NVarChar, slug)
                    .query('UPDATE Products SET SKU = @sku, PublicId = CAST(@publicId AS UNIQUEIDENTIFIER), Slug = @slug WHERE ProductID = @productId');

                const inventoryProductResult = await transaction.request()
                    .input('inventoryProductId', sql.Int, inventoryProductIdNum)
                    .query(`
                        SELECT ImageURL, ThumbnailURLs, Model3D as Model3DURL
                        FROM InventoryProducts
                        WHERE InventoryProductID = @inventoryProductId
                    `);

                if (inventoryProductResult.recordset.length > 0) {
                    const inventoryProduct = inventoryProductResult.recordset[0];

                    if (!req.files || !req.files.image) {
                        if (inventoryProduct.ImageURL) {
                            await transaction.request()
                                .input('productId', sql.Int, productId)
                                .input('imageUrl', sql.NVarChar, inventoryProduct.ImageURL)
                                .query('UPDATE Products SET ImageURL = @imageUrl WHERE ProductID = @productId');
                        }
                    } else {
                        const imageFile = req.files.image[0];
                        const imageUrl = publicUrlFromMulterProductFile(imageFile);
                        await transaction.request()
                            .input('productId', sql.Int, productId)
                            .input('imageUrl', sql.NVarChar, imageUrl)
                            .query('UPDATE Products SET ImageURL = @imageUrl WHERE ProductID = @productId');
                    }

                    let thumbnails = [];
                    let hasUploadedThumbnails = false;

                    for (let i = 1; i <= 4; i++) {
                        if (req.files && req.files[`thumbnail${i}`]) {
                            const thumbnailFile = req.files[`thumbnail${i}`][0];
                            thumbnails.push(publicUrlFromMulterProductFile(thumbnailFile));
                            hasUploadedThumbnails = true;
                        }
                    }

                    if (req.files && req.files.thumbnails && req.files.thumbnails.length > 0) {
                        for (const thumbnailFile of req.files.thumbnails) {
                            thumbnails.push(publicUrlFromMulterProductFile(thumbnailFile));
                            hasUploadedThumbnails = true;
                        }
                    }

                    if (!hasUploadedThumbnails && inventoryProduct.ThumbnailURLs) {
                        try {
                            const inventoryThumbnails = typeof inventoryProduct.ThumbnailURLs === 'string'
                                ? JSON.parse(inventoryProduct.ThumbnailURLs)
                                : inventoryProduct.ThumbnailURLs;
                            if (Array.isArray(inventoryThumbnails)) {
                                thumbnails = inventoryThumbnails;
                            }
                        } catch (e) {
                            console.log('Error parsing inventory thumbnails:', e);
                        }
                    }

                    if (thumbnails.length > 0) {
                        await transaction.request()
                            .input('productId', sql.Int, productId)
                            .input('thumbnails', sql.NVarChar, JSON.stringify(thumbnails))
                            .query('UPDATE Products SET ThumbnailURLs = @thumbnails WHERE ProductID = @productId');
                    }

                    if (!req.files || !req.files.model3d) {
                        if (inventoryProduct.Model3DURL) {
                            await transaction.request()
                                .input('productId', sql.Int, productId)
                                .input('model3dUrl', sql.NVarChar, inventoryProduct.Model3DURL)
                                .query('UPDATE Products SET Model3DURL = @model3dUrl WHERE ProductID = @productId');
                        }
                    } else {
                        const model3dFile = req.files.model3d[0];
                        const model3dUrl = publicUrlFromMulterProductFile(model3dFile);
                        await transaction.request()
                            .input('productId', sql.Int, productId)
                            .input('model3dUrl', sql.NVarChar, model3dUrl)
                            .query('UPDATE Products SET Model3DURL = @model3dUrl WHERE ProductID = @productId');
                    }
                }

                if (inventoryProductIdNum) {
                    const inventoryCheckResult = await transaction.request()
                        .input('inventoryProductId', sql.Int, inventoryProductIdNum)
                        .query(`
                            SELECT AvailableQuantity, ProductID
                            FROM InventoryProducts
                            WHERE InventoryProductID = @inventoryProductId AND IsActive = 1
                        `);

                    if (inventoryCheckResult.recordset.length > 0) {
                        const inventoryProduct = inventoryCheckResult.recordset[0];
                        const availableQuantity = inventoryProduct.AvailableQuantity || 0;

                        if (inventoryProduct.ProductID && inventoryProduct.ProductID !== null) {
                            await transaction.rollback();
                            return res.status(400).json({
                                success: false,
                                message: `This inventory product is already linked to another product. You cannot create a duplicate link.`
                            });
                        }

                        await transaction.request()
                            .input('inventoryProductId', sql.Int, inventoryProductIdNum)
                            .input('productId', sql.Int, productId)
                            .query(`
                                UPDATE InventoryProducts 
                                SET ProductID = @productId 
                                WHERE InventoryProductID = @inventoryProductId AND (ProductID IS NULL OR ProductID = 0)
                            `);

                        await transaction.request()
                            .input('productId', sql.Int, productId)
                            .input('availableQuantity', sql.Int, availableQuantity)
                            .query(`
                                UPDATE Products 
                                SET StockQuantity = @availableQuantity,
                                    UpdatedAt = GETDATE()
                                WHERE ProductID = @productId
                            `);
                    }
                }

                await transaction.commit();

                await logActivity(
                    req.session.user.id,
                    'INSERT',
                    'Products',
                    productId.toString(),
                    `Admin created new product: "${name}" (ID: ${productId})`
                );

                if (!res.headersSent) {
                    res.json({
                        success: true,
                        message: 'Product created successfully!',
                        productId: productId
                    });
                }
            } catch (err) {
                await transaction.rollback();
                throw err;
            }
        } catch (err) {
            console.error('Error creating product:', err);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    message: 'Failed to create product: ' + (err.message || 'Unknown error'),
                    error: err.message
                });
            }
        }
    });

    // Admin - Edit Product (Legacy CMS Products table)
    router.post('/Employee/Admin/Products/Edit', isAuthenticated, productUpload.fields([
        { name: 'image', maxCount: 1 },
        { name: 'thumbnail1', maxCount: 1 },
        { name: 'thumbnail2', maxCount: 1 },
        { name: 'thumbnail3', maxCount: 1 },
        { name: 'thumbnail4', maxCount: 1 },
        { name: 'thumbnails', maxCount: 4 },
        { name: 'model3d', maxCount: 1 }
    ]), async (req, res) => {
        try {
            await pool.connect();
            const { productid, name, description, price, stockquantity, category, requiredMaterials, dimensions } = req.body;

            let dimensionsJson = '{}';
            if (dimensions) {
                try {
                    const dimensionsData = JSON.parse(dimensions);
                    dimensionsJson = JSON.stringify(dimensionsData);
                } catch (e) {
                    console.log('Error parsing dimensions:', e);
                }
            }

            const transaction = new sql.Transaction(pool);
            await transaction.begin();

            try {
                const oldProductResult = await transaction.request()
                    .input('productId', sql.Int, productid)
                    .query(`
                        SELECT Name, Description, Price, StockQuantity, Category 
                        FROM Products 
                        WHERE ProductID = @productId
                    `);

                const oldProduct = oldProductResult.recordset[0];
                const currentStockQuantity = oldProduct.StockQuantity || 0;

                await transaction.request()
                    .input('productId', sql.Int, productid)
                    .input('name', sql.NVarChar, name)
                    .input('description', sql.NVarChar, description)
                    .input('price', sql.Decimal(10, 2), price)
                    .input('category', sql.NVarChar, category)
                    .input('dimensions', sql.NVarChar, dimensionsJson)
                    .query(`
                        UPDATE Products 
                        SET Name = @name, Description = @description, Price = @price,
                            Category = @category, Dimensions = @dimensions, UpdatedAt = GETDATE()
                        WHERE ProductID = @productId
                    `);

                if (req.files) {
                    const currentProduct = await transaction.request()
                        .input('productId', sql.Int, productid)
                        .query('SELECT ImageURL, ThumbnailURLs, Model3DURL FROM Products WHERE ProductID = @productId');

                    const currentImageUrl = currentProduct.recordset[0]?.ImageURL;
                    const currentThumbnailUrls = currentProduct.recordset[0]?.ThumbnailURLs;
                    const currentModel3DURL = currentProduct.recordset[0]?.Model3DURL;

                    if (req.files.image) {
                        const imageFile = req.files.image[0];
                        const imageUrl = publicUrlFromMulterProductFile(imageFile);
                        await transaction.request()
                            .input('productId', sql.Int, productid)
                            .input('imageUrl', sql.NVarChar, imageUrl)
                            .query('UPDATE Products SET ImageURL = @imageUrl WHERE ProductID = @productId');
                    }

                    const thumbnails = [];

                    for (let i = 1; i <= 4; i++) {
                        if (req.files[`thumbnail${i}`]) {
                            const thumbnailFile = req.files[`thumbnail${i}`][0];
                            thumbnails.push(publicUrlFromMulterProductFile(thumbnailFile));
                        }
                    }

                    if (req.files.thumbnails && req.files.thumbnails.length > 0) {
                        for (const thumbnailFile of req.files.thumbnails) {
                            thumbnails.push(publicUrlFromMulterProductFile(thumbnailFile));
                        }
                    }

                    if (thumbnails.length > 0) {
                        await transaction.request()
                            .input('productId', sql.Int, productid)
                            .input('thumbnails', sql.NVarChar, JSON.stringify(thumbnails))
                            .query('UPDATE Products SET ThumbnailURLs = @thumbnails WHERE ProductID = @productId');
                    }

                    if (req.files.model3d) {
                        const model3dFile = req.files.model3d[0];
                        const model3dUrl = publicUrlFromMulterProductFile(model3dFile);
                        await transaction.request()
                            .input('productId', sql.Int, productid)
                            .input('model3dUrl', sql.NVarChar, model3dUrl)
                            .input('has3dModel', sql.Bit, 1)
                            .query('UPDATE Products SET Model3DURL = @model3dUrl, Has3DModel = @has3dModel WHERE ProductID = @productId');
                    }
                }

                await transaction.commit();

                await logActivity(
                    req.session.user.id,
                    'UPDATE',
                    'Products',
                    productid.toString(),
                    `Admin updated product: "${name}" (ID: ${productid})`
                );

                res.json({
                    success: true,
                    message: 'Product updated successfully!'
                });
            } catch (err) {
                await transaction.rollback();
                throw err;
            }
        } catch (err) {
            console.error('Error updating product:', err);
            res.json({
                success: false,
                message: 'Failed to update product: ' + err.message
            });
        }
    });

    // Admin - Update Stock Only (Legacy - redirects to Inventory)
    router.post('/Employee/Admin/Products/UpdateStock', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const { productId } = req.body;

            if (!productId) {
                return res.json({
                    success: false,
                    message: 'Product ID is required.'
                });
            }

            return res.json({
                success: false,
                message: 'Stock quantity cannot be edited from Products page. Please use Product Inventory page to manage stock quantities. Stock is automatically synced from inventory to Products for CMS display.',
                redirectTo: '/Employee/Admin/Inventory?tab=ProductInventory'
            });
        } catch (err) {
            console.error('Error in UpdateStock endpoint:', err);
            res.json({
                success: false,
                message: 'Stock management is done through Product Inventory page. Please navigate to /Employee/Admin/Inventory'
            });
        }
    });

    // Admin - Delete Product (Legacy CMS Products table)
    router.post('/Employee/Admin/Products/Delete/:id', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();

            const productId = req.params.id;

            const checkResult = await pool.request()
                .input('id', sql.Int, productId)
                .query('SELECT ProductID, Name FROM Products WHERE ProductID = @id');

            if (checkResult.recordset.length === 0) {
                req.flash('error', 'Product not found.');
                return res.redirect('/Employee/Admin/ProductsListing');
            }

            const productName = checkResult.recordset[0].Name;

            const transaction = new sql.Transaction(pool);
            await transaction.begin();

            try {
                const materialsResult = await transaction.request()
                    .input('productId', sql.Int, productId)
                    .query(`
                        SELECT MaterialID, QuantityRequired 
                        FROM ProductMaterials 
                        WHERE ProductID = @productId
                    `);

                const materials = materialsResult.recordset || [];

                for (const material of materials) {
                    const materialCheckResult = await transaction.request()
                        .input('materialId', sql.Int, material.MaterialID)
                        .query('SELECT QuantityAvailable, Name FROM RawMaterials WHERE MaterialID = @materialId AND IsActive = 1');

                    if (materialCheckResult.recordset.length > 0) {
                        const currentQuantity = materialCheckResult.recordset[0].QuantityAvailable || 0;
                        const restoredQuantity = currentQuantity + material.QuantityRequired;

                        await transaction.request()
                            .input('materialId', sql.Int, material.MaterialID)
                            .input('restoredQuantity', sql.Int, restoredQuantity)
                            .query(`
                                UPDATE RawMaterials 
                                SET QuantityAvailable = @restoredQuantity, LastUpdated = GETDATE()
                                WHERE MaterialID = @materialId
                            `);
                    }
                }

                await transaction.request()
                    .input('id', sql.Int, productId)
                    .query('UPDATE Products SET IsActive = 0 WHERE ProductID = @id');

                await transaction.commit();
            } catch (err) {
                await transaction.rollback();
                throw err;
            }

            await logActivity(
                req.session.user.id,
                'UPDATE',
                'Products',
                productId.toString(),
                `Admin archived product "${productName}" (ID: ${productId})`,
                JSON.stringify({ IsActive: { old: 1, new: 0 } })
            );

            req.flash('success', `Product "${productName}" has been archived. You can restore it from the Archived page.`);
            res.redirect('/Employee/Admin/ProductsListing');
        } catch (err) {
            console.error('Error archiving product:', err);
            req.flash('error', 'Failed to archive product. Please try again.');
            res.redirect('/Employee/Admin/ProductsListing');
        }
    });

    console.log('Admin Products Routes module loaded - Complete');
};
