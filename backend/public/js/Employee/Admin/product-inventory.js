/* Admin Product Inventory — external script for faster caching */
(function () {
'use strict';
        function getStockQtyClass(qty) {
            const n = Number(qty) || 0;
            if (n < 0) return 'stock-qty-negative';
            if (n === 0) return 'stock-qty-out';
            if (n <= 10) return 'stock-qty-critical';
            if (n <= 20) return 'stock-qty-low';
            return 'stock-qty-normal';
        }
        function formatStockQty(qty) {
            const n = Number(qty) || 0;
            return '<span class="stock-qty ' + getStockQtyClass(n) + '">' + n + '</span>';
        }
        function formatAvailableQty(qty) {
            const n = Number(qty) || 0;
            return '<span class="stock-qty stock-qty-available">' + n + '</span>';
        }

        // Show custom popup
        function showCustomPopup(message, isError) {
            const popup = document.getElementById('customPopup');
            if (!popup) {
                console.warn('[ProductInventory]', message);
                return;
            }
            const popupMessage = popup.querySelector('.custom-popup-message');
            const popupIcon = popup.querySelector('.custom-popup-icon');
            if (popupMessage) popupMessage.textContent = message;
            if (popupIcon) popupIcon.textContent = isError ? '✕' : '✓';
            popup.className = 'custom-popup' + (isError ? ' error' : '');
            popup.style.display = 'block';
            setTimeout(function () {
                popup.style.display = 'none';
            }, 3000);
        }

        /** Toast inside Manage Variations modal (element lives in AdminProductInventory.ejs). */
        function showVariationModalNotification(message, isError) {
            const notification = document.getElementById('variationModalNotification');
            if (!notification) {
                showCustomPopup(message, Boolean(isError));
                return;
            }
            const notificationMessage = notification.querySelector('.modal-notification-message');
            const notificationIcon = notification.querySelector('.modal-notification-icon');
            if (notificationMessage) notificationMessage.textContent = message || '';
            if (notificationIcon) notificationIcon.textContent = isError ? '✕' : '✓';
            notification.className = 'modal-notification' + (isError ? ' error' : '');
            notification.style.display = 'block';
            setTimeout(function () {
                if (notification) notification.style.display = 'none';
            }, 3000);
        }

        function notifyVariationModal(message, isError) {
            if (typeof showVariationModalNotification === 'function') {
                showVariationModalNotification(message, isError);
            } else {
                showCustomPopup(message, isError);
            }
        }

        window.showCustomPopup = showCustomPopup;
        window.showVariationModalNotification = showVariationModalNotification;

        function archiveVariation(variationId, variationName) {
            if (!confirm('Are you sure you want to archive "' + (variationName || 'this variation') + '"? This will move it to the Archived page.')) {
                return;
            }
            fetch('/api/admin/inventory-product-variations/archive/' + variationId, { method: 'POST' })
                .then(function (response) { return response.json(); })
                .then(function (result) {
                    if (result.success) {
                        showCustomPopup('Variation archived successfully!');
                        const productIdToReload = currentSelectedProductId || window.currentVariationProductId;
                        if (productIdToReload) {
                            notifyInventoryStockChanged(productIdToReload);
                        }
                    } else {
                        showCustomPopup('Failed to archive variation: ' + (result.message || 'Unknown error'), true);
                    }
                })
                .catch(function (error) {
                    console.error('Error archiving variation:', error);
                    showCustomPopup('Failed to archive variation', true);
                });
        }
        window.archiveVariation = archiveVariation;

        const addInventoryItemBtn = document.getElementById('addInventoryItemBtn');
let currentSelectedProductId = null;
        let currentSelectedProductName = null;

        if (addInventoryItemBtn) addInventoryItemBtn.style.display = 'inline-block';
const urlParams = new URLSearchParams(window.location.search);
        const urlInventoryProductId = urlParams.get('inventoryProductId');

        function escapeHtml(str) {
            if (str == null) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        }

        function getInventoryListSearchFilter() {
            const filterCard = document.querySelector('.inventory-filter-card');
            if (filterCard && filterCard.dataset.inventorySearch != null) {
                return filterCard.dataset.inventorySearch;
            }
            const productsTab = document.getElementById('productsTab');
            if (productsTab && productsTab.dataset.searchFilter != null) {
                return productsTab.dataset.searchFilter;
            }
            return new URLSearchParams(window.location.search).get('search') || '';
        }

        function filterVariationsForListSearch(variations) {
            const search = String(getInventoryListSearchFilter() || '').trim().toLowerCase();
            if (!search || !Array.isArray(variations)) return variations;
            const matched = variations.filter(function (v) {
                return String(v.SKU || '').toLowerCase().includes(search) ||
                    String(v.VariationName || '').toLowerCase().includes(search);
            });
            return matched.length > 0 ? matched : variations;
        }

        function inventoryStatusLabel(status) {
            if (status === 'no_stock') return 'No Stock';
            if (!status) return 'Available';
            return status.charAt(0).toUpperCase() + status.slice(1);
        }

        function inventoryStatusClass(status) {
            if (status === 'available') return 'status-available';
            if (status === 'damaged') return 'status-damaged';
            if (status === 'returned') return 'status-returned';
            if (status === 'repaired') return 'status-repaired';
            if (status === 'no_stock') return 'status-disposed';
            return 'status-disposed';
        }

        function updateProductRowFromSummary(summary) {
            if (!summary || !summary.inventoryProductId) return;
            const row = document.querySelector(
                'tr[data-inventory-product-id="' + summary.inventoryProductId + '"]:not(.variations-row)'
            );
            if (!row) return;
            const qtyCells = row.querySelectorAll('td.qty-col .stock-qty');
            if (qtyCells[0]) {
                qtyCells[0].textContent = summary.totalQuantity;
                qtyCells[0].className = 'stock-qty ' + getStockQtyClass(summary.totalQuantity);
            }
            if (qtyCells[1]) {
                qtyCells[1].textContent = summary.availableQuantity;
                qtyCells[1].className = 'stock-qty stock-qty-available';
            }
            const badge = row.querySelector('.status-badge');
            if (badge && summary.inventoryStatus) {
                badge.className = 'status-badge ' + inventoryStatusClass(summary.inventoryStatus);
                badge.textContent = inventoryStatusLabel(summary.inventoryStatus);
            }
        }

        function updateRawMaterialsTableFromList(materials) {
            if (!Array.isArray(materials)) return;
            allRawMaterials = materials;
            const tbody = document.querySelector('#rawMaterialsTable tbody');
            if (!tbody) return;
            materials.forEach(function (m) {
                const tr = tbody.querySelector('tr[data-material-id="' + m.id + '"]');
                if (!tr) return;
                const span = tr.querySelector('td.qty-col .stock-qty');
                if (span) {
                    const n = Number(m.stockQuantity) || 0;
                    span.textContent = n;
                    span.className = 'stock-qty ' + getStockQtyClass(n);
                }
            });
        }

        function applyStockRefreshPayload(payload) {
            if (!payload) return;
            if (payload.summary) updateProductRowFromSummary(payload.summary);
            if (payload.materials) updateRawMaterialsTableFromList(payload.materials);
        }

        function getVariationsContainerEl(inventoryProductId) {
            return document.querySelector('.variations-container[data-inventory-product-id="' + inventoryProductId + '"]');
        }

        function renderInventoryVariationsInRow(inventoryProductId, variations) {
            const container = getVariationsContainerEl(inventoryProductId);
            if (!container) return;
            const loadingDiv = container.querySelector('.variations-loading');
            const tableContainer = container.querySelector('.variations-table-container');
            const emptyDiv = container.querySelector('.variations-empty');
            const tableBody = container.querySelector('.variations-table-body');
            if (!tableBody) return;

            if (!variations || variations.length === 0) {
                if (loadingDiv) loadingDiv.style.display = 'none';
                if (tableContainer) tableContainer.style.display = 'none';
                if (emptyDiv) emptyDiv.style.display = 'block';
                tableBody.innerHTML = '';
                return;
            }

            tableBody.innerHTML = variations.map(function(variation) {
                const imageUrl = variation.VariationImageURL || '/images/placeholder-no-image.svg';
                const isActive = variation.IsActive !== false && variation.IsActive !== 0 && variation.IsActive !== '0';
                const statusBadge = isActive
                    ? '<span class="status-badge status-available">Active</span>'
                    : '<span class="status-badge status-disposed">Inactive</span>';
                const price = variation.Price
                    ? '₱' + parseFloat(variation.Price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : 'N/A';
                const variationName = variation.VariationName || 'N/A';
                const variationNameEscaped = variationName.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                const variationId = variation.VariationID || 0;
                const baseQuantity = variation.Quantity || 0;
                let availableQty = variation.AvailableQuantity;
                if ((availableQty === null || availableQty === undefined || availableQty === 0) && baseQuantity > 0) {
                    availableQty = baseQuantity;
                } else {
                    availableQty = availableQty || 0;
                }
                const damagedQty = variation.DamagedQuantity || 0;
                const returnedQty = variation.ReturnedQuantity || 0;
                const repairedQty = variation.RepairedQuantity || 0;
                const disposedQty = variation.DisposedQuantity || 0;
                const calculatedTotal = availableQty + damagedQty;
                const totalQty = calculatedTotal > 0 ? calculatedTotal : baseQuantity;
                const color = variation.Color || 'N/A';
                const variationSku = variation.SKU || '—';
                return '<tr>' +
                    '<td><strong>' + escapeHtml(variationName) + '</strong></td>' +
                    '<td><code style="font-size:0.85em;">' + escapeHtml(variationSku) + '</code></td>' +
                    '<td>' + escapeHtml(color) + '</td>' +
                    '<td class="qty-col">' + formatStockQty(totalQty) + '</td>' +
                    '<td class="qty-col">' + formatAvailableQty(availableQty) + '</td>' +
                    '<td style="text-align:center;">' + (damagedQty > 0 ? '<span class="status-badge status-damaged">' + damagedQty + '</span>' : '<span style="color:#999;">0</span>') + '</td>' +
                    '<td style="text-align:center;">' + (returnedQty > 0 ? '<span class="status-badge status-returned">' + returnedQty + '</span>' : '<span style="color:#999;">0</span>') + '</td>' +
                    '<td style="text-align:center;">' + (repairedQty > 0 ? '<span class="status-badge status-repaired">' + repairedQty + '</span>' : '<span style="color:#999;">0</span>') + '</td>' +
                    '<td style="text-align:center;">' + (disposedQty > 0 ? '<span class="status-badge status-disposed">' + disposedQty + '</span>' : '<span style="color:#999;">0</span>') + '</td>' +
                    '<td style="text-align:center;">' + price + '</td>' +
                    '<td style="text-align:center;"><img src="' + escapeHtml(imageUrl) + '" alt="Variation" style="width:50px;height:50px;object-fit:cover;border-radius:4px;border:1px solid #ddd;" onerror="this.src=\'/images/placeholder-no-image.svg\'"></td>' +
                    '<td style="text-align:center;">' + statusBadge + '</td>' +
                    '<td style="text-align:center;">' +
                    '<div style="display:flex;gap:4px;justify-content:center;align-items:center;flex-wrap:wrap;">' +
                    '<input type="number" id="restock-qty-' + variationId + '" min="1" value="1" style="width:52px;padding:4px;border:1px solid #ced4da;border-radius:4px;text-align:center;">' +
                    '<button type="button" class="variation-restock-btn" data-variation-id="' + variationId + '" data-inventory-product-id="' + inventoryProductId + '" style="background:#17a2b8;color:#fff;border:none;padding:5px 8px;border-radius:4px;cursor:pointer;font-size:0.85em;">Add</button>' +
                    '</div></td>' +
                    '<td style="text-align:center;"><div style="display:flex;gap:5px;justify-content:center;flex-wrap:wrap;">' +
                    '<button type="button" class="edit-variation-status-btn" data-variation-id="' + variationId + '" title="Edit Variation Status" style="background-color:#ffc107;color:#000;border:none;padding:5px 8px;border-radius:4px;cursor:pointer;">Edit</button>' +
                    '<button type="button" class="archive-variation-btn" data-variation-id="' + variationId + '" data-variation-name="' + escapeHtml(variationName) + '" title="Archive Variation">Archive</button>' +
                    '</div></td></tr>';
            }).join('');

            if (loadingDiv) loadingDiv.style.display = 'none';
            if (tableContainer) tableContainer.style.display = 'block';
            if (emptyDiv) emptyDiv.style.display = 'none';
        }

        async function loadInventoryProductVariations(inventoryProductId) {
            if (!inventoryProductId) return;
            const container = getVariationsContainerEl(inventoryProductId);
            if (!container) return;
            const loadingDiv = container.querySelector('.variations-loading');
            const tableContainer = container.querySelector('.variations-table-container');
            const emptyDiv = container.querySelector('.variations-empty');
            if (loadingDiv) {
                loadingDiv.style.display = 'block';
                loadingDiv.innerHTML = '<p>Loading variations...</p>';
            }
            if (tableContainer) tableContainer.style.display = 'none';
            if (emptyDiv) emptyDiv.style.display = 'none';

            try {
                const response = await fetch('/api/admin/inventory-product-variations/' + inventoryProductId);
                const result = await response.json();
                if (result.success) {
                    const variations = result.variations || [];
                    window.currentProductStockInfo = {
                        productStock: result.productStock || 0,
                        availableStock: result.availableStock || 0,
                        totalVariationQuantity: result.totalVariationQuantity || 0
                    };
                    window.currentVariations = variations;
                    window.currentVariationProductId = inventoryProductId;
                    if (result.parentProductPrice != null) {
                        window.currentParentProductPrice = result.parentProductPrice;
                    }
                    if (result.parentRecipeMaterials && result.parentRecipeMaterials.length) {
                        window.currentParentRecipeMaterials = mapApiMaterialsToRecipe(result.parentRecipeMaterials);
                    }
                    renderInventoryVariationsInRow(
                        inventoryProductId,
                        filterVariationsForListSearch(variations)
                    );
                } else {
                    if (loadingDiv) {
                        loadingDiv.style.display = 'block';
                        loadingDiv.innerHTML = '<p style="color:#dc3545;">' + escapeHtml(result.message || 'Failed to load variations') + '</p>';
                    }
                }
            } catch (err) {
                console.error('Error loading variations:', err);
                if (loadingDiv) {
                    loadingDiv.style.display = 'block';
                    loadingDiv.innerHTML = '<p style="color:#dc3545;">Error loading variations. Please try again.</p>';
                }
            }
        }

        function refreshProductVariationsUI(inventoryProductId) {
            if (!inventoryProductId) return;
            const row = document.querySelector('tr.variations-row[data-inventory-product-id="' + inventoryProductId + '"]');
            if (row && row.style.display !== 'none') {
                loadInventoryProductVariations(inventoryProductId);
            }
            const variationsModal = document.getElementById('variationsModal');
            if (variationsModal && variationsModal.style.display === 'block' && typeof loadVariations === 'function') {
                loadVariations(inventoryProductId, false);
            }
        }

        window.loadVariationsForTable = loadInventoryProductVariations;
        window.refreshProductVariationsUI = refreshProductVariationsUI;

        async function notifyInventoryStockChanged(inventoryProductId, payload) {
            if (payload && (payload.summary || payload.materials)) {
                applyStockRefreshPayload(payload);
            } else if (inventoryProductId) {
                try {
                    const [summaryRes, materialsRes] = await Promise.all([
                        fetch('/api/admin/inventory-products/' + inventoryProductId + '/summary', { credentials: 'include' }),
                        fetch('/api/rawmaterials', { credentials: 'include', headers: { 'Content-Type': 'application/json' } })
                    ]);
                    const summaryData = await summaryRes.json();
                    const materialsData = await materialsRes.json();
                    if (summaryData.success && summaryData.summary) {
                        updateProductRowFromSummary(summaryData.summary);
                    }
                    if (materialsData.success) {
                        updateRawMaterialsTableFromList(materialsData.materials);
                    }
                } catch (err) {
                    console.error('Stock refresh failed:', err);
                }
            } else {
                await fetchRawMaterialsForInventory();
                updateRawMaterialsTableFromList(allRawMaterials);
            }
            if (inventoryProductId) refreshProductVariationsUI(inventoryProductId);
        }
        window.notifyInventoryStockChanged = notifyInventoryStockChanged;

        document.addEventListener('click', function(e) {
            const toggleBtn = e.target.closest('.toggle-variations-btn');
            if (toggleBtn) {
                const inventoryProductId = toggleBtn.getAttribute('data-inventory-product-id');
                const variationsRow = document.querySelector('tr.variations-row[data-inventory-product-id="' + inventoryProductId + '"]');
                if (variationsRow) {
                    const isVisible = variationsRow.style.display !== 'none';
                    variationsRow.style.display = isVisible ? 'none' : 'table-row';
                    toggleBtn.classList.toggle('expanded', !isVisible);
                    if (!isVisible) loadInventoryProductVariations(inventoryProductId);
                }
                return;
            }
            const refreshBtn = e.target.closest('.refresh-variations-btn');
            if (refreshBtn) {
                loadInventoryProductVariations(refreshBtn.getAttribute('data-inventory-product-id'));
                return;
            }
            const addRowBtn = e.target.closest('.add-variation-row-btn');
            if (addRowBtn) {
                const productId = addRowBtn.getAttribute('data-id');
                const productName = addRowBtn.getAttribute('data-name');
                currentSelectedProductId = productId;
                currentSelectedProductName = productName;
                openAddVariationModal(productId, productName, false);
                return;
            }
            const restockBtn = e.target.closest('.variation-restock-btn');
            if (restockBtn && restockBtn.dataset.variationId) {
                const vid = parseInt(restockBtn.dataset.variationId, 10);
                const ipid = parseInt(restockBtn.dataset.inventoryProductId, 10);
                if (vid && ipid && typeof window.restockVariationInline === 'function') {
                    window.restockVariationInline(vid, ipid, restockBtn);
                }
                return;
            }
            const editVarBtn = e.target.closest('.edit-variation-status-btn[data-variation-id]');
            if (editVarBtn) {
                const vid = parseInt(editVarBtn.dataset.variationId, 10);
                if (vid && typeof window.editVariationStatus === 'function') {
                    window.editVariationStatus(vid);
                }
                return;
            }
            const archiveVarBtn = e.target.closest('.archive-variation-btn');
            if (archiveVarBtn) {
                const vid = parseInt(archiveVarBtn.dataset.variationId, 10);
                const vname = archiveVarBtn.dataset.variationName || 'Variation';
                if (vid && typeof window.archiveVariation === 'function') {
                    window.archiveVariation(vid, vname, 0);
                }
                return;
            }
        });

        function expandInventoryProductVariations(inventoryProductId, openModal) {
            if (!inventoryProductId) return;
            const toggleBtn = document.querySelector('.toggle-variations-btn[data-inventory-product-id="' + inventoryProductId + '"]');
            const variationsRow = document.querySelector('tr.variations-row[data-inventory-product-id="' + inventoryProductId + '"]');
            if (variationsRow) {
                variationsRow.style.display = 'table-row';
                if (toggleBtn) toggleBtn.classList.add('expanded');
                loadInventoryProductVariations(inventoryProductId);
            }
            currentSelectedProductId = inventoryProductId;
            if (openModal) {
                const productRow = document.querySelector('tr[data-inventory-product-id="' + inventoryProductId + '"]:not(.variations-row)');
                const productName = productRow ? (productRow.getAttribute('data-product-name') || 'Product') : 'Product';
                openAddVariationModal(inventoryProductId, productName, false);
            }
        }

        if (urlInventoryProductId) {
            document.addEventListener('DOMContentLoaded', function() {
                expandInventoryProductVariations(urlInventoryProductId, urlParams.has('variationID') || urlParams.get('tab') === 'variations');
            });
        }

        function openAddVariationModal(productId, productName, isFromProductsTable) {
            currentSelectedProductId = productId;
            currentSelectedProductName = productName || 'Product';
            const variationInventoryProductID = document.getElementById('variationInventoryProductID');
            const variationProductID = document.getElementById('variationProductID');
            if (isFromProductsTable) {
                if (variationProductID) variationProductID.value = productId;
                if (variationInventoryProductID) variationInventoryProductID.value = '';
            } else {
                if (variationInventoryProductID) variationInventoryProductID.value = productId;
                if (variationProductID) variationProductID.value = '';
            }
            currentVariationProductId = productId;
            currentVariationIsFromProducts = false;
            const variationsModalTitleEl = document.getElementById('variationsModalTitle');
            if (variationsModalTitleEl) variationsModalTitleEl.textContent = 'Manage Variations - ' + (productName || 'Product');
            if (productId) {
                loadVariations(productId, false).catch(function(err) { console.error(err); });
                loadParentRecipeForAddVariation(productId).catch(function (err) { console.error(err); });
            }
            const variationsModal = document.getElementById('variationsModal');
            if (variationsModal) {
                variationsModal.style.display = 'block';
                const addVariationForm = document.getElementById('addVariationForm');
                if (addVariationForm) {
                    addVariationForm.reset();
                    if (variationInventoryProductID) variationInventoryProductID.value = productId;
                    if (variationProductID) variationProductID.value = '';
                }
            } else {
                showCustomPopup('Variations modal not found. Please refresh the page.', true);
            }
        }
        window.openAddVariationModal = openAddVariationModal;


        // Add Inventory Item Modal (addInventoryItemBtn already declared in tab navigation section above)
        const addProductModal = document.getElementById('addProductModal');
        const closeAddModal = document.getElementById('closeAddModal');
        const cancelAddProduct = document.getElementById('cancelAddProduct');

        if (addInventoryItemBtn && addProductModal) {
            addInventoryItemBtn.addEventListener('click', () => {
                document.getElementById('addProductForm')?.reset();
                resetCreateProductVariations();
                resetCreateInventoryMaterials();
                const createVarList = document.getElementById('createProductVariationsList');
                if (createVarList) createVarList.appendChild(buildCreateProductVariationRow());
                updateCreateVariationTotalSummary();
                const createMatContainer = document.getElementById('createInventoryMaterialsContainer');
                if (createMatContainer && allRawMaterials.length > 0) {
                    createMatContainer.appendChild(createCreateInventoryMaterialRow());
                }
                addProductModal.style.display = 'block';
            });
        }

        if (closeAddModal) {
            closeAddModal.addEventListener('click', () => {
                if (addProductModal) addProductModal.style.display = 'none';
                resetCreateProductVariations();
                resetCreateInventoryMaterials();
});
        }

        if (cancelAddProduct) {
            cancelAddProduct.addEventListener('click', () => {
                if (addProductModal) addProductModal.style.display = 'none';
                resetCreateProductVariations();
                resetCreateInventoryMaterials();
});
        }
        // Handle form submissions with dimensions

        function appendVariationMediaToFormData(formData, rowOrForm) {
            const main = rowOrForm.querySelector?.('.variation-main-image') || rowOrForm.querySelector?.('#variationMainImage') || rowOrForm.querySelector?.('#editVariationStatusMainImage');
            const thumbs = rowOrForm.querySelector?.('.variation-thumbnails') || rowOrForm.querySelector?.('#variationThumbnails') || rowOrForm.querySelector?.('#editVariationStatusThumbnails');
            const model = rowOrForm.querySelector?.('.variation-model3d') || rowOrForm.querySelector?.('#variationModel3d') || rowOrForm.querySelector?.('#editVariationStatusModel3d');
            formData.delete('variationMainImage');
            formData.delete('variationThumbnail');
            formData.delete('variationThumbnails');
            formData.delete('variationModel3d');
            if (main?.files?.[0]) formData.append('variationMainImage', main.files[0]);
            if (thumbs?.files?.length) {
                Array.from(thumbs.files).slice(0, 4).forEach((file) => formData.append('variationThumbnail', file));
            }
            if (model?.files?.[0]) formData.append('variationModel3d', model.files[0]);
        }

        function renderVariationMediaPreviews(container, data) {
            if (!container) return;
            let html = '';
            if (data.mainImage) {
                html += '<p style="margin:4px 0;font-weight:600;">Main image</p><img src="' + data.mainImage + '" style="max-width:120px;max-height:120px;border-radius:4px;border:1px solid #ddd;margin-bottom:8px;">';
            }
            if (data.thumbnails && data.thumbnails.length) {
                html += '<p style="margin:4px 0;font-weight:600;">Thumbnails</p><div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">';
                data.thumbnails.forEach((url) => {
                    html += '<img src="' + url + '" style="width:56px;height:56px;object-fit:cover;border-radius:4px;border:1px solid #ddd;">';
                });
                html += '</div>';
            }
            if (data.model3d) {
                html += '<p style="margin:4px 0;font-size:0.85em;color:#666;">3D model: ' + data.model3d + '</p>';
            }
            container.innerHTML = html || '<em style="color:#888;">No media uploaded yet</em>';
        }

        function parseThumbnailUrls(raw) {
            if (!raw) return [];
            try {
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                return Array.isArray(parsed) ? parsed : [];
            } catch (e) {
                return String(raw).includes(',') ? raw.split(',').map((x) => x.trim()).filter(Boolean) : (raw ? [raw] : []);
            }
        }

        function buildCreateProductVariationRow() {
            const row = document.createElement('div');
            row.className = 'create-product-variation-row';
                        row.style.cssText = 'display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; align-items: start; margin-bottom: 14px; padding: 12px; border: 1px solid #e9ecef; border-radius: 6px; background: #fff;';
            row.innerHTML = `
                <div style="grid-column: span 2;">
                    <label style="font-size: 0.85em;">Variation Name</label>
                    <input type="text" class="create-variation-name" required placeholder="e.g. Red" style="width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;">
                </div>
                <div>
                    <label style="font-size: 0.85em;">Color</label>
                    <input type="text" class="create-variation-color" placeholder="e.g. Red" style="width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;">
                </div>
                <div>
                    <label style="font-size: 0.85em;">Quantity</label>
                    <input type="number" class="create-variation-quantity" min="1" value="1" required style="width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;">
                </div>
                <div style="grid-column: span 2;">
                    <label style="font-size: 0.85em;">Main Image</label>
                    <input type="file" class="create-variation-main-image variation-main-image" accept="image/*" style="width: 100%; font-size: 0.8em;">
                </div>
                <div style="grid-column: span 2;">
                    <label style="font-size: 0.85em;">Thumbnails (up to 4)</label>
                    <input type="file" class="create-variation-thumbnails variation-thumbnails" accept="image/*" multiple style="width: 100%; font-size: 0.8em;">
                </div>
                <div style="grid-column: span 3;">
                    <label style="font-size: 0.85em;">3D Model (GLB/GLTF)</label>
                    <input type="file" class="create-variation-model3d variation-model3d" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" style="width: 100%; font-size: 0.8em;">
                </div>
                <div style="display:flex;align-items:end;justify-content:flex-end;">
                    <button type="button" class="remove-create-variation-btn" title="Remove" style="background: #dc3545; color: white; border: none; border-radius: 4px; height: 34px; width: 34px; cursor: pointer;">×</button>
                </div>
            `;
            row.querySelector('.remove-create-variation-btn').addEventListener('click', () => {
                row.remove();
                updateCreateVariationTotalSummary();
            });
            row.querySelector('.create-variation-quantity')?.addEventListener('input', updateCreateVariationTotalSummary);
            return row;
        }

        function updateCreateVariationTotalSummary() {
            const summary = document.getElementById('createVariationTotalSummary');
            if (!summary) return;
            const total = collectCreateProductVariations().reduce((sum, v) => sum + (v.quantity || 0), 0);
            summary.textContent = 'Total quantity: ' + total;
        }

        function getCreateProductUnitPrice() {
            const priceVal = parseFloat(document.getElementById('price')?.value);
            return (!Number.isNaN(priceVal) && priceVal > 0) ? priceVal : null;
        }

        function collectCreateProductVariations() {
            const unitPrice = getCreateProductUnitPrice();
            const rows = document.querySelectorAll('#createProductVariationsList .create-product-variation-row');
            const variations = [];
            rows.forEach(row => {
                const name = row.querySelector('.create-variation-name')?.value?.trim();
                const quantity = parseInt(row.querySelector('.create-variation-quantity')?.value, 10);
                if (!name || !quantity || quantity <= 0 || unitPrice == null) return;
                const mainInput = row.querySelector('.create-variation-main-image');
                const thumbInput = row.querySelector('.create-variation-thumbnails');
                const modelInput = row.querySelector('.create-variation-model3d');
                const thumbFiles = thumbInput?.files ? Array.from(thumbInput.files).slice(0, 4) : [];
                variations.push({
                    variationName: name,
                    color: row.querySelector('.create-variation-color')?.value?.trim() || '',
                    quantity,
                    price: unitPrice,
                    thumbCount: thumbFiles.length,
                    hasMainImage: !!(mainInput?.files?.length),
                    hasModel3d: !!(modelInput?.files?.length)
                });
            });
            return variations;
        }

        function resetCreateProductVariations() {
            const list = document.getElementById('createProductVariationsList');
            if (list) list.innerHTML = '';
            const jsonField = document.getElementById('variationsJson');
            if (jsonField) jsonField.value = '';
            updateCreateVariationTotalSummary();
        }

        window.restockVariationInline = async function(variationId, inventoryProductId, buttonEl) {
            const qtyInput = document.getElementById('restock-qty-' + variationId);
            const quantity = parseInt(qtyInput?.value, 10);
            if (!variationId || !inventoryProductId || !quantity || quantity <= 0) {
                showCustomPopup('Enter a positive restock quantity.', true);
                return;
            }
            if (!allRawMaterials.length) await fetchRawMaterialsForInventory();
            const recipe = await fetchInventoryRecipeMaterials(inventoryProductId);
            const stockCheck = validateRecipeMaterialsStock(recipe, quantity);
            if (!stockCheck.ok) {
                showCustomPopup(stockCheck.message, true);
                return;
            }
            if (buttonEl) { buttonEl.disabled = true; buttonEl.textContent = '...'; }
            try {
                const response = await fetch('/api/admin/inventory-products/restock', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ inventoryProductId, variationId, quantity })
                });
                const result = await response.json();
                if (result.success) {
                    showCustomPopup(result.message || 'Restock successful.');
                    await notifyInventoryStockChanged(inventoryProductId, result);
                } else {
                    showCustomPopup(result.message || 'Restock failed.', true);
                }
            } catch (err) {
                showCustomPopup('Restock failed: ' + err.message, true);
            } finally {
                if (buttonEl) { buttonEl.disabled = false; buttonEl.textContent = 'Add'; }
            }
        };

        let allRawMaterials = [];

        async function fetchRawMaterialsForInventory() {
            try {
                const response = await fetch('/api/rawmaterials', {
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' }
                });
                const data = await response.json();
                if (data.success) {
                    allRawMaterials = data.materials || [];
                    updateRawMaterialsTableFromList(allRawMaterials);
                }
            } catch (error) {
                console.error('Error fetching raw materials:', error);
            }
        }
        fetchRawMaterialsForInventory();

        function getMaterialStockQty(material) {
            if (!material) return 0;
            return Number(material.stockQuantity ?? material.QuantityAvailable ?? 0) || 0;
        }

        function formatMaterialOptionLabel(material) {
            return material.name + ' (stock: ' + getMaterialStockQty(material) + ')';
        }

        function validateRecipeMaterialsStock(recipeMaterials, unitsToStock) {
            const units = Math.max(0, parseInt(unitsToStock, 10) || 0);
            if (!recipeMaterials || recipeMaterials.length === 0 || units <= 0) return { ok: true };
            for (const entry of recipeMaterials) {
                const material = allRawMaterials.find(m => String(m.id) === String(entry.materialId));
                if (!material) {
                    return { ok: false, message: 'Selected raw material is invalid or inactive.' };
                }
                const perUnit = parseInt(entry.quantityRequired, 10) || 0;
                if (perUnit <= 0) continue;
                const needed = perUnit * units;
                const available = getMaterialStockQty(material);
                if (available < 0) {
                    return { ok: false, message: 'Cannot add stock: "' + material.name + '" has negative stock (' + available + '). Restock raw materials on the Raw Materials tab first.' };
                }
                if (available === 0) {
                    return { ok: false, message: 'Cannot add stock: "' + material.name + '" is out of stock. Add quantity on the Raw Materials tab first.' };
                }
                if (available < needed) {
                    return { ok: false, message: 'Cannot add stock: insufficient "' + material.name + '" (need ' + needed + ', available ' + available + ').' };
                }
            }
            return { ok: true };
        }

        function mapApiMaterialsToRecipe(materials) {
            return (materials || []).map(function (m) {
                return {
                    materialId: m.MaterialID || m.materialId,
                    quantityRequired: m.QuantityRequired || m.quantityRequired
                };
            }).filter(function (m) { return m.materialId && m.quantityRequired > 0; });
        }

        function renderAddVariationRecipeStatus(materials) {
            const el = document.getElementById('addVariationRecipeStatus');
            if (!el) return;
            if (!materials || materials.length === 0) {
                el.innerHTML = '<span style="color:#856404;">No parent recipe — stock will not deduct raw materials. Set recipe on the product first.</span>';
                return;
            }
            const lines = materials.map(function (m) {
                const mat = allRawMaterials.find(function (r) { return String(r.id) === String(m.materialId); });
                const name = mat ? mat.name : ('Material #' + m.materialId);
                return name + ' — <strong>' + m.quantityRequired + '</strong>/unit';
            });
            el.innerHTML = '<span style="color:#155724;">Uses parent recipe:</span> ' + lines.join('; ');
        }

        async function loadParentRecipeForAddVariation(inventoryProductId) {
            const recipe = await fetchInventoryRecipeMaterials(inventoryProductId);
            window.currentParentRecipeMaterials = recipe;
            renderAddVariationRecipeStatus(recipe);
            return recipe;
        }

        async function fetchInventoryRecipeMaterials(inventoryProductId) {
            if (!inventoryProductId) return [];
            try {
                const res = await fetch('/api/admin/inventory-products/' + inventoryProductId + '/materials', { credentials: 'include' });
                const data = await res.json();
                if (!data.success || !data.materials) return [];
                return mapApiMaterialsToRecipe(data.materials);
            } catch (err) {
                console.error('fetchInventoryRecipeMaterials:', err);
                return [];
            }
        }

        function updateCreateInventoryMaterialsSummary() {
            const summaryList = document.getElementById('createInventoryMaterialsSummaryList');
            const container = document.getElementById('createInventoryMaterialsContainer');
            const statusEl = document.getElementById('createInventoryRecipeStatus');
            if (!summaryList || !container) return;

            const selected = [];
            container.querySelectorAll('.material-row').forEach(row => {
                const materialId = row.querySelector('.material-select')?.value;
                const quantity = parseInt(row.querySelector('.material-quantity')?.value, 10) || 0;
                if (materialId && quantity > 0) {
                    const material = allRawMaterials.find(m => String(m.id) === String(materialId));
                    if (material) selected.push({ name: material.name, quantity });
                }
            });

            if (selected.length === 0) {
                summaryList.innerHTML = '<em>No materials selected yet</em>';
                if (statusEl) statusEl.innerHTML = '<em>Add at least one material used per unit</em>';
            } else {
                summaryList.innerHTML = selected.map(m =>
                    '<div style="margin: 2px 0;">' + m.name + ' — <strong>' + m.quantity + '</strong>/unit</div>'
                ).join('');
                if (statusEl) statusEl.innerHTML = '<span style="color:#155724;">Raw Materials set (' + selected.length + ' material(s))</span>';
            }
        }

        function createCreateInventoryMaterialRow(selectedMaterialId = null, quantityRequired = 1) {
            const materialRow = document.createElement('div');
            materialRow.className = 'material-row';
            const select = document.createElement('select');
            select.className = 'material-select';
            let optionsHtml = '<option value="">Select Material</option>';
            allRawMaterials.forEach(material => {
                optionsHtml += '<option value="' + material.id + '"' + (selectedMaterialId == material.id ? ' selected' : '') + '>' + formatMaterialOptionLabel(material) + '</option>';
            });
            select.innerHTML = optionsHtml;
            select.addEventListener('change', updateCreateInventoryMaterialsSummary);
            const quantityInput = document.createElement('input');
            quantityInput.type = 'number';
            quantityInput.className = 'material-quantity';
            quantityInput.placeholder = 'Qty per unit';
            quantityInput.min = '1';
            quantityInput.value = quantityRequired;
            quantityInput.addEventListener('input', updateCreateInventoryMaterialsSummary);
            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'remove-material-btn';
            removeButton.textContent = 'Remove';
            removeButton.addEventListener('click', () => {
                materialRow.remove();
                updateCreateInventoryMaterialsSummary();
            });
            materialRow.appendChild(select);
            materialRow.appendChild(quantityInput);
            materialRow.appendChild(removeButton);
            return materialRow;
        }

        function resetCreateInventoryMaterials() {
            const container = document.getElementById('createInventoryMaterialsContainer');
            if (container) container.innerHTML = '';
            const hidden = document.getElementById('requiredMaterials');
            if (hidden) hidden.value = '';
            updateCreateInventoryMaterialsSummary();
        }

        function getCreateInventoryRequiredMaterials() {
            const container = document.getElementById('createInventoryMaterialsContainer');
            const materials = [];
            if (!container) return materials;
            container.querySelectorAll('.material-row').forEach(row => {
                const materialId = row.querySelector('.material-select')?.value;
                const quantity = parseInt(row.querySelector('.material-quantity')?.value, 10);
                if (materialId && quantity > 0) {
                    materials.push({ materialId: materialId, quantityRequired: quantity });
                }
            });
            return materials;
        }

        const addCreateInventoryMaterialBtn = document.getElementById('addCreateInventoryMaterialBtn');
        if (addCreateInventoryMaterialBtn) {
            addCreateInventoryMaterialBtn.addEventListener('click', () => {
                const container = document.getElementById('createInventoryMaterialsContainer');
                if (container) {
                    container.appendChild(createCreateInventoryMaterialRow());
                    updateCreateInventoryMaterialsSummary();
                }
            });
        }


        function updateEditVariationMaterialsSummary() {
            const summaryList = document.getElementById('editVariationMaterialsSummaryList');
            const container = document.getElementById('editVariationMaterialsContainer');
            const statusEl = document.getElementById('editVariationRecipeStatus');
            if (!summaryList || !container) return;

            const selected = [];
            container.querySelectorAll('.material-row').forEach(row => {
                const materialId = row.querySelector('.material-select')?.value;
                const quantity = parseInt(row.querySelector('.material-quantity')?.value, 10) || 0;
                if (materialId && quantity > 0) {
                    const material = allRawMaterials.find(m => String(m.id) === String(materialId));
                    if (material) selected.push({ name: material.name, quantity });
                }
            });

            if (selected.length === 0) {
                summaryList.innerHTML = '<em>None — add materials or stock changes won\'t deduct raw materials</em>';
                if (statusEl) statusEl.innerHTML = '<span style="color:#856404;">⚠ No raw materials</span>';
            } else {
                summaryList.innerHTML = selected.map(m =>
                    `<div style="margin: 2px 0;">${m.name} — <strong>${m.quantity}</strong>/unit</div>`
                ).join('');
                if (statusEl) statusEl.innerHTML = '<span style="color:#155724;">✓ Raw Materials set (' + selected.length + ' material(s))</span>';
            }
        }

        function createEditVariationMaterialRow(selectedMaterialId = null, quantityRequired = 1) {
            const materialRow = document.createElement('div');
            materialRow.className = 'material-row';
            const select = document.createElement('select');
            select.className = 'material-select';
            let optionsHtml = '<option value="">Select Material</option>';
            allRawMaterials.forEach(material => {
                optionsHtml += `<option value="${material.id}" ${selectedMaterialId == material.id ? 'selected' : ''}>${formatMaterialOptionLabel(material)}</option>`;
            });
            select.innerHTML = optionsHtml;
            select.addEventListener('change', updateEditVariationMaterialsSummary);
            const quantityInput = document.createElement('input');
            quantityInput.type = 'number';
            quantityInput.className = 'material-quantity';
            quantityInput.placeholder = 'Qty per unit';
            quantityInput.min = '1';
            quantityInput.value = quantityRequired;
            quantityInput.addEventListener('input', updateEditVariationMaterialsSummary);
            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'remove-material-btn';
            removeButton.textContent = 'Remove';
            removeButton.addEventListener('click', () => {
                materialRow.remove();
                updateEditVariationMaterialsSummary();
            });
            materialRow.appendChild(select);
            materialRow.appendChild(quantityInput);
            materialRow.appendChild(removeButton);
            return materialRow;
        }

        function resetEditVariationMaterials() {
            const container = document.getElementById('editVariationMaterialsContainer');
            if (container) container.innerHTML = '';
            const hidden = document.getElementById('editVariationRecipeMaterials');
            if (hidden) hidden.value = '';
            updateEditVariationMaterialsSummary();
        }

        function getEditVariationRequiredMaterials() {
            const container = document.getElementById('editVariationMaterialsContainer');
            const materials = [];
            if (!container) return materials;
            container.querySelectorAll('.material-row').forEach(row => {
                const materialId = row.querySelector('.material-select')?.value;
                const quantity = parseInt(row.querySelector('.material-quantity')?.value, 10);
                if (materialId && quantity > 0) {
                    materials.push({ materialId, quantityRequired: quantity });
                }
            });
            return materials;
        }

        async function loadEditVariationRecipe(inventoryProductId) {
            resetEditVariationMaterials();
            if (!inventoryProductId) return;
            try {
                const res = await fetch(`/api/admin/inventory-products/${inventoryProductId}/materials`, { credentials: 'include' });
                const data = await res.json();
                const container = document.getElementById('editVariationMaterialsContainer');
                if (data.success && data.materials && data.materials.length > 0 && container) {
                    data.materials.forEach(m => {
                        container.appendChild(createEditVariationMaterialRow(m.MaterialID, m.QuantityRequired));
                    });
                } else if (container && allRawMaterials.length > 0) {
                    container.appendChild(createEditVariationMaterialRow());
                }
                updateEditVariationMaterialsSummary();
            } catch (err) {
                console.error('loadEditVariationRecipe:', err);
                const container = document.getElementById('editVariationMaterialsContainer');
                if (container && allRawMaterials.length > 0) {
                    container.appendChild(createEditVariationMaterialRow());
                }
                updateEditVariationMaterialsSummary();
            }
            const recipeHidden = document.getElementById('editVariationRecipeMaterials');
            if (recipeHidden) {
                recipeHidden.setAttribute('data-initial-recipe', JSON.stringify(getEditVariationRequiredMaterials()));
            }
        }

        const addCreateProductVariationBtn = document.getElementById('addCreateProductVariationBtn');
        if (addCreateProductVariationBtn) {
            addCreateProductVariationBtn.addEventListener('click', () => {
                const list = document.getElementById('createProductVariationsList');
                if (list) list.appendChild(buildCreateProductVariationRow());
                updateCreateVariationTotalSummary();
            });
        }

        const addProductForm = document.getElementById('addProductForm');
        if (addProductForm) {
            addProductForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                const unitPrice = getCreateProductUnitPrice();
                if (unitPrice == null) {
                    showCustomPopup('Enter a product price greater than zero before creating the product.', true);
                    return;
                }
                const variations = collectCreateProductVariations();
                if (!variations.length) {
                    showCustomPopup('Add at least one variation with name and quantity before creating the product.', true);
                    return;
                }
                const rowsMissingFields = document.querySelectorAll('#createProductVariationsList .create-product-variation-row').length
                    - variations.length;
                if (rowsMissingFields > 0) {
                    showCustomPopup('Each variation needs a name and quantity of at least 1.', true);
                    return;
                }

                const jsonField = document.getElementById('variationsJson');
                const qtyField = document.getElementById('quantity');
                const totalVariationQty = variations.reduce((sum, v) => sum + (v.quantity || 0), 0);
                if (qtyField) qtyField.value = String(totalVariationQty);
                if (jsonField) jsonField.value = JSON.stringify(variations);

                const recipeMaterials = getCreateInventoryRequiredMaterials();
                if (recipeMaterials.length === 0) {
                    showCustomPopup('Add at least one raw material with quantity per unit before creating the product.', true);
                    return;
                }
                const materialsField = document.getElementById('requiredMaterials');
                if (materialsField) materialsField.value = JSON.stringify(recipeMaterials);

                const stockCheck = validateRecipeMaterialsStock(recipeMaterials, totalVariationQty);
                if (!stockCheck.ok) {
                    showCustomPopup(stockCheck.message, true);
                    return;
                }

                const formData = new FormData(this);
                document.querySelectorAll('#createProductVariationsList .create-product-variation-row').forEach((row) => {
                    appendVariationMediaToFormData(formData, row);
                });

                const submitBtn = this.querySelector('button[type="submit"]');
                if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Creating...'; }
                try {
                    const response = await fetch(this.action, {
                        method: 'POST',
                        body: formData,
                        credentials: 'include',
                        headers: { 'X-Requested-With': 'XMLHttpRequest' }
                    });
                    const result = await response.json();
                    if (result.success) {
                        showCustomPopup(result.message || 'Product created.');
                        setTimeout(() => {
                            window.location.href = '/Employee/Admin/ProductInventory?inventoryProductId=' + result.inventoryProductId + '&tab=variations';
                        }, 500);
                    } else {
                        showCustomPopup(result.message || 'Failed to create product.', true);
                    }
                } catch (err) {
                    showCustomPopup('Failed to create product: ' + err.message, true);
                } finally {
                    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Create Product'; }
                }
            });
        }

        const editInventoryForm = document.getElementById('editInventoryForm');
        if (editInventoryForm) {
            editInventoryForm.addEventListener('submit', function(e) {
                const length = document.getElementById('editLength');
                const width = document.getElementById('editWidth');
                const height = document.getElementById('editHeight');
                const unit = document.getElementById('editDimensionUnit');

                if (length && width && height && unit) {
                    if (length.value || width.value || height.value) {
                        const dimensions = JSON.stringify({
                            length: length.value || 0,
                            width: width.value || 0,
                            height: height.value || 0,
                            unit: unit.value
                        });
                        const hiddenInput = document.createElement('input');
                        hiddenInput.type = 'hidden';
                        hiddenInput.name = 'dimensions';
                        hiddenInput.value = dimensions;
                        this.appendChild(hiddenInput);
                    }
                }
            });
        }

        // Add Category Inline Form logic
        const addCategoryBtn = document.getElementById('addCategoryBtn');
        const addCategoryForm = document.getElementById('addCategoryForm');
        const cancelAddCategoryBtn = document.getElementById('cancelAddCategoryBtn');
        const saveCategoryBtn = document.getElementById('saveCategoryBtn');
        
        if (addCategoryBtn && addCategoryForm) {
            addCategoryBtn.addEventListener('click', function() {
                addCategoryForm.style.display = 'block';
                const newCategoryNameInput = document.getElementById('newCategoryName');
                if (newCategoryNameInput) {
                    newCategoryNameInput.value = '';
                    newCategoryNameInput.focus();
                }
            });
        }
        
        if (cancelAddCategoryBtn && addCategoryForm) {
            cancelAddCategoryBtn.addEventListener('click', function() {
                addCategoryForm.style.display = 'none';
                const newCategoryNameInput = document.getElementById('newCategoryName');
                if (newCategoryNameInput) {
                    newCategoryNameInput.value = '';
                }
            });
        }
        
        if (saveCategoryBtn) {
            saveCategoryBtn.addEventListener('click', function() {
                const newCategoryNameInput = document.getElementById('newCategoryName');
                const categorySelect = document.getElementById('category');
                
                if (!newCategoryNameInput || !categorySelect) {
                    return;
                }
                
                const newCat = newCategoryNameInput.value.trim();
                if (!newCat) {
                    alert('Please enter a category name.');
                    return;
                }
                
                // Check if category already exists
                const existingOptions = Array.from(categorySelect.options);
                if (existingOptions.some(opt => opt.value === newCat)) {
                    alert('This category already exists.');
                    return;
                }
                
                // Add to dropdown
                const option = document.createElement('option');
                option.value = newCat;
                option.textContent = newCat;
                categorySelect.appendChild(option);
                categorySelect.value = newCat;
                
                // Hide form and clear input
                addCategoryForm.style.display = 'none';
                newCategoryNameInput.value = '';
                alert('Category added to dropdown! It will be saved when you create a product with this category.');
            });
        }

        // Function to archive product
        function archiveProduct(productId, productName, isFromProductsTable) {
            // All products on this page are from InventoryProducts table
            const isFromInventoryProducts = false; // Always false for this page
            
            if (confirm(`Are you sure you want to archive "${productName}"? This will move it to the Archived page.`)) {
                // Create a form and submit it
                const form = document.createElement('form');
                form.method = 'POST';
                form.action = `/Employee/Admin/ProductInventory/Archive/${productId}`;
                form.style.display = 'none';
                
                // Add hidden input to indicate if it's from Products table (always false for InventoryProducts)
                const hiddenInput = document.createElement('input');
                hiddenInput.type = 'hidden';
                hiddenInput.name = 'isFromProductsTable';
                hiddenInput.value = 'false'; // Always false for InventoryProducts
                form.appendChild(hiddenInput);
                
                // Add CSRF token if it exists
                const csrfToken = document.querySelector('meta[name="csrf-token"]');
                if (csrfToken) {
                    const csrfInput = document.createElement('input');
                    csrfInput.type = 'hidden';
                    csrfInput.name = '_csrf';
                    csrfInput.value = csrfToken.getAttribute('content');
                    form.appendChild(csrfInput);
                }
                
                document.body.appendChild(form);
                form.submit();
            }
        }

        // Variations Management
        let currentVariationProductId = null;
        let currentVariationIsFromProducts = false;
        
        // Helper function to get variationsContainer (get it dynamically)
        function getVariationsContainer() {
            return document.getElementById('variationsContainer');
        }
        
        // Helper function to get variationsModal (get it dynamically)
        function getVariationsModal() {
            return document.getElementById('variationsModal');
        }

        // Close variations modal
        // Function to close variations modal
        function closeVariationsModalFunc() {
                const variationsModal = getVariationsModal();
                if (variationsModal) {
                    variationsModal.style.display = 'none';
                console.log('Variations modal closed');
            }
        }
        
        // Make function globally available
        window.closeVariationsModalFunc = closeVariationsModalFunc;
        
        // Attach close button listener
        const closeVariationsModal = document.getElementById('closeVariationsModal');
        if (closeVariationsModal) {
            // Check if listener is already attached
            if (!closeVariationsModal.hasAttribute('data-listener-attached')) {
                closeVariationsModal.addEventListener('click', closeVariationsModalFunc);
                closeVariationsModal.setAttribute('data-listener-attached', 'true');
                console.log('Close button (X) listener attached for variations modal');
            } else {
                console.log('Close button (X) listener already attached for variations modal');
            }
        } else {
            console.warn('Close button (X) not found for variations modal');
        }

        // Add variation form submission - initialize when DOM is ready
        function initializeVariationForm() {
            const addVariationForm = document.getElementById('addVariationForm');
            if (addVariationForm) {
                addVariationForm.addEventListener('submit', async function(e) {
                    e.preventDefault();
                    
                    const formData = new FormData(this);
                    appendVariationMediaToFormData(formData, this);
                    
                    // For ProductInventory page, ALWAYS use InventoryProductVariations endpoint
                    // This page only manages InventoryProducts, so always use InventoryProductID
                    const variationInventoryProductIDEl = document.getElementById('variationInventoryProductID');
                    
                    if (!variationInventoryProductIDEl || !variationInventoryProductIDEl.value) {
                        notifyVariationModal('Inventory Product ID not found', true);
                        return;
                    }
                    
                    const productId = variationInventoryProductIDEl.value;
                    const endpoint = '/api/admin/inventory-product-variations/add';
                    
                    // Set inventoryProductID and remove productID
                    formData.delete('productID');
                    formData.delete('inventoryProductID');
                    formData.set('inventoryProductID', productId);
                    if (window.currentParentProductPrice != null && !formData.has('price')) {
                        formData.set('price', String(window.currentParentProductPrice));
                    }

                    const addQty = parseInt(document.getElementById('variationQuantity')?.value, 10) || 0;
                    const parentRecipe = window.currentParentRecipeMaterials || await fetchInventoryRecipeMaterials(productId);
                    window.currentParentRecipeMaterials = parentRecipe;
                    const stockCheck = validateRecipeMaterialsStock(parentRecipe, addQty);
                    if (!stockCheck.ok) {
                        notifyVariationModal(stockCheck.message, true);
                        return;
                    }

                    console.log('Using InventoryProductVariations endpoint for add, inventoryProductID:', productId);
                    
                    try {
                        const response = await fetch(endpoint, {
                            method: 'POST',
                            body: formData
                        });
                        
                        const result = await response.json();
                        
                        if (result.success) {
                            notifyVariationModal(result.message);
                            this.reset();
                            
                            const pid = currentSelectedProductId || window.currentVariationProductId;
                            if (pid) await notifyInventoryStockChanged(pid, result);
                        } else {
                            notifyVariationModal(result.message || 'Failed to add variation', true);
                        }
                    } catch (error) {
                        console.error('Error adding variation:', error);
                        notifyVariationModal('Failed to add variation: ' + error.message, true);
                    }
                });
            }
        }
        
        // Initialize form when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeVariationForm);
        } else {
            initializeVariationForm();
        }

        // Store product stock info globally
        window.currentProductStockInfo = {
            productStock: 0,
            availableStock: 0,
            totalVariationQuantity: 0
        };

        // Load variations for an inventory product
        // ProductInventory page ALWAYS uses InventoryProductVariations (for InventoryProducts table)
        async function loadVariations(inventoryProductId, isFromProducts = false) {
            try {
                console.log('Loading variations for inventory product:', inventoryProductId);
                // Always use InventoryProductVariations endpoint for ProductInventory page
                const response = await fetch(`/api/admin/inventory-product-variations/${inventoryProductId}`);
                const result = await response.json();
                console.log('Variations result:', result);
                
                if (result.success) {
                    // Store stock information globally
                    window.currentProductStockInfo = {
                        productStock: result.productStock || 0,
                        availableStock: result.availableStock || 0,
                        totalVariationQuantity: result.totalVariationQuantity || 0
                    };
                    if (result.parentProductPrice != null) {
                        window.currentParentProductPrice = result.parentProductPrice;
                    }
                    if (result.parentRecipeMaterials && result.parentRecipeMaterials.length) {
                        window.currentParentRecipeMaterials = mapApiMaterialsToRecipe(result.parentRecipeMaterials);
                        renderAddVariationRecipeStatus(window.currentParentRecipeMaterials);
                    } else {
                        loadParentRecipeForAddVariation(inventoryProductId).catch(function (err) { console.error(err); });
                    }
                    
                    // Remove max attribute restriction and hide available stock info
                    const variationQuantityInput = document.getElementById('variationQuantity');
                    const availableStockInfo = document.getElementById('availableStockInfo');
                    if (variationQuantityInput) {
                        variationQuantityInput.removeAttribute('max');
                        variationQuantityInput.removeAttribute('title');
                    }
                    
                    // Hide the available stock info
                        if (availableStockInfo) {
                        availableStockInfo.textContent = '';
                        availableStockInfo.style.display = 'none';
                    }
                    
                    displayVariations(filterVariationsForListSearch(result.variations || []));
                } else {
                    const variationsContainer = getVariationsContainer();
                    if (variationsContainer) {
                        variationsContainer.innerHTML = '<p>No variations found or error loading variations.</p>';
                    }
                }
            } catch (error) {
                console.error('Error loading variations:', error);
                const variationsContainer = getVariationsContainer();
                if (variationsContainer) {
                    variationsContainer.innerHTML = '<p>Error loading variations.</p>';
                }
            }
        }

        // Display variations
        function displayVariations(variations) {
            const variationsContainer = getVariationsContainer();
            if (!variationsContainer) {
                console.error('variationsContainer element not found');
                return;
            }
            
            window.currentVariations = variations;
            
            if (variations.length === 0) {
                variationsContainer.innerHTML = '<p>No variations found for this product.</p>';
                return;
            }

            const variationsHTML = variations.map(variation => {
                const escapedName = (variation.VariationName || 'N/A').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                return `
                <div style="border: 1px solid #ddd; padding: 15px; margin-bottom: 10px; border-radius: 5px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h5 style="margin: 0 0 5px 0;">${variation.VariationName}</h5>
                        <p style="margin: 0; color: #666;">
                            ${variation.Color ? `Color: ${variation.Color} | ` : ''}
                            Quantity: ${variation.Quantity} |
                            Price: ₱${parseFloat(variation.Price || 0).toFixed(2)} |
                            Status: ${variation.IsActive ? 'Active' : 'Inactive'} |
                            Created: ${new Date(variation.CreatedAt).toLocaleDateString()}
                        </p>
                        ${variation.VariationImageURL ? `<img src="${variation.VariationImageURL}" alt="${variation.VariationName}" style="max-width: 100px; max-height: 100px; margin-top: 10px; border-radius: 4px;">` : ''}
                    </div>
                </div>
                `;
            }).join('');
            
            variationsContainer.innerHTML = variationsHTML;
        }

        // Edit variation status (similar to edit inventory status)
        window.editVariationStatus = async function editVariationStatus(variationId) {
            const variation = window.currentVariations.find(v => v.VariationID === variationId);
            if (!variation) {
                console.error('Variation not found:', variationId);
                showCustomPopup('Variation not found.', true);
                return;
            }

            try {
                // Fetch current variation status data
                const response = await fetch(`/api/admin/inventory-variation-quantity/${variationId}`);
                const result = await response.json();

                if (!result.success || !result.variation) {
                    showCustomPopup('Failed to load variation data.', true);
                    return;
                }

                const variationData = result.variation;

                // Populate modal fields
                document.getElementById('editVariationStatusVariationID').value = variationId;
                document.getElementById('editVariationStatusName').value = variationData.VariationName || variation.VariationName || 'N/A';

                const parentInvId = variationData.InventoryProductID || variation.InventoryProductID || currentSelectedProductId;
                await loadEditVariationRecipe(parentInvId);
                
                // Set current quantities
                // If AvailableQuantity is NULL, undefined, or 0, fall back to Quantity field
                // The API already handles this, but we need to ensure we use Quantity if AvailableQuantity is 0
                const quantityFromDB = variationData.Quantity || 0;
                let currentAvailable = variationData.AvailableQuantity;
                
                // If AvailableQuantity is null, undefined, or 0, and we have a Quantity value, use Quantity
                if ((currentAvailable === null || currentAvailable === undefined || currentAvailable === 0) && quantityFromDB > 0) {
                    currentAvailable = quantityFromDB;
                } else {
                    currentAvailable = currentAvailable || 0;
                }
                
                const currentDamaged = variationData.DamagedQuantity || 0;
                const currentRepaired = variationData.RepairedQuantity || 0;
                const currentDisposed = variationData.DisposedQuantity || 0;
                
                // Total = Available + Damaged
                // If the sum is 0 but we have Quantity, use Quantity as the total
                const calculatedTotal = currentAvailable + currentDamaged;
                const currentTotal = (calculatedTotal > 0) ? calculatedTotal : quantityFromDB;

                document.getElementById('currentVariationStatusAvailableQty').textContent = currentAvailable;
                document.getElementById('currentVariationStatusDamagedQty').textContent = currentDamaged;
                document.getElementById('currentVariationStatusRepairedQty').textContent = currentRepaired;
                document.getElementById('currentVariationStatusDisposedQty').textContent = currentDisposed;

                // Set hidden inputs
                document.getElementById('editVariationStatusAvailableQuantity').value = currentAvailable;
                document.getElementById('editVariationStatusDamagedQuantity').value = currentDamaged;
                document.getElementById('editVariationStatusRepairedQuantity').value = currentRepaired;
                document.getElementById('editVariationStatusDisposedQuantity').value = currentDisposed;
                
                const mediaPreview = document.getElementById('editVariationStatusMediaPreview');
                renderVariationMediaPreviews(mediaPreview, {
                    mainImage: variationData.VariationImageURL || null,
                    thumbnails: parseThumbnailUrls(variationData.ThumbnailURLs),
                    model3d: variationData.Model3D || null
                });

                // Removed Notes field for compact modal

                // Reset status select
                document.getElementById('editVariationStatusSelect').value = '';
                document.getElementById('variationStatusQuantityInputContainer').style.display = 'none';

                updateVariationTotalQuantity();

                // Attach event listeners when modal is opened (in case they weren't attached on page load)
                attachEditVariationStatusListeners();
                attachEditVariationStatusCloseListeners();
                
                // Show modal
                document.getElementById('editVariationStatusModal').style.display = 'block';
            } catch (error) {
                console.error('Error loading variation status data:', error);
                showCustomPopup('Failed to load variation data.', true);
            }
        }

        // Function to show quantity input for variation status
        window.showVariationQuantityForStatus = function showVariationQuantityForStatus() {
            const statusSelect = document.getElementById('editVariationStatusSelect');
            const quantityContainer = document.getElementById('variationStatusQuantityInputContainer');
            const quantityInput = document.getElementById('editVariationStatusQuantityInput');
            const MAX_QUANTITY = 999999;
            
            if (statusSelect.value) {
                quantityContainer.style.display = 'block';
                
                let currentQty = 0;
                
                switch(statusSelect.value) {
                    case 'available':
                        currentQty = parseInt(document.getElementById('currentVariationStatusAvailableQty').textContent) || 0;
                        quantityInput.value = currentQty;
                        quantityInput.min = 0;
                        quantityInput.max = MAX_QUANTITY;
                        break;
                    case 'damaged':
                        currentQty = parseInt(document.getElementById('currentVariationStatusDamagedQty').textContent) || 0;
                        const availableQty = parseInt(document.getElementById('currentVariationStatusAvailableQty').textContent) || 0;
                        quantityInput.value = 0;
                        quantityInput.min = 0;
                        quantityInput.max = availableQty;
                        break;
                    case 'repaired':
                        currentQty = parseInt(document.getElementById('currentVariationStatusRepairedQty').textContent) || 0;
                        const damagedQty = parseInt(document.getElementById('currentVariationStatusDamagedQty').textContent) || 0;
                        if (damagedQty === 0) {
                            quantityInput.max = 0;
                            quantityInput.min = 0;
                            quantityInput.value = 0;
                        } else {
                            quantityInput.max = damagedQty;
                            quantityInput.min = 0;
                            quantityInput.value = 0;
                        }
                        break;
                    case 'disposed':
                        currentQty = parseInt(document.getElementById('currentVariationStatusDisposedQty').textContent) || 0;
                        const availForDisposal = (parseInt(document.getElementById('currentVariationStatusAvailableQty').textContent) || 0) + 
                                                (parseInt(document.getElementById('currentVariationStatusDamagedQty').textContent) || 0);
                        quantityInput.value = currentQty;
                        quantityInput.min = 0;
                        quantityInput.max = Math.min(MAX_QUANTITY, currentQty + availForDisposal);
                        break;
                }
                
                updateVariationQuantityForStatus();
            } else {
                quantityContainer.style.display = 'none';
            }
        }

        // Function to update variation quantity for status (copied from updateQuantityForStatus)
        window.updateVariationQuantityForStatus = function updateVariationQuantityForStatus() {
            const statusSelect = document.getElementById('editVariationStatusSelect');
            const quantityInput = document.getElementById('editVariationStatusQuantityInput');
            let newQuantity = parseInt(quantityInput.value) || 0;
            
            if (newQuantity < 0) {
                showCustomPopup('Quantity cannot be negative.', true);
                newQuantity = 0;
                quantityInput.value = 0;
                updateVariationTotalQuantity();
                return;
            }
            
            const currentAvailable = parseInt(document.getElementById('currentVariationStatusAvailableQty').textContent) || 0;
            const currentDamaged = parseInt(document.getElementById('currentVariationStatusDamagedQty').textContent) || 0;
            const currentRepaired = parseInt(document.getElementById('currentVariationStatusRepairedQty').textContent) || 0;
            const currentDisposed = parseInt(document.getElementById('currentVariationStatusDisposedQty').textContent) || 0;
            
            let quantityChange = 0;
            switch(statusSelect.value) {
                case 'available':
                    quantityChange = newQuantity - currentAvailable;
                    break;
                case 'damaged':
                    quantityChange = newQuantity;
                    break;
                case 'repaired':
                    quantityChange = newQuantity;
                    break;
                case 'disposed':
                    quantityChange = newQuantity; // Additive for disposed
                    break;
            }
            
            let newAvailable = currentAvailable;
            let newDamaged = currentDamaged;
            let newRepaired = currentRepaired;
            let newDisposed = currentDisposed;
            
            const MAX_QUANTITY = 999999;
            if (newQuantity > MAX_QUANTITY) {
                showCustomPopup(`Quantity exceeds maximum allowed (${MAX_QUANTITY.toLocaleString()}).`, true);
                newQuantity = MAX_QUANTITY;
                quantityInput.value = MAX_QUANTITY;
                switch(statusSelect.value) {
                    case 'available': quantityChange = newQuantity - currentAvailable; break;
                    case 'damaged': quantityChange = newQuantity; break;
                    case 'repaired': quantityChange = newQuantity; break;
                    case 'disposed': quantityChange = newQuantity; break;
                }
            }
            
            if (isNaN(newQuantity) || !Number.isInteger(parseFloat(quantityInput.value))) {
                showCustomPopup('Please enter a valid whole number for quantity.', true);
                switch(statusSelect.value) {
                    case 'available': quantityInput.value = currentAvailable; break;
                    case 'damaged': quantityInput.value = 0; break;
                    case 'repaired': quantityInput.value = 0; break;
                    case 'disposed': quantityInput.value = 0; break;
                }
                updateVariationTotalQuantity();
                return;
            }
            
            switch(statusSelect.value) {
                case 'available':
                    newAvailable = newQuantity;
                    if (quantityChange > 0) {
                        let remaining = quantityChange;
                        if (remaining > 0 && newRepaired > 0) {
                            const restore = Math.min(remaining, newRepaired);
                            newRepaired -= restore;
                            remaining -= restore;
                        }
                    } else if (quantityChange < 0) {
                        const decreaseAmount = Math.abs(quantityChange);
                        if (decreaseAmount > currentAvailable) {
                            showCustomPopup(`Cannot decrease available quantity below 0. Current available: ${currentAvailable}`, true);
                            newAvailable = currentAvailable;
                            quantityInput.value = currentAvailable;
                            quantityChange = 0;
                        } else {
                            newDamaged += decreaseAmount;
                        }
                    }
                    break;
                case 'damaged':
                    let itemsToTransfer = Math.min(newQuantity, currentAvailable);
                    if (newQuantity > currentAvailable) {
                        showCustomPopup(`Cannot mark more items as damaged than available. Only ${currentAvailable} available item(s). Using ${itemsToTransfer} instead.`, true);
                        quantityInput.value = itemsToTransfer;
                        newQuantity = itemsToTransfer;
                        itemsToTransfer = newQuantity;
                    }
                    if (itemsToTransfer > 0) {
                        const intCurrentAvailable = parseInt(currentAvailable) || 0;
                        const intCurrentDamaged = parseInt(currentDamaged) || 0;
                        const intItemsToTransfer = parseInt(itemsToTransfer) || 0;
                        newAvailable = intCurrentAvailable - intItemsToTransfer;
                        newDamaged = intCurrentDamaged + intItemsToTransfer;
                        if (newAvailable < 0) newAvailable = 0;
                        if (newDamaged < 0) newDamaged = 0;
                    } else {
                        newDamaged = currentDamaged;
                    }
                    break;
                case 'repaired':
                    if (quantityChange > 0) {
                        const fromDamaged = Math.min(quantityChange, currentDamaged);
                        if (fromDamaged > 0) {
                            newDamaged = currentDamaged - fromDamaged;
                            if (newDamaged < 0) newDamaged = 0;
                            newRepaired = currentRepaired + fromDamaged;
                            newAvailable += fromDamaged;
                        }
                    } else if (quantityChange < 0) {
                        showCustomPopup('Cannot repair negative quantity.', true);
                        quantityInput.value = 0;
                        quantityChange = 0;
                        newRepaired = currentRepaired;
                    }
                    break;
                case 'disposed':
                    newDisposed = newQuantity;
                    if (quantityChange > 0) {
                        let remainingToDispose = quantityChange;
                        if (remainingToDispose > 0 && currentAvailable > 0) {
                            const disposeFromAvailable = Math.min(remainingToDispose, currentAvailable);
                            newAvailable -= disposeFromAvailable;
                            remainingToDispose -= disposeFromAvailable;
                        }
                        if (remainingToDispose > 0 && currentDamaged > 0) {
                            const disposeFromDamaged = Math.min(remainingToDispose, currentDamaged);
                            newDamaged -= disposeFromDamaged;
                            remainingToDispose -= disposeFromDamaged;
                        }
                        newAvailable = Math.max(0, newAvailable);
                        newDamaged = Math.max(0, newDamaged);
                    } else if (quantityChange < 0) {
                        showCustomPopup('Disposed items cannot be restored.', true);
                        newDisposed = currentDisposed;
                        quantityInput.value = currentDisposed;
                        quantityChange = 0;
                    }
                    break;
            }
            
            // Ensure no negative values
            newAvailable = Math.max(0, newAvailable);
            newDamaged = Math.max(0, newDamaged);
            newRepaired = Math.max(0, newRepaired);
            newDisposed = Math.max(0, newDisposed);
            
            // Update hidden inputs
            document.getElementById('editVariationStatusAvailableQuantity').value = newAvailable;
            document.getElementById('editVariationStatusDamagedQuantity').value = newDamaged;
            document.getElementById('editVariationStatusRepairedQuantity').value = newRepaired;
            document.getElementById('editVariationStatusDisposedQuantity').value = newDisposed;
            
            // Update display
            document.getElementById('currentVariationStatusAvailableQty').textContent = newAvailable;
            document.getElementById('currentVariationStatusDamagedQty').textContent = newDamaged;
            document.getElementById('currentVariationStatusRepairedQty').textContent = newRepaired;
            document.getElementById('currentVariationStatusDisposedQty').textContent = newDisposed;
            
            // Update total display
            updateVariationTotalQuantity();
        }

        // Function to update variation total quantity display
        function updateVariationTotalQuantity() {
            // Status quantities are shown in the Current: line in the modal.
        }

        // Function to handle form submission
        const handleVariationStatusSubmit = async function(e) {
            if (e) e.preventDefault();
            console.log('Edit variation status form submitted');

                const variationId = document.getElementById('editVariationStatusVariationID').value;
                if (!variationId) {
                    showCustomPopup('Error: Variation ID not found.', true);
                    return;
                }
                
                const selectedStatus = document.getElementById('editVariationStatusSelect').value;

                const currentAvailable = parseInt(document.getElementById('currentVariationStatusAvailableQty').textContent) || 0;
                const currentDamaged = parseInt(document.getElementById('currentVariationStatusDamagedQty').textContent) || 0;
                const currentRepaired = parseInt(document.getElementById('currentVariationStatusRepairedQty').textContent) || 0;
                const currentDisposed = parseInt(document.getElementById('currentVariationStatusDisposedQty').textContent) || 0;

                const finalAvailable = parseInt(document.getElementById('editVariationStatusAvailableQuantity').value) || 0;
                const finalDamaged = parseInt(document.getElementById('editVariationStatusDamagedQuantity').value) || 0;
                const finalRepaired = parseInt(document.getElementById('editVariationStatusRepairedQuantity').value) || 0;
                const finalDisposed = parseInt(document.getElementById('editVariationStatusDisposedQuantity').value) || 0;

                const quantitiesChanged = (finalAvailable !== currentAvailable) ||
                    (finalDamaged !== currentDamaged) ||
                    (finalRepaired !== currentRepaired) ||
                    (finalDisposed !== currentDisposed);

                const hasMediaUpload = !!(document.getElementById('editVariationStatusMainImage')?.files?.length ||
                    document.getElementById('editVariationStatusThumbnails')?.files?.length ||
                    document.getElementById('editVariationStatusModel3d')?.files?.length);

                const currentRecipeJson = JSON.stringify(getEditVariationRequiredMaterials());
                const initialRecipeJson = document.getElementById('editVariationRecipeMaterials')?.getAttribute('data-initial-recipe') || '[]';
                const recipeChanged = currentRecipeJson !== initialRecipeJson;

                if (!quantitiesChanged && !selectedStatus && !hasMediaUpload && !recipeChanged) {
                    showCustomPopup('No changes detected. Modify quantities, media, raw materials, or select a status before saving.', true);
                    return;
                }

                const newAvailableQty = finalAvailable;
                const newDamagedQty = finalDamaged;
                const newRepairedQty = finalRepaired;
                const newDisposedQty = finalDisposed;
                const notes = ''; // Removed Notes field for compact modal
                
                const calculatedTotalForBackend = newAvailableQty + newDamagedQty;
                
                const formData = new FormData();
                formData.append('variationID', parseInt(variationId));
                formData.append('availableQuantity', newAvailableQty);
                formData.append('damagedQuantity', newDamagedQty);
                formData.append('repairedQuantity', newRepairedQty);
                formData.append('disposedQuantity', newDisposedQty);
                formData.append('notes', notes || '');
                appendVariationMediaToFormData(formData, document.getElementById('editVariationStatusForm'));
                formData.append('recipeMaterials', JSON.stringify(getEditVariationRequiredMaterials()));
                
                console.log('Final quantities to save:', {
                    available: newAvailableQty,
                    damaged: newDamagedQty,
                    repaired: newRepairedQty,
                    disposed: newDisposedQty,
                    calculatedTotal: calculatedTotalForBackend
                });

                // Enhanced validation: If status is selected and quantity input is visible, it should have a value
                if (selectedStatus) {
                    const quantityInputContainer = document.getElementById('variationStatusQuantityInputContainer');
                    if (quantityInputContainer && quantityInputContainer.style.display !== 'none') {
                        const quantityInputValue = document.getElementById('editVariationStatusQuantityInput').value;
                        // For damaged and repaired, 0 is valid (additive input starts at 0)
                        if (selectedStatus === 'damaged' || selectedStatus === 'repaired') {
                            // 0 is valid for additive inputs
                            if (quantityInputValue === '' || quantityInputValue === null || quantityInputValue === undefined) {
                                showCustomPopup('Please enter a quantity for the selected status.', true);
                                return;
                            }
                        } else if (quantityInputValue === '' || quantityInputValue === null || quantityInputValue === undefined || parseInt(quantityInputValue) < 0) {
                            showCustomPopup('Please enter a valid quantity for the selected status.', true);
                            return;
                        }
                    }
                }

                // Enhanced validation: New quantities cannot be negative
                if (newAvailableQty < 0 || newDamagedQty < 0 || newRepairedQty < 0 || newDisposedQty < 0) {
                    showCustomPopup('Validation Error: Quantities cannot be negative. Please check your inputs.', true);
                    return;
                }

                // Enhanced validation: Maximum quantity check
                const MAX_QUANTITY = 999999;
                if (newAvailableQty > MAX_QUANTITY || newDamagedQty > MAX_QUANTITY || 
                    newRepairedQty > MAX_QUANTITY || newDisposedQty > MAX_QUANTITY) {
                    showCustomPopup(`Validation Error: Quantities cannot exceed ${MAX_QUANTITY.toLocaleString()}. Please check your inputs.`, true);
                    return;
                }

                const stockDelta = (newAvailableQty + newDamagedQty) - (currentAvailable + currentDamaged);
                if (stockDelta > 0) {
                    if (!allRawMaterials.length) await fetchRawMaterialsForInventory();
                    let recipe = getEditVariationRequiredMaterials();
                    if (!recipe.length) {
                        const invId = currentSelectedProductId || window.currentVariationProductId;
                        recipe = await fetchInventoryRecipeMaterials(invId);
                    }
                    const stockCheck = validateRecipeMaterialsStock(recipe, stockDelta);
                    if (!stockCheck.ok) {
                        showCustomPopup(stockCheck.message, true);
                        return;
                    }
                }

                console.log('Updating variation status - sending request');
                console.log('Request URL: /api/admin/inventory-product-variations/update-status');

                try {
                    const response = await fetch('/api/admin/inventory-product-variations/update-status', {
                        method: 'POST',
                        body: formData
                    });

                    console.log('Response status:', response.status, response.statusText);
                    
                    if (!response.ok) {
                        const errorText = await response.text();
                        console.error('Response not OK. Status:', response.status, 'Body:', errorText);
                        showCustomPopup('Failed to update variation status: Server returned ' + response.status, true);
                        return;
                    }

                    const result = await response.json();
                    console.log('Update variation status response:', result);

                    if (result.success) {
                        showCustomPopup('Variation status updated. Product inventory totals are synced.');
                        const editVariationStatusModal = document.getElementById('editVariationStatusModal');
                        if (editVariationStatusModal) editVariationStatusModal.style.display = 'none';
                        const pid = currentSelectedProductId || window.currentVariationProductId;
                        if (pid) await notifyInventoryStockChanged(pid, result);
                    } else {
                        console.error('Failed to update variation status:', result);
                        showCustomPopup('Failed to update variation status: ' + (result.message || 'Unknown error'), true);
                    }
                } catch (error) {
                    console.error('Error updating variation status:', error);
                    showCustomPopup('Failed to update variation status', true);
                }
            };
        
        // Function to attach event listeners for edit variation status form
        function attachEditVariationStatusListeners() {
            const editVariationStatusForm = document.getElementById('editVariationStatusForm');
            const submitEditVariationStatusBtn = document.getElementById('submitEditVariationStatus');
            
            if (editVariationStatusForm) {
                // Check if listener is already attached
                if (!editVariationStatusForm.hasAttribute('data-listener-attached')) {
                    editVariationStatusForm.addEventListener('submit', handleVariationStatusSubmit);
                    editVariationStatusForm.setAttribute('data-listener-attached', 'true');
                    console.log('Edit variation status form event listener attached');
                } else {
                    console.log('Edit variation status form listener already attached');
                }
            } else {
                console.warn('Edit variation status form not found - will retry when modal opens');
            }
            
            if (submitEditVariationStatusBtn) {
                // Check if listener is already attached
                if (!submitEditVariationStatusBtn.hasAttribute('data-listener-attached')) {
                    submitEditVariationStatusBtn.addEventListener('click', function(e) {
                        e.preventDefault();
                        console.log('Update Variation Status button clicked directly');
                        handleVariationStatusSubmit(e);
                    });
                    submitEditVariationStatusBtn.setAttribute('data-listener-attached', 'true');
                    console.log('Update Variation Status button click listener attached');
                } else {
                    console.log('Update Variation Status button listener already attached');
                }
            } else {
                console.warn('Update Variation Status button not found - will retry when modal opens');
            }

            const addEditVariationMaterialBtn = document.getElementById('addEditVariationMaterialBtn');
            if (addEditVariationMaterialBtn && !addEditVariationMaterialBtn.hasAttribute('data-listener-attached')) {
                addEditVariationMaterialBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const container = document.getElementById('editVariationMaterialsContainer');
                    if (container) {
                        container.appendChild(createEditVariationMaterialRow());
                        updateEditVariationMaterialsSummary();
                    }
                });
                addEditVariationMaterialBtn.setAttribute('data-listener-attached', 'true');
            }
        }
        
        // Attach listeners when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                // Small delay to ensure all elements are rendered
                setTimeout(attachEditVariationStatusListeners, 100);
            });
        } else {
            // Small delay to ensure all elements are rendered
            setTimeout(attachEditVariationStatusListeners, 100);
        }
        
        // Also make the handler globally available for debugging
        window.handleVariationStatusSubmit = handleVariationStatusSubmit;
        window.attachEditVariationStatusListeners = attachEditVariationStatusListeners;

        function closeEditVariationStatusModalFunc() {
            const editVariationStatusModal = document.getElementById('editVariationStatusModal');
            if (editVariationStatusModal) {
                editVariationStatusModal.style.display = 'none';
            }
            const form = document.getElementById('editVariationStatusForm');
            if (form) {
                form.reset();
            }
            const statusSelect = document.getElementById('editVariationStatusSelect');
            if (statusSelect) statusSelect.value = '';
            const qtyContainer = document.getElementById('variationStatusQuantityInputContainer');
            if (qtyContainer) qtyContainer.style.display = 'none';
        }

        function attachEditVariationStatusCloseListeners() {
            const closeBtn = document.getElementById('closeEditVariationStatusModal');
            const cancelBtn = document.getElementById('cancelEditVariationStatus');
            if (closeBtn && !closeBtn.hasAttribute('data-close-listener-attached')) {
                closeBtn.addEventListener('click', closeEditVariationStatusModalFunc);
                closeBtn.setAttribute('data-close-listener-attached', 'true');
            }
            if (cancelBtn && !cancelBtn.hasAttribute('data-close-listener-attached')) {
                cancelBtn.addEventListener('click', closeEditVariationStatusModalFunc);
                cancelBtn.setAttribute('data-close-listener-attached', 'true');
            }
        }

        window.closeEditVariationStatusModalFunc = closeEditVariationStatusModalFunc;
        window.attachEditVariationStatusCloseListeners = attachEditVariationStatusCloseListeners;

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(attachEditVariationStatusCloseListeners, 100));
        } else {
            setTimeout(attachEditVariationStatusCloseListeners, 100);
        }

        // Image preview functions
        function previewProductImage(event) {
            const file = event.target.files[0];
            const preview = document.getElementById('editProductImagePreview');
            if (file && preview) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    preview.innerHTML = `<p style="margin: 5px 0; font-weight: bold;">New Image Preview:</p><img src="${e.target.result}" alt="Preview" style="max-width: 200px; max-height: 200px; border-radius: 4px; border: 1px solid #ddd; margin-top: 5px;">`;
                };
                reader.readAsDataURL(file);
            } else if (preview) {
                preview.innerHTML = '';
            }
        }

        // Make preview functions globally available
        window.previewProductImage = previewProductImage;

        // Add event listeners for edit and archive buttons using data attributes
        document.addEventListener('DOMContentLoaded', function() {
            // Edit inventory buttons


            // Archive buttons
            document.querySelectorAll('.delete-inventory-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const productId = parseInt(this.getAttribute('data-product-id'));
                    const productName = this.getAttribute('data-product-name');
                    const isFromProducts = this.getAttribute('data-is-from-products') === 'true';
                    archiveProduct(productId, productName, isFromProducts);
                });
            });
        });
})();
