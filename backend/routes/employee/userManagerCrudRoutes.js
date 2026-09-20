'use strict';

/**
 * Extracted from routes.js lines 3425-4289.
 */
module.exports = function registerUserManagerCrudRoutes(router, ctx) {
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
        deleteOldImageFile,
        generateGuid,
        decreaseMaterialsForProduct,
        restoreMaterialsForProduct
    } = ctx;

    const renderRoleActivityLogsPage = makeRenderRoleActivityLogsPage(pool);

    // =============================================================================
    // USER MANAGER CRUD ROUTES
    // =============================================================================

    // User Manager - Products CRUD
    router.post('/Employee/UserManager/UserProducts/Add', isAuthenticated, productUpload.fields([
        { name: 'image', maxCount: 1 },
        { name: 'thumbnail1', maxCount: 1 },
        { name: 'thumbnail2', maxCount: 1 },
        { name: 'thumbnail3', maxCount: 1 },
        { name: 'thumbnail4', maxCount: 1 },
        { name: 'model3d', maxCount: 1 }
    ]), async (req, res) => {
        try {
            await pool.connect();
            const { name, description, price, stockquantity, category, requiredMaterials } = req.body;

            // Start transaction
            const transaction = new sql.Transaction(pool);
            await transaction.begin();

            try {
                // Generate temporary SKU and Slug to satisfy UNIQUE constraints
                // Use SQL Server's NEWID() for PublicId directly in the query
                const tempSku = `TEMP-SKU-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
                const tempSlug = `temp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

                // Insert product
                const productResult = await transaction.request()
                    .input('name', sql.NVarChar, name)
                    .input('description', sql.NVarChar, description)
                    .input('price', sql.Decimal(10, 2), parseFloat(price))
                    .input('stockquantity', sql.Int, parseInt(stockquantity))
                    .input('category', sql.NVarChar, category)
                    .input('dimensions', sql.NVarChar, dimensionsJson)
                    .input('image', sql.NVarChar, req.files?.image ? publicUrlFromMulterProductFile(req.files.image[0]) : null)
                    .input('thumbnails', sql.NVarChar, req.files ? JSON.stringify([
                        req.files.thumbnail1?.[0] ? publicUrlFromMulterProductFile(req.files.thumbnail1[0]) : null,
                        req.files.thumbnail2?.[0] ? publicUrlFromMulterProductFile(req.files.thumbnail2[0]) : null,
                        req.files.thumbnail3?.[0] ? publicUrlFromMulterProductFile(req.files.thumbnail3[0]) : null,
                        req.files.thumbnail4?.[0] ? publicUrlFromMulterProductFile(req.files.thumbnail4[0]) : null
                    ].filter(Boolean)) : null)
                    .input('model3d', sql.NVarChar, req.files?.model3d ? publicUrlFromMulterProductFile(req.files.model3d[0]) : null)
                    .input('tempSku', sql.NVarChar, tempSku)
                    .input('tempSlug', sql.NVarChar, tempSlug)
                    .query(`
                        INSERT INTO Products (Name, Description, Price, StockQuantity, Category, ImageURL, ThumbnailURLs, Model3DURL, CreatedAt, IsArchived, SKU, PublicId, Slug)
                        OUTPUT INSERTED.ProductID
                        VALUES (@name, @description, @price, @stockquantity, @category, @image, @thumbnails, @model3d, GETDATE(), 0, @tempSku, NEWID(), @tempSlug)
                    `);

                const productId = productResult.recordset[0].ProductID;

                // Generate final SKU and Slug based on actual ProductID
                // Generate a new GUID for the final PublicId
                const { sku, slug } = generateProductIdentifiers(productId, name);
                const finalPublicId = generateGuid(); // Generate final GUID (uppercase format)

                // Update with final identifiers
                // Use CAST to convert GUID string to uniqueidentifier
                try {
                    await transaction.request()
                        .input('productId', sql.Int, productId)
                        .input('sku', sql.NVarChar, sku)
                        .input('publicId', sql.NVarChar, finalPublicId)
                        .input('slug', sql.NVarChar, slug)
                        .query('UPDATE Products SET SKU = @sku, PublicId = CAST(@publicId AS UNIQUEIDENTIFIER), Slug = @slug WHERE ProductID = @productId');
                } catch (updateErr) {
                    console.error('Error updating product identifiers:', updateErr);
                    console.error('ProductID:', productId, 'SKU:', sku, 'PublicId:', finalPublicId, 'Slug:', slug);
                    throw updateErr;
                }

                // Handle required materials if provided
                console.log(`[USER MANAGER PRODUCT ADD] Product ${productId} - Stock quantity: ${stockquantity}`);
                console.log(`[USER MANAGER PRODUCT ADD] Product ${productId} - Required materials received:`, requiredMaterials);

                const materials = [];
                if (requiredMaterials) {
                    let materialsData;
                    try {
                        // Try parsing as JSON string first
                        if (typeof requiredMaterials === 'string') {
                            materialsData = JSON.parse(requiredMaterials);
                        } else {
                            materialsData = requiredMaterials;
                        }
                    } catch (parseError) {
                        console.error(`[USER MANAGER PRODUCT ADD] Error parsing requiredMaterials:`, parseError);
                        materialsData = Array.isArray(requiredMaterials) ? requiredMaterials : [];
                    }

                    console.log(`[USER MANAGER PRODUCT ADD] Product ${productId} - Parsed materials data:`, materialsData);

                    for (const material of materialsData) {
                        let materialId, quantityRequired;

                        // Handle both formats: array of IDs or array of objects
                        if (typeof material === 'number' || typeof material === 'string') {
                            // Old format: just material ID
                            materialId = parseInt(material);
                            quantityRequired = 1; // Default to 1 if not specified
                        } else if (material && material.materialId) {
                            // New format: object with materialId and quantityRequired
                            materialId = parseInt(material.materialId);
                            quantityRequired = parseInt(material.quantityRequired) || 1;
                        } else {
                            console.warn(`[USER MANAGER PRODUCT ADD] Skipping invalid material:`, material);
                            continue;
                        }

                        if (materialId && quantityRequired > 0) {
                            await transaction.request()
                                .input('productId', sql.Int, productId)
                                .input('materialId', sql.Int, materialId)
                                .input('quantityRequired', sql.Int, quantityRequired)
                                .query(`
                                    INSERT INTO ProductMaterials (ProductID, MaterialID, QuantityRequired, CreatedAt)
                                    VALUES (@productId, @materialId, @quantityRequired, GETDATE())
                                `);

                            materials.push({
                                materialId: materialId,
                                quantityRequired: quantityRequired
                            });

                            console.log(`[USER MANAGER PRODUCT ADD] Added material ${materialId} (qty: ${quantityRequired}) to product ${productId}`);
                        }
                    }

                    console.log(`[USER MANAGER PRODUCT ADD] Product ${productId} - Total materials collected: ${materials.length}`);

                    // Decrease raw materials inventory when materials are added to product
                    // Formula: quantityRequired × stockQuantity = total materials to decrease
                    if (materials.length > 0 && stockquantity > 0) {
                        console.log(`[USER MANAGER PRODUCT ADD] Calling decreaseMaterialsForProduct for product ${productId}`);
                        await decreaseMaterialsForProduct(transaction, productId, parseInt(stockquantity) || 0, materials);
                    } else {
                        console.log(`[USER MANAGER PRODUCT ADD] Skipping decrease - materials.length: ${materials.length}, stockquantity: ${stockquantity}`);
                    }
                } else {
                    console.log(`[USER MANAGER PRODUCT ADD] No requiredMaterials provided for product ${productId}`);
                }

                await transaction.commit();

                // Log the activity
                await logActivity(
                    req.session.user.id,
                    'INSERT',
                    'Products',
                    productId,
                    `Created new product: "${name}" (ID: ${productId})`
                );

                res.json({ success: true, message: 'Product added successfully', productId });
            } catch (error) {
                try {
                    await transaction.rollback();
                } catch (rollbackErr) {
                    // Transaction may already be aborted, ignore rollback error
                    console.error('Error during transaction rollback (may be already aborted):', rollbackErr.message);
                }
                throw error;
            }
        } catch (err) {
            console.error('Error adding product:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to add product',
                error: err.message
            });
        }
    });

    router.post('/Employee/UserManager/UserProducts/Edit', isAuthenticated, productUpload.fields([
        { name: 'image', maxCount: 1 },
        { name: 'thumbnail1', maxCount: 1 },
        { name: 'thumbnail2', maxCount: 1 },
        { name: 'thumbnail3', maxCount: 1 },
        { name: 'thumbnail4', maxCount: 1 },
        { name: 'model3d', maxCount: 1 }
    ]), async (req, res) => {
        try {
            await pool.connect();
            const { productId, name, description, price, stockquantity, category, requiredMaterials } = req.body;

            // Start transaction
            const transaction = new sql.Transaction(pool);
            await transaction.begin();

            try {
                // Get current product data for logging
                const currentProduct = await transaction.request()
                    .input('productId', sql.Int, productId)
                    .query('SELECT * FROM Products WHERE ProductID = @productId');

                if (currentProduct.recordset.length === 0) {
                    throw new Error('Product not found');
                }

                const oldProduct = currentProduct.recordset[0];

                // Prepare update data
                const updateData = {
                    name: name || oldProduct.Name,
                    description: description || oldProduct.Description,
                    price: price ? parseFloat(price) : oldProduct.Price,
                    stockquantity: stockquantity ? parseInt(stockquantity) : oldProduct.StockQuantity,
                    category: category || oldProduct.Category,
                    image: req.files?.image ? publicUrlFromMulterProductFile(req.files.image[0]) : oldProduct.ImageURL,
                    thumbnails: req.files ? JSON.stringify([
                        req.files.thumbnail1?.[0] ? publicUrlFromMulterProductFile(req.files.thumbnail1[0]) : null,
                        req.files.thumbnail2?.[0] ? publicUrlFromMulterProductFile(req.files.thumbnail2[0]) : null,
                        req.files.thumbnail3?.[0] ? publicUrlFromMulterProductFile(req.files.thumbnail3[0]) : null,
                        req.files.thumbnail4?.[0] ? publicUrlFromMulterProductFile(req.files.thumbnail4[0]) : null
                    ].filter(Boolean)) : oldProduct.ThumbnailURLs,
                    model3d: req.files?.model3d ? publicUrlFromMulterProductFile(req.files.model3d[0]) : oldProduct.Model3DURL
                };

                // Update product
                await transaction.request()
                    .input('productId', sql.Int, productId)
                    .input('name', sql.NVarChar, updateData.name)
                    .input('description', sql.NVarChar, updateData.description)
                    .input('price', sql.Decimal(10, 2), updateData.price)
                    .input('stockquantity', sql.Int, updateData.stockquantity)
                    .input('category', sql.NVarChar, updateData.category)
                    .input('image', sql.NVarChar, updateData.image)
                    .input('thumbnails', sql.NVarChar, updateData.thumbnails)
                    .input('model3d', sql.NVarChar, updateData.model3d)
                    .query(`
                        UPDATE Products 
                        SET Name = @name, Description = @description, Price = @price, 
                            StockQuantity = @stockquantity, Category = @category, 
                            ImageURL = @image, ThumbnailURLs = @thumbnails, Model3DURL = @model3d,
                            UpdatedAt = GETDATE()
                        WHERE ProductID = @productId
                    `);

                // Handle required materials
                console.log(`[USER MANAGER PRODUCT EDIT] Product ${productId} - Old stock: ${oldProduct.StockQuantity}, New stock: ${updateData.stockquantity}`);

                // Get old materials and stock quantity before updating
                const oldMaterialsResult = await transaction.request()
                    .input('productId', sql.Int, productId)
                    .query(`
                        SELECT MaterialID, QuantityRequired
                        FROM ProductMaterials
                        WHERE ProductID = @productId
                    `);
                const oldMaterials = oldMaterialsResult.recordset;
                const oldStockQuantity = oldProduct.StockQuantity || 0;
                const newStockQuantity = updateData.stockquantity || 0;

                console.log(`[USER MANAGER PRODUCT EDIT] Product ${productId} - Old materials: ${oldMaterials.length}, Old stock: ${oldStockQuantity}`);

                // Restore materials from old product configuration
                if (oldMaterials.length > 0 && oldStockQuantity > 0) {
                    console.log(`[USER MANAGER PRODUCT EDIT] Restoring old materials for product ${productId}`);
                    await restoreMaterialsForProduct(transaction, productId, oldStockQuantity, oldMaterials);
                }

                // Update required materials if provided
                const newMaterials = [];
                if (requiredMaterials !== undefined) {
                    // Remove existing materials
                    await transaction.request()
                        .input('productId', sql.Int, productId)
                        .query('DELETE FROM ProductMaterials WHERE ProductID = @productId');

                    // Parse new materials
                    let materialsData;
                    try {
                        if (typeof requiredMaterials === 'string') {
                            materialsData = JSON.parse(requiredMaterials);
                        } else {
                            materialsData = requiredMaterials;
                        }
                    } catch (parseError) {
                        console.error(`[USER MANAGER PRODUCT EDIT] Error parsing requiredMaterials:`, parseError);
                        materialsData = Array.isArray(requiredMaterials) ? requiredMaterials : [];
                    }

                    // Add new materials
                    if (materialsData && materialsData.length > 0) {
                        for (const material of materialsData) {
                            let materialId, quantityRequired;

                            // Handle both formats: array of IDs or array of objects
                            if (typeof material === 'number' || typeof material === 'string') {
                                // Old format: just material ID
                                materialId = parseInt(material);
                                quantityRequired = 1; // Default to 1 if not specified
                            } else if (material && material.materialId) {
                                // New format: object with materialId and quantityRequired
                                materialId = parseInt(material.materialId);
                                quantityRequired = parseInt(material.quantityRequired) || 1;
                            } else {
                                console.warn(`[USER MANAGER PRODUCT EDIT] Skipping invalid material:`, material);
                                continue;
                            }

                            if (materialId && quantityRequired > 0) {
                                await transaction.request()
                                    .input('productId', sql.Int, productId)
                                    .input('materialId', sql.Int, materialId)
                                    .input('quantityRequired', sql.Int, quantityRequired)
                                    .query(`
                                        INSERT INTO ProductMaterials (ProductID, MaterialID, QuantityRequired, CreatedAt)
                                        VALUES (@productId, @materialId, @quantityRequired, GETDATE())
                                    `);

                                newMaterials.push({
                                    materialId: materialId,
                                    quantityRequired: quantityRequired
                                });
                            }
                        }
                    }
                }

                console.log(`[USER MANAGER PRODUCT EDIT] Product ${productId} - New materials: ${newMaterials.length}, New stock: ${newStockQuantity}`);

                // Decrease materials for new product configuration
                // If stock becomes 0, materials won't be decreased (they were already restored above)
                if (newMaterials.length > 0 && newStockQuantity > 0) {
                    console.log(`[USER MANAGER PRODUCT EDIT] Decreasing materials for product ${productId} with new configuration`);
                    await decreaseMaterialsForProduct(transaction, productId, newStockQuantity, newMaterials);
                } else {
                    console.log(`[USER MANAGER PRODUCT EDIT] Skipping decrease - newMaterials: ${newMaterials.length}, newStockQuantity: ${newStockQuantity}`);
                }

                await transaction.commit();

                // Log the activity
                await logActivity(
                    req.session.user.id,
                    'UPDATE',
                    'Products',
                    productId,
                    `Updated product: "${name}" (ID: ${productId})`
                );

                res.json({ success: true, message: 'Product updated successfully' });
            } catch (error) {
                await transaction.rollback();
                throw error;
            }
        } catch (err) {
            console.error('Error updating product:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to update product',
                error: err.message
            });
        }
    });

    router.post('/Employee/UserManager/UserProducts/Delete/:id', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const productId = req.params.id;

            // Get product info for logging
            const productResult = await pool.request()
                .input('productId', sql.Int, productId)
                .query('SELECT Name FROM Products WHERE ProductID = @productId');

            if (productResult.recordset.length === 0) {
                return res.status(404).json({ success: false, message: 'Product not found' });
            }

            const productName = productResult.recordset[0].Name;

            // Archive the product instead of deleting
            await pool.request()
                .input('productId', sql.Int, productId)
                .query('UPDATE Products SET IsActive = 0, UpdatedAt = GETDATE() WHERE ProductID = @productId');

            // Log the activity
            await logActivity(
                req.session.user.id,
                'DELETE',
                'Products',
                productId,
                `Deleted product: "${productName}" (ID: ${productId})`,
                JSON.stringify({ IsActive: { old: 1, new: 0 } })
            );

            res.json({ success: true, message: 'Product archived successfully' });
        } catch (err) {
            console.error('Error archiving product:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to archive product',
                error: err.message
            });
        }
    });

    // User Manager - Materials CRUD
    router.post('/Employee/UserManager/UserMaterials/Add', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const { name, quantity, unit } = req.body;

            const result = await pool.request()
                .input('name', sql.NVarChar, name)
                .input('quantity', sql.Int, quantity)
                .input('unit', sql.NVarChar, unit)
                .query(`
                    INSERT INTO RawMaterials (Name, QuantityAvailable, Unit, LastUpdated, IsActive)
                    OUTPUT INSERTED.MaterialID
                    VALUES (@name, @quantity, @unit, GETDATE(), 1)
                `);

            const materialId = result.recordset[0].MaterialID;

            // Log the activity
            await logActivity(
                req.session.user.id,
                'INSERT',
                'RawMaterials',
                materialId,
                `Created new material: "${name}" (ID: ${materialId})`
            );

            res.json({ success: true, message: 'Material added successfully', materialId });
        } catch (err) {
            console.error('Error adding material:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to add material',
                error: err.message
            });
        }
    });

    router.post('/Employee/UserManager/UserMaterials/Edit', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const { materialId, name, quantity, unit } = req.body;

            await pool.request()
                .input('materialId', sql.Int, materialId)
                .input('name', sql.NVarChar, name)
                .input('quantity', sql.Int, quantity)
                .input('unit', sql.NVarChar, unit)
                .query(`
                    UPDATE RawMaterials 
                    SET Name = @name, QuantityAvailable = @quantity, Unit = @unit, LastUpdated = GETDATE()
                    WHERE MaterialID = @materialId
                `);

            // Log the activity
            await logActivity(
                req.session.user.id,
                'UPDATE',
                'RawMaterials',
                materialId,
                `Updated material: "${name}" (ID: ${materialId})`
            );

            res.json({ success: true, message: 'Material updated successfully' });
        } catch (err) {
            console.error('Error updating material:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to update material',
                error: err.message
            });
        }
    });

    router.post('/Employee/UserManager/UserMaterials/Delete/:id', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const materialId = req.params.id;

            // Get material info for logging
            const materialResult = await pool.request()
                .input('materialId', sql.Int, materialId)
                .query('SELECT Name FROM RawMaterials WHERE MaterialID = @materialId');

            if (materialResult.recordset.length === 0) {
                return res.status(404).json({ success: false, message: 'Material not found' });
            }

            const materialName = materialResult.recordset[0].Name;

            // Deactivate the material instead of deleting
            await pool.request()
                .input('materialId', sql.Int, materialId)
                .query('UPDATE RawMaterials SET IsActive = 0, LastUpdated = GETDATE() WHERE MaterialID = @materialId');

            // Log the activity
            await logActivity(
                req.session.user.id,
                'DELETE',
                'RawMaterials',
                materialId,
                `Deleted material: "${materialName}" (ID: ${materialId})`,
                JSON.stringify({ IsActive: { old: 1, new: 0 } })
            );

            res.json({ success: true, message: 'Material deactivated successfully' });
        } catch (err) {
            console.error('Error deactivating material:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to deactivate material',
                error: err.message
            });
        }
    });
    // User Manager - Variations CRUD
    router.post('/Employee/UserManager/UserVariations/Add', isAuthenticated, variationUpload.single('variationImage'), async (req, res) => {
        try {
            await pool.connect();
            const { variationName, color, quantity, productID, isActive } = req.body;

            const parsedProductID = parseInt(productID);

            // Get product stock quantity
            const productResult = await pool.request()
                .input('productID', sql.Int, parsedProductID)
                .query('SELECT StockQuantity FROM Products WHERE ProductID = @productID');

            if (productResult.recordset.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Product not found.'
                });
            }

            const productStock = productResult.recordset[0].StockQuantity;

            const variationQuantity = parseInt(quantity) || 0;

            if (variationQuantity <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Variation quantity must be greater than 0.'
                });
            }

            // Sum up quantities of all existing active variations for this product
            const existingVariationsResult = await pool.request()
                .input('productID', sql.Int, parsedProductID)
                .query('SELECT ISNULL(SUM(Quantity), 0) as TotalVariationQuantity FROM ProductVariations WHERE ProductID = @productID AND IsActive = 1');

            const existingVariationQuantity = existingVariationsResult.recordset[0].TotalVariationQuantity;

            // Validation removed: total variation quantities can exceed available stock
            // (User requested removal of this validation)

            // Handle image upload
            let imageUrl = null;
            if (req.file) {
                imageUrl = publicUrlFromMulterVariationFile(req.file);
            }

            // Start transaction to ensure both variation insert and stock update succeed or fail together
            const transaction = new sql.Transaction(pool);
            await transaction.begin();

            try {
                const result = await transaction.request()
                    .input('productID', sql.Int, parsedProductID)
                    .input('variationName', sql.NVarChar, variationName)
                    .input('color', sql.NVarChar, color || null)
                    .input('quantity', sql.Int, variationQuantity)
                    .input('imageUrl', sql.NVarChar, imageUrl)
                    .input('isActive', sql.Bit, isActive === '1' ? 1 : 0)
                    .query(`
                        INSERT INTO ProductVariations (ProductID, VariationName, Color, Quantity, VariationImageURL, IsActive)
                        OUTPUT INSERTED.VariationID
                        VALUES (@productID, @variationName, @color, @quantity, @imageUrl, @isActive)
                    `);

                const variationID = result.recordset[0].VariationID;

                // Decrease product stock by variation quantity
                await transaction.request()
                    .input('productID', sql.Int, parsedProductID)
                    .input('quantity', sql.Int, variationQuantity)
                    .query('UPDATE Products SET StockQuantity = StockQuantity - @quantity, UpdatedAt = GETDATE() WHERE ProductID = @productID');

                await transaction.commit();

                // Log the activity
                await logActivity(
                    req.session.user.id,
                    'INSERT',
                    'ProductVariations',
                    variationID,
                    `Variation "${variationName}" created. Product stock decreased by ${variationQuantity}.`
                );

                res.json({ success: true, message: `Variation added successfully. Product stock decreased by ${variationQuantity}.`, variationID });
            } catch (err) {
                await transaction.rollback();
                throw err;
            }
        } catch (err) {
            console.error('Error adding variation:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to add variation',
                error: err.message
            });
        }
    });

    router.post('/Employee/UserManager/UserVariations/Edit', isAuthenticated, variationUpload.single('variationImage'), async (req, res) => {
        try {
            await pool.connect();
            const { variationID, variationName, color, quantity, productID, isActive } = req.body;

            // Handle image upload
            let imageUrl = null;
            if (req.file) {
                // Get current variation image URL before updating
                const currentVariation = await pool.request()
                    .input('variationID', sql.Int, variationID)
                    .query('SELECT VariationImageURL FROM ProductVariations WHERE VariationID = @variationID');

                const currentImageUrl = currentVariation.recordset[0]?.VariationImageURL;

                // Delete old variation image
                await deleteOldImageFile(currentImageUrl);

                imageUrl = publicUrlFromMulterVariationFile(req.file);
            } else {
                // If no new image uploaded, keep existing image
                const existingResult = await pool.request()
                    .input('variationID', sql.Int, variationID)
                    .query('SELECT VariationImageURL FROM ProductVariations WHERE VariationID = @variationID');

                if (existingResult.recordset.length > 0) {
                    imageUrl = existingResult.recordset[0].VariationImageURL;
                }
            }

            await pool.request()
                .input('variationID', sql.Int, variationID)
                .input('variationName', sql.NVarChar, variationName)
                .input('color', sql.NVarChar, color || null)
                .input('quantity', sql.Int, parseInt(quantity))
                .input('imageUrl', sql.NVarChar, imageUrl)
                .input('isActive', sql.Bit, isActive === '1' ? 1 : 0)
                .query(`
                    UPDATE ProductVariations 
                    SET VariationName = @variationName, Color = @color, Quantity = @quantity, 
                        VariationImageURL = @imageUrl, IsActive = @isActive
                    WHERE VariationID = @variationID
                `);

            // Log the activity
            await logActivity(
                req.session.user.id,
                'UPDATE',
                'ProductVariations',
                variationID,
                `Variation "${variationName}" updated`
            );

            res.json({ success: true, message: 'Variation updated successfully' });
        } catch (err) {
            console.error('Error updating variation:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to update variation',
                error: err.message
            });
        }
    });

    router.post('/Employee/UserManager/UserVariations/Delete/:id', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const variationID = req.params.id;

            // Get variation info including ProductID, VariationName, Quantity, and IsActive status
            const variationResult = await pool.request()
                .input('variationID', sql.Int, variationID)
                .query('SELECT ProductID, VariationName, Quantity, IsActive FROM ProductVariations WHERE VariationID = @variationID');

            if (variationResult.recordset.length === 0) {
                return res.status(404).json({ success: false, message: 'Variation not found' });
            }

            const variation = variationResult.recordset[0];
            const productID = variation.ProductID;
            const variationName = variation.VariationName;
            const variationQuantity = variation.Quantity || 0;
            const wasActive = variation.IsActive === 1;

            // Start transaction to ensure both variation delete and stock update succeed or fail together
            const transaction = new sql.Transaction(pool);
            await transaction.begin();

            try {
                // Deactivate the variation instead of deleting
                await transaction.request()
                    .input('variationID', sql.Int, variationID)
                    .query('UPDATE ProductVariations SET IsActive = 0 WHERE VariationID = @variationID');

                // If variation was active, restore product stock by variation quantity
                if (wasActive && variationQuantity > 0) {
                    await transaction.request()
                        .input('productID', sql.Int, productID)
                        .input('quantity', sql.Int, variationQuantity)
                        .query('UPDATE Products SET StockQuantity = StockQuantity + @quantity, UpdatedAt = GETDATE() WHERE ProductID = @productID');
                }

                await transaction.commit();

                // Log the activity
                const logMessage = wasActive && variationQuantity > 0
                    ? `Variation "${variationName}" deactivated. Product stock restored by ${variationQuantity}.`
                    : `Variation "${variationName}" deactivated`;

                await logActivity(
                    req.session.user.id,
                    'DELETE',
                    'ProductVariations',
                    variationID,
                    logMessage,
                    JSON.stringify({ IsActive: { old: wasActive ? 1 : 0, new: 0 } })
                );

                res.json({
                    success: true,
                    message: wasActive && variationQuantity > 0 ? `Variation deactivated successfully. Product stock restored by ${variationQuantity}.` : 'Variation deactivated successfully'
                });
            } catch (err) {
                await transaction.rollback();
                throw err;
            }
        } catch (err) {
            console.error('Error deactivating variation:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to deactivate variation',
                error: err.message
            });
        }
    });

    // User Manager - Delivery Rates CRUD
    router.post('/Employee/UserManager/UserRates/Add', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const { serviceType, basePrice, isActive } = req.body;

            const result = await pool.request()
                .input('serviceType', sql.NVarChar, serviceType)
                .input('basePrice', sql.Decimal(10, 2), parseFloat(basePrice))
                .input('isActive', sql.Bit, isActive === '1' ? 1 : 0)
                .input('createdByUserID', sql.Int, req.session.user?.id || null)
                .input('createdByUsername', sql.NVarChar, req.session.user?.username || 'System')
                .query(`
                    INSERT INTO DeliveryRates (ServiceType, Price, IsActive, CreatedAt, CreatedByUserID, CreatedByUsername)
                    OUTPUT INSERTED.RateID
                    VALUES (@serviceType, @basePrice, @isActive, GETDATE(), @createdByUserID, @createdByUsername)
                `);

            const rateId = result.recordset[0].RateID;

            res.json({ success: true, message: 'Delivery rate added successfully', rateId });
        } catch (err) {
            console.error('Error adding delivery rate:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to add delivery rate',
                error: err.message
            });
        }
    });
    router.post('/Employee/UserManager/UserRates/Update/:rateId', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const { rateId } = req.params;
            const { serviceType, basePrice, isActive } = req.body;

            await pool.request()
                .input('rateId', sql.Int, rateId)
                .input('serviceType', sql.NVarChar, serviceType)
                .input('basePrice', sql.Decimal(10, 2), parseFloat(basePrice))
                .input('isActive', sql.Bit, isActive === '1' ? 1 : 0)
                .query(`
                    UPDATE DeliveryRates 
                    SET ServiceType = @serviceType, Price = @basePrice, IsActive = @isActive
                    WHERE RateID = @rateId
                `);

            res.json({ success: true, message: 'Delivery rate updated successfully' });
        } catch (err) {
            console.error('Error updating delivery rate:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to update delivery rate',
                error: err.message
            });
        }
    });

    // User Manager - Stock Update
    router.post('/Employee/UserManager/UserProducts/UpdateStock', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const { productId, newStock } = req.body;

            // Get current stock quantity before updating
            const currentStockResult = await pool.request()
                .input('productId', sql.Int, productId)
                .query('SELECT StockQuantity FROM Products WHERE ProductID = @productId');

            if (currentStockResult.recordset.length === 0) {
                return res.json({
                    success: false,
                    message: 'Product not found.'
                });
            }

            const oldStock = currentStockResult.recordset[0].StockQuantity;

            await pool.request()
                .input('productId', sql.Int, productId)
                .input('newStock', sql.Int, newStock)
                .query(`
                    UPDATE Products 
                    SET StockQuantity = @newStock, UpdatedAt = GETDATE()
                    WHERE ProductID = @productId
                `);

            // Log the activity with actual changes
            const changes = JSON.stringify({
                StockQuantity: {
                    old: oldStock,
                    new: newStock
                }
            });

            await logActivity(
                req.session.user.id,
                'UPDATE',
                'Products',
                productId,
                `UserManager updated stock quantity from ${oldStock} to ${newStock} for product ID: ${productId}`,
                changes
            );

            res.json({ success: true, message: 'Stock updated successfully' });
        } catch (err) {
            console.error('Error updating stock:', err);
            res.status(500).json({
                success: false,
                message: 'Failed to update stock',
                error: err.message
            });
        }
    });
};
