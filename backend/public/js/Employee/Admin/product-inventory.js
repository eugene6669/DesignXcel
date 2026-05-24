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
        function formatReturnQtyHtml(qty, kind) {
            const n = Number(qty) || 0;
            return '<span class="return-qty return-qty-' + kind + (n > 0 ? ' has-stock' : '') + '">' + n + '</span>';
        }

        function buildRepairedQtyCellHtml(repairedQty, variationId, variationName, qtySnapshot) {
            let html = '<div class="return-qty-cell">' + formatReturnQtyHtml(repairedQty, 'repaired');
            if (isProductReturnsPage && repairedQty > 0 && variationId) {
                const snap = qtySnapshot || {};
                html += '<button type="button" class="make-available-variation-btn" data-variation-id="' + variationId + '"' +
                    ' data-variation-name="' + escapeHtml(variationName || 'Variation') + '"' +
                    ' data-available-qty="' + (Number(snap.available) || 0) + '"' +
                    ' data-returned-qty="' + (Number(snap.returned) || 0) + '"' +
                    ' data-damaged-qty="' + (Number(snap.damaged) || 0) + '"' +
                    ' data-repaired-qty="' + repairedQty + '"' +
                    ' data-disposed-qty="' + (Number(snap.disposed) || 0) + '"' +
                    ' data-inventory-product-id="' + (snap.inventoryProductId || '') + '"' +
                    ' title="Move quantity from repaired to available stock">Available</button>';
            }
            html += '</div>';
            return html;
        }

        function buildDamagedQtyCellHtml(damagedQty, variationId, variationName, qtySnapshot) {
            let html = '<div class="return-qty-cell">' + formatReturnQtyHtml(damagedQty, 'damaged');
            if (isProductReturnsPage && damagedQty > 0 && variationId) {
                const snap = qtySnapshot || {};
                html += '<button type="button" class="repair-variation-btn" data-variation-id="' + variationId + '"' +
                    ' data-variation-name="' + escapeHtml(variationName || 'Variation') + '"' +
                    ' data-available-qty="' + (Number(snap.available) || 0) + '"' +
                    ' data-returned-qty="' + (Number(snap.returned) || 0) + '"' +
                    ' data-damaged-qty="' + damagedQty + '"' +
                    ' data-repaired-qty="' + (Number(snap.repaired) || 0) + '"' +
                    ' data-disposed-qty="' + (Number(snap.disposed) || 0) + '"' +
                    ' data-inventory-product-id="' + (snap.inventoryProductId || '') + '"' +
                    ' title="Move quantity from damaged to repaired">Repair</button>';
            }
            html += '</div>';
            return html;
        }

        var PI_SVG_EDIT = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>';
        var PI_SVG_ARCHIVE = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>';

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

        const isProductsListingPage = document.body.classList.contains('page-products-listing');
        const isProductReturnsPage = document.body.classList.contains('page-product-returns');
        const isInventoryPage = document.body.classList.contains('page-inventory');

        function isProductInventoryProductsTab() {
            const urlTab = new URLSearchParams(window.location.search).get('tab');
            if (urlTab === 'products') return true;
            if (urlTab) return false;
            const productsTab = document.getElementById('productsTab');
            return !!(productsTab && productsTab.classList.contains('active'));
        }
        const isFlatListPage = false;

        function configureVariationEditModalForPage() {
            const statusBlocks = document.querySelectorAll('.variation-status-edit-only');
            const catalogBlocks = document.querySelectorAll('.variation-edit-products-catalog');
            const restockBlocks = document.querySelectorAll('.variation-edit-inventory-restock');
            const inventoryDetailsBlocks = document.querySelectorAll('.variation-edit-inventory-details');
            const rawMaterialBlocks = document.querySelectorAll('.variation-edit-raw-materials');
            const title = document.getElementById('editVariationStatusModalTitle');
            const submitBtn = document.getElementById('submitEditVariationStatus');
            const nameInput = document.getElementById('editVariationStatusName');
            const mainImageWrap = document.querySelector('.variation-edit-main-image-wrap');
            const skuWrap = document.getElementById('editVariationStatusSku')?.parentElement;
            const mode = window._variationEditMode || (isInventoryPage ? 'inventory' : (isProductsListingPage ? 'catalog' : 'status'));

            rawMaterialBlocks.forEach(function(el) { el.style.display = 'none'; });

            if (mode === 'inventory' || (isInventoryPage && mode !== 'catalog')) {
                statusBlocks.forEach(function(el) { el.style.display = 'none'; });
                catalogBlocks.forEach(function(el) { el.style.display = 'none'; });
                restockBlocks.forEach(function(el) { el.style.display = ''; });
                inventoryDetailsBlocks.forEach(function(el) { el.style.display = ''; });
                if (mainImageWrap) mainImageWrap.style.display = '';
                if (skuWrap) skuWrap.style.display = '';
                if (title) title.textContent = 'Edit Variation';
                if (submitBtn) {
                    submitBtn.style.display = '';
                    submitBtn.textContent = 'Save';
                }
                if (nameInput) {
                    nameInput.readOnly = true;
                    nameInput.style.backgroundColor = '#f5f5f5';
                }
            } else if (isProductsListingPage && mode === 'catalog') {
                statusBlocks.forEach(function(el) { el.style.display = 'none'; });
                catalogBlocks.forEach(function(el) { el.style.display = ''; });
                restockBlocks.forEach(function(el) { el.style.display = 'none'; });
                inventoryDetailsBlocks.forEach(function(el) { el.style.display = ''; });
                if (mainImageWrap) mainImageWrap.style.display = 'none';
                if (skuWrap) skuWrap.style.display = 'none';
                if (title) title.textContent = 'Edit Variation';
                if (submitBtn) {
                    submitBtn.style.display = '';
                    submitBtn.textContent = 'Save';
                }
                if (nameInput) {
                    nameInput.readOnly = false;
                    nameInput.style.backgroundColor = '#fff';
                }
            } else if (isProductReturnsPage) {
                statusBlocks.forEach(function(el) { el.style.display = ''; });
                catalogBlocks.forEach(function(el) { el.style.display = 'none'; });
                restockBlocks.forEach(function(el) { el.style.display = 'none'; });
                if (title) title.textContent = 'Edit Variation Status & Quantity';
                if (submitBtn) {
                    submitBtn.style.display = '';
                    submitBtn.textContent = 'Update';
                }
                const statusSelect = document.getElementById('editVariationStatusSelect');
                if (statusSelect) {
                    ['returned', 'disposed'].forEach(function (val) {
                        const opt = statusSelect.querySelector('option[value="' + val + '"]');
                        if (opt) opt.remove();
                    });
                }
                const returnedCurrent = document.getElementById('variationCurrentReturned');
                if (returnedCurrent) returnedCurrent.style.display = 'none';
                const disposedCurrent = document.getElementById('variationCurrentDisposed');
                if (disposedCurrent) disposedCurrent.style.display = 'none';
            } else {
                inventoryDetailsBlocks.forEach(function(el) { el.style.display = 'none'; });
                restockBlocks.forEach(function(el) { el.style.display = 'none'; });
                const statusSelect = document.getElementById('editVariationStatusSelect');
                if (statusSelect) {
                    const availOpt = statusSelect.querySelector('option[value="available"]');
                    const returnedOpt = statusSelect.querySelector('option[value="returned"]');
                    if (availOpt) availOpt.hidden = false;
                    if (returnedOpt) returnedOpt.hidden = false;
                }
                const availCurrent = document.getElementById('variationCurrentAvailable');
                if (availCurrent) availCurrent.style.display = '';
                const returnedCurrent = document.getElementById('variationCurrentReturned');
                if (returnedCurrent) returnedCurrent.style.display = '';
                statusBlocks.forEach(function(el) { el.style.display = ''; });
                catalogBlocks.forEach(function(el) { el.style.display = 'none'; });
                restockBlocks.forEach(function(el) { el.style.display = 'none'; });
            }
        }

        function variationHasIssueStock(variation) {
            if (!variation) return false;
            if (isProductReturnsPage) {
                return (Number(variation.DamagedQuantity) || 0) > 0
                    || (Number(variation.RepairedQuantity) || 0) > 0
                    || (Number(variation.DisposedQuantity) || 0) > 0
                    || (Number(variation.PendingInspectionQty) || 0) > 0;
            }
            return (Number(variation.DamagedQuantity) || 0) > 0
                || (Number(variation.ReturnedQuantity) || 0) > 0
                || (Number(variation.RepairedQuantity) || 0) > 0
                || (Number(variation.DisposedQuantity) || 0) > 0
                || (Number(variation.PendingInspectionQty) || 0) > 0;
        }

        function buildFlatVariationRowHtml(variation, productId) {
            const imageUrl = getVariationDisplayImageUrl(variation);
            const variationName = variation.VariationName || 'N/A';
            const variationId = variation.VariationID || 0;
            const variationSku = variation.SKU || '—';
            const color = variation.Color || '—';
            let availableQty = variation.AvailableQuantity;
            const baseQuantity = variation.Quantity || 0;
            if ((availableQty === null || availableQty === undefined || availableQty === 0) && baseQuantity > 0) {
                availableQty = baseQuantity;
            } else {
                availableQty = availableQty || 0;
            }
            const damagedQty = variation.DamagedQuantity || 0;
            const returnedQty = variation.ReturnedQuantity || 0;
            const repairedQty = variation.RepairedQuantity || 0;
            const disposedQty = variation.DisposedQuantity || 0;
            const totalQty = (availableQty + damagedQty) > 0 ? (availableQty + damagedQty) : baseQuantity;
            const price = variation.Price
                ? '₱' + parseFloat(variation.Price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : '—';

            let cols = '<tr class="variation-flat-row" data-parent-product-id="' + productId + '" data-variation-id="' + variationId + '">' +
                '<td><span class="row-type-badge row-type-variation">Variation</span></td>' +
                '<td>' + escapeHtml(variationName) + '</td>' +
                '<td><code style="font-size:0.85em;">' + escapeHtml(variationSku) + '</code> · ' + escapeHtml(color) + '</td>' +
                '<td class="qty-col">' + formatStockQty(totalQty) + '</td>';

            if (!isProductReturnsPage) {
                cols += '<td class="qty-col">' + formatAvailableQty(availableQty) + '</td>';
            } else {
                cols += '<td class="qty-col">' + formatReturnQtyHtml(returnedQty, 'returned') + '</td>' +
                    '<td class="qty-col">' + buildDamagedQtyCellHtml(damagedQty, variationId, variationName, {
                    available: availableQty,
                    returned: returnedQty,
                    repaired: repairedQty,
                    disposed: disposedQty
                }) + '</td>' +
                    '<td class="qty-col">' + formatReturnQtyHtml(repairedQty, 'repaired') + '</td>';
            }

            cols += '<td style="text-align:center;"><img src="' + escapeHtml(imageUrl) + '" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:4px;border:1px solid #ddd;" onerror="this.src=\'/images/placeholder-no-image.svg\'"></td>';

            if (!isProductReturnsPage) {
                cols += '<td style="color:#999;">—</td>';
            }

            if (isProductReturnsPage) {
                cols += '<td style="text-align:center;"><button type="button" class="edit-variation-status-btn pi-icon-edit-btn" data-variation-id="' + variationId + '" title="Edit variation status" aria-label="Edit variation status">' + PI_SVG_EDIT + '</button></td>';
            }

            cols += '</tr>';
            return cols;
        }

        function removeFlatVariationRows(productId) {
            document.querySelectorAll('tr.variation-flat-row[data-parent-product-id="' + productId + '"]').forEach(function(row) {
                row.remove();
            });
        }

        function insertFlatVariationRows(productRow, variations, productId) {
            removeFlatVariationRows(productId);
            const emptyColspan = isProductReturnsPage ? 9 : 7;
            if (!variations || !variations.length) {
                productRow.insertAdjacentHTML('afterend',
                    '<tr class="variation-flat-row variation-flat-empty" data-parent-product-id="' + productId + '">' +
                    '<td colspan="' + emptyColspan + '" style="padding:8px 28px;color:#888;font-size:0.9em;">No variations</td></tr>');
                return;
            }
            let list = variations;
            if (isProductReturnsPage) {
                list = variations.filter(variationHasIssueStock);
            }
            if (isProductReturnsPage && list.length === 0) {
                productRow.insertAdjacentHTML('afterend',
                    '<tr class="variation-flat-row variation-flat-empty" data-parent-product-id="' + productId + '">' +
                    '<td colspan="' + emptyColspan + '" style="padding:8px 28px;color:#888;font-size:0.9em;">No variations with return/damaged/repaired stock</td></tr>');
                return;
            }
            let insertAfter = productRow;
            list.forEach(function(variation) {
                insertAfter.insertAdjacentHTML('afterend', buildFlatVariationRowHtml(variation, productId));
                insertAfter = insertAfter.nextElementSibling;
            });
        }

        async function loadFlatVariationsForProduct(productId, productRow) {
            if (!productId || !productRow) return;
            try {
                const response = await fetch('/api/admin/inventory-product-variations/' + productId);
                const result = await response.json();
                if (result.success) {
                    insertFlatVariationRows(productRow, filterVariationsForListSearch(result.variations || []), productId);
                }
            } catch (err) {
                console.error('Error loading flat variations:', err);
            }
        }

        function initFlatProductTables() {
            if (!isFlatListPage) return;
            const rows = document.querySelectorAll('#productsFlatTable tr.product-flat-row');
            rows.forEach(function(row) {
                const pid = row.getAttribute('data-inventory-product-id');
                if (pid) loadFlatVariationsForProduct(pid, row);
            });
        }
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

        function parseInventoryDateValue(val) {
            if (val == null || val === '') return null;
            if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
            const s = String(val).trim();
            const netDate = s.match(/^\/Date\((-?\d+)\)\/$/);
            if (netDate) {
                const d = new Date(parseInt(netDate[1], 10));
                return isNaN(d.getTime()) ? null : d;
            }
            const n = Number(s);
            if (s !== '' && !isNaN(n) && /^-?\d+(\.\d+)?$/.test(s)) {
                if (n > 1e11) {
                    const d = new Date(n);
                    return isNaN(d.getTime()) ? null : d;
                }
                if (n > 25000 && n < 120000) {
                    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n * 86400000));
                    return isNaN(d.getTime()) ? null : d;
                }
            }
            const d = new Date(s);
            return isNaN(d.getTime()) ? null : d;
        }

        function formatVariationDate(val) {
            const d = parseInventoryDateValue(val);
            if (!d) return '—';
            return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
        }

        function variationShowOnStorefront(variation) {
            return variation.ShowOnStorefront !== false
                && variation.ShowOnStorefront !== 0
                && variation.ShowOnStorefront !== '0';
        }

        async function setProductStorefrontVisibility(inventoryProductId, showOnStorefront, checkboxEl) {
            try {
                const res = await fetch('/api/admin/inventory-products/' + inventoryProductId + '/storefront', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ showOnStorefront: !!showOnStorefront })
                });
                const result = await res.json();
                if (result.success) {
                    showCustomPopup(result.message || (showOnStorefront ? 'Product shown on storefront.' : 'Product hidden from storefront.'));
                } else {
                    if (checkboxEl) checkboxEl.checked = !showOnStorefront;
                    showCustomPopup(result.message || 'Failed to update storefront visibility.', true);
                }
            } catch (err) {
                if (checkboxEl) checkboxEl.checked = !showOnStorefront;
                showCustomPopup('Failed to update storefront visibility.', true);
            }
        }

        async function setVariationStorefrontVisibility(variationId, showOnStorefront, checkboxEl) {
            try {
                const res = await fetch('/api/admin/inventory-product-variations/' + variationId + '/storefront', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ showOnStorefront: !!showOnStorefront })
                });
                const result = await res.json();
                if (result.success) {
                    showCustomPopup(result.message || (showOnStorefront ? 'Shown on storefront.' : 'Hidden from storefront.'));
                } else {
                    if (checkboxEl) checkboxEl.checked = !showOnStorefront;
                    showCustomPopup(result.message || 'Failed to update storefront visibility.', true);
                }
            } catch (err) {
                if (checkboxEl) checkboxEl.checked = !showOnStorefront;
                showCustomPopup('Failed to update storefront visibility.', true);
            }
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
            if (isProductReturnsPage) {
                const qtyTds = row.querySelectorAll('td.qty-col');
                const vals = [
                    summary.returnedQuantity,
                    summary.damagedQuantity,
                    summary.repairedQuantity
                ];
                const kinds = ['returned', 'damaged', 'repaired'];
                kinds.forEach(function (kind, i) {
                    if (!qtyTds[i]) return;
                    if (kind === 'damaged' && vals[i] > 0) {
                        qtyTds[i].innerHTML = formatReturnQtyHtml(vals[i], kind);
                    } else if (kind === 'repaired' && vals[i] > 0) {
                        qtyTds[i].innerHTML = formatReturnQtyHtml(vals[i], kind);
                    } else {
                        qtyTds[i].innerHTML = formatReturnQtyHtml(vals[i], kind);
                    }
                });
                return;
            }
            const qtyCells = row.querySelectorAll('td.qty-col .stock-qty');
            if (isInventoryPage) {
                if (qtyCells[0]) {
                    if (isProductInventoryProductsTab()) {
                        qtyCells[0].textContent = summary.totalQuantity;
                        qtyCells[0].className = 'stock-qty ' + getStockQtyClass(summary.totalQuantity);
                    } else {
                        qtyCells[0].textContent = summary.availableQuantity;
                        qtyCells[0].className = 'stock-qty stock-qty-available';
                    }
                }
            } else if (isProductsListingPage) {
                if (qtyCells[0]) {
                    qtyCells[0].textContent = summary.availableQuantity;
                    qtyCells[0].className = 'stock-qty ' + getStockQtyClass(summary.availableQuantity);
                }
            } else {
                if (qtyCells[0]) {
                    qtyCells[0].textContent = summary.totalQuantity;
                    qtyCells[0].className = 'stock-qty ' + getStockQtyClass(summary.totalQuantity);
                }
                if (qtyCells[1]) {
                    qtyCells[1].textContent = summary.availableQuantity;
                    qtyCells[1].className = 'stock-qty stock-qty-available';
                }
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
            if (isProductReturnsPage && Array.isArray(variations)) {
                variations = variations.filter(variationHasIssueStock);
            }
            const loadingDiv = container.querySelector('.variations-loading');
            const tableContainer = container.querySelector('.variations-table-container');
            const emptyDiv = container.querySelector('.variations-empty');
            const tableBody = container.querySelector('.variations-table-body');
            if (!tableBody) return;

            if (!variations || variations.length === 0) {
                if (loadingDiv) loadingDiv.style.display = 'none';
                if (tableContainer) tableContainer.style.display = 'none';
                if (emptyDiv) {
                    emptyDiv.style.display = 'block';
                    const emptyMsg = emptyDiv.querySelector('p');
                    if (emptyMsg) {
                        emptyMsg.textContent = isProductReturnsPage
                            ? 'No variations with returned, damaged, or repaired stock.'
                            : 'No variations found.';
                    }
                }
                tableBody.innerHTML = '';
                return;
            }

            const rowFlags = getVariationContainerFlags(inventoryProductId);

            tableBody.innerHTML = variations.map(function(variation) {
                const imageUrl = getVariationDisplayImageUrl(variation);
                const isActive = variation.IsActive !== false && variation.IsActive !== 0 && variation.IsActive !== '0';
                const statusBadge = isActive
                    ? '<span class="status-badge status-available">Active</span>'
                    : '<span class="status-badge status-disposed">Inactive</span>';
                const price = variation.Price != null && variation.Price !== '' && !isNaN(parseFloat(variation.Price))
                    ? '₱' + parseFloat(variation.Price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                    : 'N/A';
                const variationName = variation.VariationName || 'N/A';
                const variationId = variation.VariationID || 0;
                const baseQuantity = variation.Quantity || 0;
                let availableQty = variation.AvailableQuantity;
                if ((availableQty === null || availableQty === undefined || availableQty === 0) && baseQuantity > 0) {
                    availableQty = baseQuantity;
                } else {
                    availableQty = availableQty || 0;
                }
                const damagedQty = variation.DamagedQuantity || 0;
                const pendingReturned = Number(variation.PendingInspectionQty) || 0;
                const returnedQty = isProductReturnsPage
                    ? pendingReturned
                    : (Number(variation.ReturnedQuantity) || 0) + pendingReturned;
                const repairedQty = variation.RepairedQuantity || 0;
                const disposedQty = variation.DisposedQuantity || 0;
                const calculatedTotal = availableQty + damagedQty;
                const totalQty = calculatedTotal > 0 ? calculatedTotal : baseQuantity;
                const color = variation.Color || 'N/A';
                const variationSku = variation.SKU || '—';
                const showStorefront = variationShowOnStorefront(variation);
                const showVariationCatalogEdit = isProductsListingPage;
                const showVariationInventoryEdit = isInventoryPage;
                const showVariationArchive = isInventoryPage;
                const imageHtml = '<img src="' + escapeHtml(imageUrl) + '" alt="Variation" style="width:50px;height:50px;object-fit:cover;border-radius:4px;border:1px solid #ddd;" onerror="this.src=\'/images/placeholder-no-image.svg\'">';
                const cells = [
                    { className: 'var-col-name', html: '<strong>' + escapeHtml(variationName) + '</strong>' },
                    { className: 'var-col-sku', html: '<code style="font-size:0.85em;">' + escapeHtml(variationSku) + '</code>' },
                    { className: 'var-col-color', html: escapeHtml(color) }
                ];

                if (isInventoryPage) {
                    cells.push({ className: 'qty-col', html: formatStockQty(totalQty) });
                } else if (isProductsListingPage && !isProductReturnsPage) {
                    cells.push({ className: 'qty-col var-col-qty', html: formatStockQty(availableQty) });
                } else if (isProductReturnsPage || rowFlags.showReturnCols) {
                    cells.push(
                        { className: 'qty-col var-col-qty', html: formatReturnQtyHtml(returnedQty, 'returned') },
                        { className: 'qty-col var-col-qty', html: buildDamagedQtyCellHtml(damagedQty, variationId, variationName, {
                            available: availableQty,
                            returned: returnedQty,
                            repaired: repairedQty,
                            disposed: disposedQty,
                            inventoryProductId: inventoryProductId
                        }) },
                        { className: 'qty-col var-col-qty', html: buildRepairedQtyCellHtml(repairedQty, variationId, variationName, {
                            available: availableQty,
                            returned: returnedQty,
                            damaged: damagedQty,
                            repaired: repairedQty,
                            disposed: disposedQty,
                            inventoryProductId: inventoryProductId
                        }) }
                    );
                }

                cells.push(
                    { className: 'var-col-price', style: 'text-align:center', html: price },
                    { className: 'var-col-image', style: 'text-align:center', html: imageHtml }
                );

                if (isProductsListingPage && rowFlags.showSf) {
                    cells.push({
                        className: 'var-col-action',
                        style: 'text-align:center',
                        html: '<label class="storefront-toggle-label" title="Include on customer storefront">' +
                            '<input type="checkbox" class="variation-storefront-toggle" data-variation-id="' + variationId + '"' +
                            (showStorefront ? ' checked' : '') + '> Storefront</label>'
                    });
                    cells.push({
                        className: 'last-added-cell var-col-date',
                        style: 'text-align:center',
                        html: formatVariationDate(variation.CreatedAt)
                    });
                    if (!isProductReturnsPage) {
                        cells.push({ className: 'var-col-status', style: 'text-align:center', html: statusBadge });
                    }
                    if (rowFlags.showVarAct) {
                        cells.push({
                            className: 'var-col-action',
                            style: 'text-align:center',
                            html: showVariationCatalogEdit
                                ? '<button type="button" class="edit-variation-status-btn pi-icon-edit-btn" data-mode="catalog" data-variation-id="' + variationId + '" title="Edit variation catalog" aria-label="Edit variation catalog">' + PI_SVG_EDIT + '</button>'
                                : ''
                        });
                    }
                } else if (isInventoryPage) {
                    cells.push({
                        style: 'text-align:center',
                        html: '<div style="display:flex;gap:5px;justify-content:center;flex-wrap:wrap;">' +
                            (showVariationInventoryEdit
                                ? '<button type="button" class="edit-variation-status-btn pi-icon-edit-btn" data-mode="inventory" data-variation-id="' + variationId + '" title="Edit variation" aria-label="Edit variation">' + PI_SVG_EDIT + '</button>'
                                : '') +
                            (showVariationArchive
                                ? '<button type="button" class="archive-variation-btn" data-variation-id="' + variationId + '" data-variation-name="' + escapeHtml(variationName) + '" title="Archive Variation" aria-label="Archive Variation">' + PI_SVG_ARCHIVE + '</button>'
                                : '') +
                            '</div>'
                    });
                }

                return '<tr>' + cells.map(variationRowTd).join('') + '</tr>';
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
                const response = await fetch('/api/admin/inventory-product-variations/' + inventoryProductId
                    + (isProductReturnsPage ? '?includePendingInspection=1' : ''));
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

        document.addEventListener('change', function(e) {
            const sfToggle = e.target.closest('.variation-storefront-toggle');
            if (sfToggle) {
                const vid = parseInt(sfToggle.getAttribute('data-variation-id'), 10);
                if (vid) setVariationStorefrontVisibility(vid, sfToggle.checked, sfToggle);
                return;
            }
            const productSfToggle = e.target.closest('.product-storefront-toggle');
            if (productSfToggle) {
                const ipid = parseInt(productSfToggle.getAttribute('data-inventory-product-id'), 10);
                if (ipid) setProductStorefrontVisibility(ipid, productSfToggle.checked, productSfToggle);
            }
        });

        document.addEventListener('click', function(e) {
            const toggleBtn = e.target.closest('.toggle-variations-btn');
            if (toggleBtn) {
                const inventoryProductId = toggleBtn.getAttribute('data-inventory-product-id');
                const variationsRow = document.querySelector('tr.variations-row[data-inventory-product-id="' + inventoryProductId + '"]');
                if (variationsRow) {
                    const isVisible = variationsRow.style.display !== 'none';
                    variationsRow.style.display = isVisible ? 'none' : 'table-row';
                    toggleBtn.classList.toggle('expanded', !isVisible);
                    toggleBtn.setAttribute('aria-expanded', !isVisible ? 'true' : 'false');
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
            const repairBtn = e.target.closest('.repair-variation-btn');
            if (repairBtn) {
                const vid = parseInt(repairBtn.dataset.variationId, 10);
                if (vid) openRepairVariationModal(vid, repairBtn.dataset);
                return;
            }
            const makeAvailableBtn = e.target.closest('.make-available-variation-btn');
            if (makeAvailableBtn) {
                const vid = parseInt(makeAvailableBtn.dataset.variationId, 10);
                if (vid) openMakeAvailableVariationModal(vid, makeAvailableBtn.dataset);
                return;
            }
            const editVarBtn = e.target.closest('.edit-variation-status-btn[data-variation-id]');
            if (editVarBtn && !isProductReturnsPage) {
                const vid = parseInt(editVarBtn.dataset.variationId, 10);
                if (vid && typeof window.editVariationStatus === 'function') {
                    window._variationEditMode = isProductsListingPage
                        ? 'catalog'
                        : (editVarBtn.getAttribute('data-mode') || (isInventoryPage ? 'inventory' : 'catalog'));
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
                if (toggleBtn) {
                    toggleBtn.classList.add('expanded');
                    toggleBtn.setAttribute('aria-expanded', 'true');
                }
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

        bindCreateProductPriceInput();

        if (addInventoryItemBtn && addProductModal) {
            addInventoryItemBtn.addEventListener('click', () => {
                document.getElementById('addProductForm')?.reset();
                resetCreateProductPrice();
                resetCreateProductVariations();
                resetCreateBomBundleSelect();
                resetCreateInventoryMaterials();
                const createVarList = document.getElementById('createProductVariationsList');
                if (createVarList) createVarList.appendChild(buildCreateProductVariationRow());
                updateCreateVariationTotalSummary();
                addProductModal.style.display = 'block';
            });
        }

        if (closeAddModal) {
            closeAddModal.addEventListener('click', () => {
                if (addProductModal) addProductModal.style.display = 'none';
                resetCreateProductPrice();
                resetCreateProductVariations();
                resetCreateBomBundleSelect();
                resetCreateInventoryMaterials();
});
        }

        if (cancelAddProduct) {
            cancelAddProduct.addEventListener('click', () => {
                if (addProductModal) addProductModal.style.display = 'none';
                resetCreateProductPrice();
                resetCreateProductVariations();
                resetCreateBomBundleSelect();
                resetCreateInventoryMaterials();
});
        }
        // Handle form submissions with dimensions

        function postMultipartForm(actionPath, formData) {
            return new Promise(function(resolve, reject) {
                const xhr = new XMLHttpRequest();
                const url = String(actionPath || '').startsWith('/')
                    ? actionPath
                    : ('/' + String(actionPath || '').replace(/^\/+/, ''));
                xhr.open('POST', url, true);
                xhr.withCredentials = true;
                xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
                xhr.onload = function() {
                    let result = null;
                    try {
                        result = JSON.parse(xhr.responseText || '{}');
                    } catch (parseErr) {
                        reject(new Error(
                            xhr.status === 401
                                ? 'Session expired. Please log in again.'
                                : 'Unexpected server response (HTTP ' + xhr.status + ').'
                        ));
                        return;
                    }
                    resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, result: result });
                };
                xhr.onerror = function() {
                    var hint = '';
                    if (window.location.protocol === 'https:' && /localhost|127\.0\.0\.1/i.test(window.location.hostname)) {
                        hint = ' Use http://' + window.location.hostname + ':' + (window.location.port || '5000') + ' (not https) for local dev.';
                    }
                    reject(new Error('Network error while uploading.' + hint));
                };
                xhr.send(formData);
            });
        }

        function appendVariationMediaToFormData(formData, rowOrForm, options) {
            const opts = options || {};
            const includeMain = opts.includeMain !== false;
            const mainId = opts.mainImageId || 'editVariationStatusMainImage';
            const main = (mainId && document.getElementById(mainId)) ||
                rowOrForm.querySelector?.('.variation-main-image') ||
                rowOrForm.querySelector?.('#variationMainImage') ||
                rowOrForm.querySelector?.('#editVariationStatusMainImage');
            const thumbs = rowOrForm.querySelector?.('.variation-thumbnails') || rowOrForm.querySelector?.('#variationThumbnails') || rowOrForm.querySelector?.('#editVariationStatusThumbnails');
            const model = rowOrForm.querySelector?.('.variation-model3d') || rowOrForm.querySelector?.('#variationModel3d') || rowOrForm.querySelector?.('#editVariationStatusModel3d');
            formData.delete('variationMainImage');
            formData.delete('variationThumbnail');
            formData.delete('variationThumbnails');
            formData.delete('variationModel3d');
            if (includeMain && main?.files?.[0]) formData.append('variationMainImage', main.files[0]);
            if (thumbs?.files?.length) {
                Array.from(thumbs.files).slice(0, 4).forEach((file) => formData.append('variationThumbnail', file));
            }
            if (model?.files?.[0]) formData.append('variationModel3d', model.files[0]);
        }

        function renderVariationMediaPreviews(container, data, options) {
            if (!container) return;
            const opts = options || {};
            const showMain = opts.showMain !== false;
            let html = '';
            if (showMain && data.mainImage) {
                html += buildMediaImgHtml(data.mainImage, { label: 'Main image', style: 'max-width:100px;max-height:100px;object-fit:cover;border-radius:6px;border:1px solid #dee2e6;margin-bottom:8px;' });
            }
            if (data.thumbnails && data.thumbnails.length) {
                html += '<p class="pi-media-preview-label">Thumbnails</p><div class="pi-media-preview-thumbs">';
                data.thumbnails.forEach(function(url) {
                    html += buildMediaImgHtml(url, { style: 'width:44px;height:44px;object-fit:cover;border-radius:4px;border:1px solid #dee2e6;' });
                });
                html += '</div>';
            }
            if (data.model3d) {
                const modelName = String(data.model3d).split('/').pop();
                html += '<p class="pi-media-preview-label">Current 3D model</p><span class="pi-model3d-badge">' + escapeHtml(modelName) + '</span>';
            }
            container.innerHTML = html || '<em style="color:#888;">No media uploaded yet</em>';
        }

        function renderMainImagePreview(container, imageUrl) {
            if (!container) return;
            container.innerHTML = imageUrl
                ? buildMediaImgHtml(imageUrl, { label: 'Current main image' })
                : '<em style="color:#888;">No main image</em>';
        }

        let pendingRestockAction = null;

        function initRestockConfirmModal() {
            const modal = document.getElementById('restockConfirmModal');
            if (!modal) return;
            const cancelBtn = document.getElementById('cancelRestockConfirm');
            const confirmBtn = document.getElementById('confirmRestockConfirm');
            const closeModal = function() {
                modal.classList.remove('show');
                pendingRestockAction = null;
            };
            if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
            if (confirmBtn) {
                confirmBtn.addEventListener('click', async function() {
                    const action = pendingRestockAction;
                    closeModal();
                    if (typeof action === 'function') await action();
                });
            }
            modal.addEventListener('click', function(e) {
                if (e.target === modal) closeModal();
            });
        }

        function showRestockConfirmModal(quantity, onConfirm) {
            const modal = document.getElementById('restockConfirmModal');
            const textEl = document.getElementById('restockConfirmText');
            if (!modal || !textEl) {
                if (window.confirm('Restock ' + quantity + ' unit(s)? This adds available quantity and deducts raw materials per item.')) {
                    return onConfirm();
                }
                return;
            }
            textEl.textContent = 'Restock ' + quantity + ' unit(s)?';
            pendingRestockAction = onConfirm;
            modal.classList.add('show');
        }

        function parseThumbnailUrls(raw) {
            if (!raw) return [];
            if (Array.isArray(raw)) {
                return raw.map(function(u) { return String(u || '').trim(); }).filter(Boolean);
            }
            try {
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                return Array.isArray(parsed) ? parsed : [];
            } catch (e) {
                return String(raw).includes(',') ? raw.split(',').map((x) => x.trim()).filter(Boolean) : (raw ? [raw] : []);
            }
        }

        function getVariationDisplayImageUrl(variation) {
            const thumbs = parseThumbnailUrls(variation && variation.ThumbnailURLs);
            const raw = (thumbs.length > 0 ? thumbs[0] : null) || (variation && variation.VariationImageURL) || '';
            if (!raw) return '/images/placeholder-no-image.svg';
            const resolved = resolveProductMediaUrl(raw);
            return encodeUploadPathForHtml(resolved.primary || raw);
        }

        function variationRowTd(cell) {
            const cls = cell.className ? ' class="' + cell.className + '"' : '';
            const style = cell.style ? ' style="' + cell.style + '"' : '';
            return '<td' + cls + style + '>' + cell.html + '</td>';
        }

        function getVariationContainerFlags(inventoryProductId) {
            const container = getVariationsContainerEl(inventoryProductId);
            return {
                showReturnCols: !!(container && container.getAttribute('data-show-return-columns') === '1'),
                showSf: !!(container && container.getAttribute('data-show-storefront') === '1'),
                showVarAct: !!(container && container.getAttribute('data-show-variation-actions') === '1')
            };
        }

        function resolveProductMediaUrl(rawUrl) {
            if (!rawUrl) return { primary: '', fallback: '', fallback2: '' };
            const normalized = String(rawUrl).trim().replace(/\\/g, '/');
            const ensureLeadingSlash = function(value) {
                const v = String(value || '').trim();
                if (!v) return '';
                if (/^https?:\/\//i.test(v) || v.startsWith('data:')) return v;
                return v.startsWith('/') ? v : '/' + v;
            };
            const looksLikeFilename = function(value) {
                return /\.(png|jpe?g|gif|webp|svg|glb|gltf)$/i.test(String(value || ''));
            };
            const inventoryPrefixes = [
                'Inventory/Main/Product Parent',
                'Inventory/thumbnails/Product Parent',
                'Inventory/Main/Product Variations',
                'Inventory/thumbnails/Product Variations',
                'Inventory/Model',
                'products/inventory',
                'products/images',
                'products/thumbnails',
                'products/models',
                'products',
                'variations'
            ];
            let productImage = ensureLeadingSlash(normalized);
            const bare = productImage.replace(/^\/+/, '');
            if (bare && looksLikeFilename(bare) && bare.indexOf('/') === -1) {
                productImage = '/uploads/Inventory/Main/Product Parent/' + bare;
            }
            const filename = productImage.split('/').pop();
            const candidates = [productImage];
            if (filename) {
                inventoryPrefixes.forEach(function(prefix) {
                    const candidate = '/uploads/' + prefix + '/' + filename;
                    if (candidates.indexOf(candidate) === -1) candidates.push(candidate);
                });
            }
            return {
                primary: candidates[0] || '',
                fallback: candidates[1] || '',
                fallback2: candidates[2] || ''
            };
        }

        function encodeUploadPathForHtml(pathStr) {
            if (!pathStr || /^https?:\/\//i.test(pathStr)) return pathStr || '';
            return String(pathStr).split('/').map(function(seg, i) {
                if (!seg || i === 0) return seg;
                try { return encodeURIComponent(decodeURIComponent(seg)); } catch (e) { return encodeURIComponent(seg); }
            }).join('/');
        }

        function buildMediaImgHtml(url, options) {
            const opts = options || {};
            const resolved = resolveProductMediaUrl(url);
            if (!resolved.primary) {
                return opts.emptyHtml || '<em style="color:#888;">No image</em>';
            }
            const style = opts.style || 'max-width:100px;max-height:100px;object-fit:cover;border-radius:6px;border:1px solid #dee2e6;';
            const label = opts.label ? '<p class="pi-media-preview-label">' + escapeHtml(opts.label) + '</p>' : '';
            const onerror = "if(this.dataset.fallbackSrc&&this.src.indexOf(this.dataset.fallbackSrc)===-1){this.src=this.dataset.fallbackSrc;}else if(this.dataset.fallbackSrc2&&this.src.indexOf(this.dataset.fallbackSrc2)===-1){this.src=this.dataset.fallbackSrc2;}else{this.style.display='none';}";
            return label + '<img src="' + escapeHtml(encodeUploadPathForHtml(resolved.primary)) + '" alt="' + escapeHtml(opts.alt || 'Preview') + '"' +
                ' data-fallback-src="' + escapeHtml(encodeUploadPathForHtml(resolved.fallback)) + '"' +
                ' data-fallback-src2="' + escapeHtml(encodeUploadPathForHtml(resolved.fallback2)) + '"' +
                ' style="' + style + '" onerror="' + onerror + '">';
        }

        function resolveProductMediaUrls(urls) {
            return (urls || []).map(function(url) { return resolveProductMediaUrl(url).primary; }).filter(Boolean);
        }

        function buildCreateProductVariationRow() {
            const row = document.createElement('div');
            row.className = 'create-product-variation-row pi-variation-row';
            row.innerHTML = `
                <div>
                    <label>Variation Name</label>
                    <input type="text" class="create-variation-name" required placeholder="e.g. Red">
                </div>
                <div>
                    <label>Color</label>
                    <input type="text" class="create-variation-color" placeholder="Optional">
                </div>
                <div>
                    <label>Qty</label>
                    <input type="number" class="create-variation-quantity" min="1" value="1" required>
                </div>
                <div class="pi-var-media">
                    <div>
                        <label>Main Image</label>
                        <input type="file" class="create-variation-main-image variation-main-image" accept="image/*">
                    </div>
                    <div>
                        <label>Thumbnails (max 4)</label>
                        <input type="file" class="create-variation-thumbnails variation-thumbnails" accept="image/*" multiple>
                    </div>
                </div>
                <div class="pi-var-full">
                    <label>3D Model (GLB/GLTF)</label>
                    <input type="file" class="create-variation-model3d variation-model3d" accept=".glb,.gltf,model/gltf-binary,model/gltf+json">
                </div>
                <div class="pi-variation-remove">
                    <button type="button" class="remove-create-variation-btn" title="Remove">×</button>
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

        function sanitizeCreateProductPriceRaw(str) {
            let v = String(str || '').replace(/[^\d.]/g, '');
            const dot = v.indexOf('.');
            if (dot !== -1) {
                v = v.slice(0, dot + 1) + v.slice(dot + 1).replace(/\./g, '');
                const dec = v.slice(dot + 1);
                if (dec.length > 2) v = v.slice(0, dot + 3);
            }
            return v;
        }

        function formatCreateProductPriceAuto(el) {
            if (!el) return;
            let v = sanitizeCreateProductPriceRaw(el.value);
            if (!v || v === '.') {
                el.value = v;
                return;
            }
            if (v.endsWith('.')) v = v.slice(0, -1);
            const num = parseFloat(v);
            if (Number.isFinite(num)) el.value = num.toFixed(2);
        }

        function bindCreateProductPriceInput() {
            const el = document.getElementById('createProductPrice');
            if (!el || el.dataset.priceBound === '1') return;
            el.dataset.priceBound = '1';
            el.addEventListener('input', function () {
                const v = sanitizeCreateProductPriceRaw(el.value);
                if (el.value !== v) el.value = v;
            });
            el.addEventListener('focusout', function () { formatCreateProductPriceAuto(el); });
            el.addEventListener('change', function () { formatCreateProductPriceAuto(el); });
            el.addEventListener('paste', function (e) {
                e.preventDefault();
                const text = (e.clipboardData || window.clipboardData).getData('text') || '';
                el.value = sanitizeCreateProductPriceRaw(text);
                formatCreateProductPriceAuto(el);
            });
        }

        function resetCreateProductPrice() {
            const el = document.getElementById('createProductPrice');
            if (el) el.value = '';
        }

        function getCreateProductUnitPrice() {
            const el = document.getElementById('createProductPrice');
            if (!el) return null;
            formatCreateProductPriceAuto(el);
            const priceVal = parseFloat(el.value);
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

        window.restockVariationInline = async function(variationId, inventoryProductId, buttonEl, qtyOverride) {
            const modalQtyInput = document.getElementById('editVariationRestockQty');
            const qtyInput = qtyOverride != null
                ? null
                : (modalQtyInput || document.getElementById('restock-qty-' + variationId));
            const quantity = qtyOverride != null
                ? parseInt(qtyOverride, 10)
                : parseInt(qtyInput?.value, 10);
            if (!variationId || !inventoryProductId || !quantity || quantity <= 0) {
                showCustomPopup('Enter a positive restock quantity.', true);
                return;
            }
            showRestockConfirmModal(quantity, async function() {
                await executeRestockVariationInline(variationId, inventoryProductId, buttonEl, quantity);
            });
        };

        async function executeRestockVariationInline(variationId, inventoryProductId, buttonEl, quantity) {
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
                    if (document.getElementById('editVariationStatusModal')?.style.display === 'block' && typeof window.editVariationStatus === 'function') {
                        await window.editVariationStatus(variationId);
                    }
                    if (typeof loadInventoryProductVariations === 'function') {
                        await loadInventoryProductVariations(inventoryProductId);
                    }
                } else {
                    showCustomPopup(result.message || 'Restock failed.', true);
                }
            } catch (err) {
                showCustomPopup('Restock failed: ' + err.message, true);
            } finally {
                if (buttonEl) {
                    buttonEl.disabled = false;
                    buttonEl.textContent = buttonEl.id === 'editVariationRestockBtn' ? 'Add Stock' : 'Add';
                }
            }
        }

        let allRawMaterials = [];

        document.addEventListener('rawMaterialArchived', function (e) {
            const id = e.detail && e.detail.materialId;
            if (!id) return;
            allRawMaterials = allRawMaterials.filter(function (m) {
                return String(m.id) !== String(id);
            });
        });

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
            const skuPart = material.sku ? material.sku + ' — ' : '';
            return skuPart + material.name + ' (stock: ' + getMaterialStockQty(material) + ')';
        }

        async function applyBomBundleToCreateForm(bundleId) {
            const container = document.getElementById('createInventoryMaterialsContainer');
            if (!container) return;
            resetCreateInventoryMaterials();
            if (!bundleId) {
                if (allRawMaterials.length > 0) {
                    container.appendChild(createCreateInventoryMaterialRow());
                }
                updateCreateInventoryMaterialsSummary();
                return;
            }
            try {
                const res = await fetch('/api/admin/bom-bundles/' + bundleId, { credentials: 'include' });
                const data = await res.json();
                if (!data.success || !data.materials || !data.materials.length) {
                    showCustomPopup(data.message || 'Bundle has no materials.', true);
                    return;
                }
                data.materials.forEach(function (m) {
                    container.appendChild(createCreateInventoryMaterialRow(m.materialId, m.quantityRequired));
                });
                const statusEl = document.getElementById('createInventoryRecipeStatus');
                if (statusEl && data.bundle) {
                    statusEl.innerHTML = '<span style="color:#155724;">Loaded from bundle <strong>' +
                        (data.bundle.BundleCode || '') + '</strong></span>';
                }
                updateCreateInventoryMaterialsSummary();
            } catch (err) {
                showCustomPopup('Failed to load BOM bundle.', true);
            }
        }

        function resetCreateBomBundleSelect() {
            const sel = document.getElementById('createBomBundleSelect');
            if (sel) sel.value = '';
        }

        const createBomBundleSelect = document.getElementById('createBomBundleSelect');
        if (createBomBundleSelect) {
            createBomBundleSelect.addEventListener('change', function () {
                applyBomBundleToCreateForm(this.value);
            });
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
                const priceEl = document.getElementById('createProductPrice');
                if (priceEl) priceEl.value = unitPrice.toFixed(2);
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
                    showCustomPopup('Select a BOM bundle or add at least one raw material with quantity per unit.', true);
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
                const actionPath = this.getAttribute('action') || '/Employee/Admin/ProductInventory/Add';
                try {
                    const response = await postMultipartForm(actionPath, formData);
                    const result = response.result;
                    if (response.ok && result.success) {
                        showCustomPopup(result.message || 'Product created.');
                        setTimeout(function() {
                            window.location.href = '/Employee/Admin/ProductInventory';
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

        // Manage Categories modal (persisted via /api/admin/product-categories)
        let managedCategories = [];

        function collectCategoriesFromSelect(selectEl) {
            if (!selectEl) return [];
            return Array.from(selectEl.options)
                .map(function(opt) { return (opt.value || '').trim(); })
                .filter(function(val) { return val.length > 0; });
        }

        function syncCategoryDropdowns() {
            const categorySelect = document.getElementById('category');
            const filterSelect = document.getElementById('invCategory');
            [categorySelect, filterSelect].forEach(function(selectEl) {
                if (!selectEl) return;
                const current = selectEl.value;
                const isFilter = selectEl.id === 'invCategory';
                const placeholder = isFilter
                    ? { value: '', text: 'All categories' }
                    : { value: '', text: 'Select a category' };
                selectEl.innerHTML = '';
                const ph = document.createElement('option');
                ph.value = placeholder.value;
                ph.textContent = placeholder.text;
                selectEl.appendChild(ph);
                managedCategories.forEach(function(cat) {
                    const option = document.createElement('option');
                    option.value = cat;
                    option.textContent = cat;
                    selectEl.appendChild(option);
                });
                if (current && managedCategories.indexOf(current) !== -1) {
                    selectEl.value = current;
                }
            });
        }

        function seedManagedCategories() {
            const fromSelect = collectCategoriesFromSelect(document.getElementById('category'));
            const fromFilter = collectCategoriesFromSelect(document.getElementById('invCategory'));
            const merged = fromSelect.concat(fromFilter);
            managedCategories = merged.filter(function(cat, idx) { return merged.indexOf(cat) === idx; }).sort();
        }

        function isCategoryInUse(categoryName) {
            const rows = document.querySelectorAll('#productsTab table tbody tr:not(.variations-row)');
            for (let i = 0; i < rows.length; i++) {
                const cells = rows[i].querySelectorAll('td');
                if (cells.length < 3) continue;
                const cellText = (cells[1].textContent || '').trim();
                if (cellText === categoryName) return true;
            }
            return false;
        }

        function loadCategoriesList() {
            const listEl = document.getElementById('piCategoriesList');
            if (!listEl) return;
            if (!managedCategories.length) {
                listEl.innerHTML = '<p style="color:#888;font-size:0.85em;">No categories yet. Add one above.</p>';
                return;
            }
            listEl.innerHTML = managedCategories.map(function(cat) {
                const safe = escapeHtml(cat).replace(/'/g, "\\'");
                return '<div class="pi-category-row"><span>' + escapeHtml(cat) + '</span>' +
                    '<button type="button" class="pi-btn" style="background:#dc3545;color:#fff;padding:4px 10px;" data-category-name="' + safe + '">Delete</button></div>';
            }).join('');
            listEl.querySelectorAll('button[data-category-name]').forEach(function(btn) {
                btn.addEventListener('click', async function() {
                    const name = btn.getAttribute('data-category-name');
                    if (isCategoryInUse(name)) {
                        showCustomPopup('Cannot delete "' + name + '". It is used by one or more products.', true);
                        return;
                    }
                    btn.disabled = true;
                    try {
                        const result = await deleteProductCategory(name);
                        if (!result.success) {
                            showCustomPopup(result.message || 'Failed to delete category.', true);
                            return;
                        }
                        await fetchProductCategoriesFromServer();
                        loadCategoriesList();
                        showCustomPopup(result.message || 'Category removed.');
                    } catch (err) {
                        showCustomPopup('Failed to delete category.', true);
                    } finally {
                        btn.disabled = false;
                    }
                });
            });
        }

        async function fetchProductCategoriesFromServer() {
            try {
                const res = await fetch('/api/admin/product-categories', { credentials: 'include' });
                const data = await res.json();
                if (data.success && Array.isArray(data.categories)) {
                    managedCategories = data.categories.filter(Boolean).sort();
                    syncCategoryDropdowns();
                }
            } catch (err) {
                console.error('Failed to load product categories:', err);
            }
        }

        async function saveProductCategory(name) {
            const res = await fetch('/api/admin/product-categories', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name })
            });
            return res.json();
        }

        async function deleteProductCategory(name) {
            const res = await fetch('/api/admin/product-categories/' + encodeURIComponent(name), {
                method: 'DELETE',
                credentials: 'include'
            });
            return res.json();
        }

        function openManageCategoriesModal() {
            const modal = document.getElementById('piManageCategoriesModal');
            if (!modal) return;
            const listEl = document.getElementById('piCategoriesList');
            if (listEl) listEl.innerHTML = '<em style="color:#888;">Loading…</em>';
            modal.style.display = 'block';
            fetchProductCategoriesFromServer().then(function() {
                loadCategoriesList();
            });
        }

        function closeManageCategoriesModal() {
            const modal = document.getElementById('piManageCategoriesModal');
            if (modal) modal.style.display = 'none';
        }

        function initManageCategories() {
            seedManagedCategories();
            const manageBtn = document.getElementById('manageCategoriesBtn');
            const addBtn = document.getElementById('piAddCategoryBtn');
            const newInput = document.getElementById('piNewCategoryName');
            if (manageBtn) {
                manageBtn.addEventListener('click', openManageCategoriesModal);
            }
            ['piCloseManageCategories', 'piCloseManageCategoriesBtn'].forEach(function(id) {
                const el = document.getElementById(id);
                if (el) el.addEventListener('click', closeManageCategoriesModal);
            });
            if (addBtn && newInput) {
                addBtn.addEventListener('click', async function() {
                    const newCat = newInput.value.trim();
                    if (!newCat) {
                        showCustomPopup('Enter a category name.', true);
                        return;
                    }
                    if (managedCategories.indexOf(newCat) !== -1) {
                        showCustomPopup('This category already exists.', true);
                        return;
                    }
                    addBtn.disabled = true;
                    try {
                        const result = await saveProductCategory(newCat);
                        if (!result.success) {
                            showCustomPopup(result.message || 'Failed to add category.', true);
                            return;
                        }
                        await fetchProductCategoriesFromServer();
                        newInput.value = '';
                        loadCategoriesList();
                        showCustomPopup(result.message || 'Category added.');
                    } catch (err) {
                        showCustomPopup('Failed to add category.', true);
                    } finally {
                        addBtn.disabled = false;
                    }
                });
            }
        }

        if (isInventoryPage) {
            initManageCategories();
            fetchProductCategoriesFromServer();
        }

        if (isProductsListingPage && window.__adminProductCategories && Array.isArray(window.__adminProductCategories)) {
            managedCategories = window.__adminProductCategories.slice();
        }

        if (isProductsListingPage) {
            fetchProductCategoriesFromServer();
        }

        function buildManagedCategoryNames(selected) {
            const names = [];
            function add(cat) {
                const value = (cat || '').trim();
                if (value && names.indexOf(value) === -1) names.push(value);
            }
            collectCategoriesFromSelect(document.getElementById('category')).forEach(add);
            collectCategoriesFromSelect(document.getElementById('invCategory')).forEach(add);
            managedCategories.forEach(add);
            add(selected);
            return names.sort();
        }

        function fillCategorySelectElement(selectEl, selected) {
            if (!selectEl) return;
            const names = buildManagedCategoryNames(selected);
            selectEl.innerHTML = '';
            names.forEach(function(cat) {
                const option = document.createElement('option');
                option.value = cat;
                option.textContent = cat;
                selectEl.appendChild(option);
            });
            if (selected) selectEl.value = selected;
        }

        function populateEditProductCategorySelect(selected) {
            fillCategorySelectElement(document.getElementById('editInventoryProductCategory'), selected);
        }

        function populateQuickEditProductCategorySelect(selected) {
            fillCategorySelectElement(document.getElementById('editInventoryProductQuickCategory'), selected);
        }

        function openEditInventoryProductModal(productId) {
            const modal = document.getElementById('editInventoryProductModal');
            if (!modal) return;
            fetch('/api/admin/inventory-product/' + productId + '?source=InventoryProducts', { credentials: 'include' })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (!data.success || !data.product) {
                        showCustomPopup(data.message || 'Failed to load product.', true);
                        return;
                    }
                    const p = data.product;
                    document.getElementById('editInventoryProductId').value = productId;
                    document.getElementById('editInventoryProductName').value = p.Name || '';
                    document.getElementById('editInventoryProductCurrentImage').value = p.ImageURL || '';
                    const descEl = document.getElementById('editInventoryProductDescription');
                    if (descEl) descEl.value = p.Description || '';
                    const thumbsHidden = document.getElementById('editInventoryProductCurrentThumbnails');
                    const thumbUrls = parseThumbnailUrls(p.ThumbnailURLs);
                    if (thumbsHidden) thumbsHidden.value = JSON.stringify(thumbUrls);
                    populateEditProductCategorySelect(p.Category || '');
                    const preview = document.getElementById('editInventoryProductImagePreview');
                    if (preview) {
                        preview.innerHTML = p.ImageURL
                            ? buildMediaImgHtml(p.ImageURL, { label: 'Current main image' })
                            : '<em style="color:#888;">No main image</em>';
                    }
                    const thumbsPreview = document.getElementById('editInventoryProductThumbnailsPreview');
                    if (thumbsPreview) {
                        if (thumbUrls.length) {
                            thumbsPreview.innerHTML = '<p class="pi-media-preview-label">Current thumbnails</p>' +
                                thumbUrls.map(function(url) {
                                    return buildMediaImgHtml(url, { style: 'width:44px;height:44px;object-fit:cover;border-radius:4px;border:1px solid #dee2e6;' });
                                }).join('');
                        } else {
                            thumbsPreview.innerHTML = '';
                        }
                    }
                    modal.style.display = 'block';
                })
                .catch(function() { showCustomPopup('Failed to load product.', true); });
        }

        function initEditInventoryProductModal() {
            const modal = document.getElementById('editInventoryProductModal');
            const form = document.getElementById('editInventoryProductForm');
            if (!modal || !form) return;
            const close = function() { modal.style.display = 'none'; form.reset(); };
            ['closeEditInventoryProductModal', 'cancelEditInventoryProduct'].forEach(function(id) {
                const el = document.getElementById(id);
                if (el) el.addEventListener('click', close);
            });
            form.addEventListener('submit', async function(e) {
                e.preventDefault();
                const id = document.getElementById('editInventoryProductId').value;
                const fd = new FormData(form);
                const thumbInput = document.getElementById('editInventoryProductThumbnails');
                if (thumbInput && thumbInput.files && thumbInput.files.length) {
                    fd.delete('productThumbnail');
                    Array.from(thumbInput.files).slice(0, 4).forEach(function(file) {
                        fd.append('productThumbnail', file);
                    });
                }
                const btn = document.getElementById('saveEditInventoryProduct');
                if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
                try {
                    const res = await fetch('/api/admin/inventory-products/' + id + '/update-basic', {
                        method: 'POST',
                        credentials: 'include',
                        body: fd
                    });
                    const result = await res.json();
                    if (result.success) {
                        showCustomPopup(result.message || 'Product updated.');
                        close();
                        window.location.reload();
                    } else {
                        showCustomPopup(result.message || 'Update failed.', true);
                    }
                } catch (err) {
                    showCustomPopup('Update failed: ' + err.message, true);
                } finally {
                    if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
                }
            });
            document.addEventListener('click', function(e) {
                const btn = e.target.closest('.edit-inventory-product-btn');
                if (!btn) return;
                const pid = parseInt(btn.getAttribute('data-product-id'), 10);
                if (pid) openEditInventoryProductModal(pid);
            });
        }

        if (isProductsListingPage) initEditInventoryProductModal();
        if (isInventoryPage) initEditInventoryProductQuickModal();
        if (isInventoryPage) initRestockConfirmModal();

        function openEditInventoryProductQuickModal(productId) {
            const modal = document.getElementById('editInventoryProductQuickModal');
            if (!modal) return;
            fetch('/api/admin/inventory-product/' + productId + '?source=InventoryProducts', { credentials: 'include' })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (!data.success || !data.product) {
                        showCustomPopup(data.message || 'Failed to load product.', true);
                        return;
                    }
                    const p = data.product;
                    document.getElementById('editInventoryProductQuickId').value = productId;
                    document.getElementById('editInventoryProductQuickName').value = p.Name || '';
                    document.getElementById('editInventoryProductQuickCurrentImage').value = p.ImageURL || '';
                    populateQuickEditProductCategorySelect(p.Category || '');
                    const preview = document.getElementById('editInventoryProductQuickImagePreview');
                    if (preview) {
                        preview.innerHTML = p.ImageURL
                            ? buildMediaImgHtml(p.ImageURL, { label: 'Current main image', style: 'max-width:120px;max-height:120px;object-fit:cover;border-radius:4px;border:1px solid #ddd;' })
                            : '<em style="color:#888;">No image</em>';
                    }
                    modal.style.display = 'block';
                })
                .catch(function() { showCustomPopup('Failed to load product.', true); });
        }

        function initEditInventoryProductQuickModal() {
            const modal = document.getElementById('editInventoryProductQuickModal');
            const form = document.getElementById('editInventoryProductQuickForm');
            if (!modal || !form) return;
            const close = function() { modal.style.display = 'none'; form.reset(); };
            ['closeEditInventoryProductQuickModal', 'cancelEditInventoryProductQuick'].forEach(function(id) {
                const el = document.getElementById(id);
                if (el) el.addEventListener('click', close);
            });
            form.addEventListener('submit', async function(e) {
                e.preventDefault();
                const id = document.getElementById('editInventoryProductQuickId').value;
                const fd = new FormData(form);
                const btn = document.getElementById('saveEditInventoryProductQuick');
                if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }
                try {
                    const res = await fetch('/api/admin/inventory-products/' + id + '/update-basic', {
                        method: 'POST', credentials: 'include', body: fd
                    });
                    const result = await res.json();
                    if (result.success) {
                        showCustomPopup(result.message || 'Product updated.');
                        close();
                        window.location.reload();
                    } else {
                        showCustomPopup(result.message || 'Update failed.', true);
                    }
                } catch (err) {
                    showCustomPopup('Update failed: ' + err.message, true);
                } finally {
                    if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
                }
            });
            document.addEventListener('click', function(e) {
                const btn = e.target.closest('.edit-inventory-product-quick-btn');
                if (!btn) return;
                const pid = parseInt(btn.getAttribute('data-product-id'), 10);
                if (pid) openEditInventoryProductQuickModal(pid);
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
            if (!getVariationsContainer()) return;
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
            let variation = (window.currentVariations || []).find(function(v) { return v.VariationID === variationId; });
            if (!variation) {
                variation = {
                    VariationID: variationId,
                    InventoryProductID: window.currentVariationProductId || currentSelectedProductId
                };
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
                const variationNameEl = document.getElementById('editVariationStatusName');
                const loadedVariationName = variationData.VariationName || variation.VariationName || '';
                if (variationNameEl) {
                    variationNameEl.value = loadedVariationName || 'N/A';
                    variationNameEl.setAttribute('data-initial-name', loadedVariationName);
                }

                const parentInvId = variationData.InventoryProductID || variation.InventoryProductID || currentSelectedProductId;
                const invIdEl = document.getElementById('editVariationStatusInventoryProductID');
                if (invIdEl) invIdEl.value = parentInvId || '';
                const skuEl = document.getElementById('editVariationStatusSku');
                const colorEl = document.getElementById('editVariationStatusColor');
                const loadedSku = variationData.SKU || '';
                const loadedColor = variationData.Color || '';
                if (skuEl) {
                    skuEl.value = loadedSku;
                    skuEl.setAttribute('data-initial-sku', loadedSku);
                }
                if (colorEl) {
                    colorEl.value = loadedColor;
                    colorEl.setAttribute('data-initial-color', loadedColor);
                }
                renderMainImagePreview(
                    document.getElementById('editVariationStatusMainImagePreview'),
                    variationData.VariationImageURL || null
                );
                renderMainImagePreview(
                    document.getElementById('editVariationCatalogMainImagePreview'),
                    variationData.VariationImageURL || null
                );
                const restockQtyEl = document.getElementById('editVariationRestockQty');
                if (restockQtyEl) restockQtyEl.value = '1';
                if (!isProductReturnsPage && !isProductsListingPage) {
                    await loadEditVariationRecipe(parentInvId);
                } else {
                    resetEditVariationMaterials();
                    const recipeHidden = document.getElementById('editVariationRecipeMaterials');
                    if (recipeHidden) {
                        recipeHidden.value = '';
                        recipeHidden.setAttribute('data-initial-recipe', '[]');
                    }
                    const rs = document.getElementById('editVariationRecipeStatus');
                    if (rs) rs.innerHTML = '';
                }
                
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
                
                const currentReturned = variationData.ReturnedQuantity || 0;
                const currentDamaged = variationData.DamagedQuantity || 0;
                const currentRepaired = variationData.RepairedQuantity || 0;
                const currentDisposed = variationData.DisposedQuantity || 0;
                
                // Total = Available + Damaged
                // If the sum is 0 but we have Quantity, use Quantity as the total
                const calculatedTotal = currentAvailable + currentDamaged;
                const currentTotal = (calculatedTotal > 0) ? calculatedTotal : quantityFromDB;

                document.getElementById('currentVariationStatusAvailableQty').textContent = currentAvailable;
                document.getElementById('currentVariationStatusReturnedQty').textContent = currentReturned;
                document.getElementById('currentVariationStatusDamagedQty').textContent = currentDamaged;
                document.getElementById('currentVariationStatusRepairedQty').textContent = currentRepaired;
                document.getElementById('currentVariationStatusDisposedQty').textContent = currentDisposed;

                // Set hidden inputs
                document.getElementById('editVariationStatusAvailableQuantity').value = currentAvailable;
                document.getElementById('editVariationStatusReturnedQuantity').value = currentReturned;
                document.getElementById('editVariationStatusDamagedQuantity').value = currentDamaged;
                document.getElementById('editVariationStatusRepairedQuantity').value = currentRepaired;
                document.getElementById('editVariationStatusDisposedQuantity').value = currentDisposed;
                
                const mediaPreview = document.getElementById('editVariationStatusMediaPreview');
                if (!isProductReturnsPage && (isProductsListingPage || isInventoryPage)) {
                    renderVariationMediaPreviews(mediaPreview, {
                        mainImage: variationData.VariationImageURL || null,
                        thumbnails: parseThumbnailUrls(variationData.ThumbnailURLs),
                        model3d: variationData.Model3D || null
                    }, { showMain: false });
                } else if (mediaPreview) {
                    mediaPreview.innerHTML = '';
                }

                // Removed Notes field for compact modal

                // Reset status select
                document.getElementById('editVariationStatusSelect').value = '';
                document.getElementById('variationStatusQuantityInputContainer').style.display = 'none';

                updateVariationTotalQuantity();

                // Attach event listeners when modal is opened (in case they weren't attached on page load)
                attachEditVariationStatusListeners();
                attachEditVariationStatusCloseListeners();
                configureVariationEditModalForPage();

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
                    case 'returned':
                        currentQty = parseInt(document.getElementById('currentVariationStatusReturnedQty').textContent) || 0;
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
            const currentReturned = parseInt(document.getElementById('currentVariationStatusReturnedQty').textContent) || 0;
            const currentDamaged = parseInt(document.getElementById('currentVariationStatusDamagedQty').textContent) || 0;
            const currentRepaired = parseInt(document.getElementById('currentVariationStatusRepairedQty').textContent) || 0;
            const currentDisposed = parseInt(document.getElementById('currentVariationStatusDisposedQty').textContent) || 0;
            
            let quantityChange = 0;
            switch(statusSelect.value) {
                case 'available':
                    quantityChange = newQuantity - currentAvailable;
                    break;
                case 'returned':
                    quantityChange = newQuantity - currentReturned;
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
            let newReturned = currentReturned;
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
                    case 'returned': quantityChange = newQuantity - currentReturned; break;
                    case 'damaged': quantityChange = newQuantity; break;
                    case 'repaired': quantityChange = newQuantity; break;
                    case 'disposed': quantityChange = newQuantity; break;
                }
            }
            
            if (isNaN(newQuantity) || !Number.isInteger(parseFloat(quantityInput.value))) {
                showCustomPopup('Please enter a valid whole number for quantity.', true);
                switch(statusSelect.value) {
                    case 'available': quantityInput.value = currentAvailable; break;
                    case 'returned': quantityInput.value = currentReturned; break;
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
                case 'returned':
                    newReturned = newQuantity;
                    if (newReturned < 0) newReturned = 0;
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
            newReturned = Math.max(0, newReturned);
            newDamaged = Math.max(0, newDamaged);
            newRepaired = Math.max(0, newRepaired);
            newDisposed = Math.max(0, newDisposed);
            
            // Update hidden inputs
            document.getElementById('editVariationStatusAvailableQuantity').value = newAvailable;
            document.getElementById('editVariationStatusReturnedQuantity').value = newReturned;
            document.getElementById('editVariationStatusDamagedQuantity').value = newDamaged;
            document.getElementById('editVariationStatusRepairedQuantity').value = newRepaired;
            document.getElementById('editVariationStatusDisposedQuantity').value = newDisposed;
            
            // Update display
            document.getElementById('currentVariationStatusAvailableQty').textContent = newAvailable;
            document.getElementById('currentVariationStatusReturnedQty').textContent = newReturned;
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
                const currentReturned = parseInt(document.getElementById('currentVariationStatusReturnedQty').textContent) || 0;
                const currentDamaged = parseInt(document.getElementById('currentVariationStatusDamagedQty').textContent) || 0;
                const currentRepaired = parseInt(document.getElementById('currentVariationStatusRepairedQty').textContent) || 0;
                const currentDisposed = parseInt(document.getElementById('currentVariationStatusDisposedQty').textContent) || 0;

                const finalAvailable = parseInt(document.getElementById('editVariationStatusAvailableQuantity').value) || 0;
                const finalReturned = parseInt(document.getElementById('editVariationStatusReturnedQuantity').value) || 0;
                const finalDamaged = parseInt(document.getElementById('editVariationStatusDamagedQuantity').value) || 0;
                const finalRepaired = parseInt(document.getElementById('editVariationStatusRepairedQuantity').value) || 0;
                const finalDisposed = parseInt(document.getElementById('editVariationStatusDisposedQuantity').value) || 0;

                const quantitiesChanged = (finalAvailable !== currentAvailable) ||
                    (finalReturned !== currentReturned) ||
                    (finalDamaged !== currentDamaged) ||
                    (finalRepaired !== currentRepaired) ||
                    (finalDisposed !== currentDisposed);

                const catalogMode = isProductsListingPage && window._variationEditMode === 'catalog';
                const inventoryMode = isInventoryPage && window._variationEditMode === 'inventory';
                const colorInput = document.getElementById('editVariationStatusColor');
                const skuInput = document.getElementById('editVariationStatusSku');
                const initialColor = colorInput?.getAttribute('data-initial-color') || '';
                const initialSku = skuInput?.getAttribute('data-initial-sku') || '';
                const colorChanged = (catalogMode || inventoryMode) && colorInput
                    && String(colorInput.value || '').trim() !== String(initialColor).trim();
                const skuChanged = inventoryMode && skuInput
                    && String(skuInput.value || '').trim() !== String(initialSku).trim();
                const hasMainImageUpload = inventoryMode && !!(document.getElementById('editVariationStatusMainImage')?.files?.length);
                const hasMediaUpload = catalogMode && (!!(document.getElementById('editVariationStatusThumbnails')?.files?.length) ||
                    document.getElementById('editVariationStatusModel3d')?.files?.length ||
                    document.getElementById('editVariationCatalogMainImage')?.files?.length);
                const variationNameInput = document.getElementById('editVariationStatusName');
                const initialVariationName = variationNameInput?.getAttribute('data-initial-name') || '';
                const variationNameChanged = catalogMode && variationNameInput
                    && String(variationNameInput.value || '').trim() !== String(initialVariationName).trim();

                const currentRecipeJson = JSON.stringify(getEditVariationRequiredMaterials());
                const initialRecipeJson = document.getElementById('editVariationRecipeMaterials')?.getAttribute('data-initial-recipe') || '[]';
                const recipeChanged = !isProductReturnsPage && !catalogMode && currentRecipeJson !== initialRecipeJson;

                if (catalogMode) {
                    const vName = String(variationNameInput?.value || '').trim();
                    if (!vName) {
                        showCustomPopup('Variation name is required.', true);
                        return;
                    }
                    if (!variationNameChanged && !hasMediaUpload && !colorChanged) {
                        showCustomPopup('No changes detected. Update the variation name, color, main image, thumbnails, or 3D model before saving.', true);
                        return;
                    }
                } else if (inventoryMode) {
                    if (!skuChanged && !colorChanged && !hasMainImageUpload) {
                        showCustomPopup('No changes detected. Update SKU, color, or main image before saving.', true);
                        return;
                    }
                } else if (!quantitiesChanged && !selectedStatus && !hasMediaUpload && !recipeChanged) {
                    const noChangeMsg = isProductReturnsPage
                        ? 'No changes detected. Select a status or adjust quantities before saving.'
                        : 'No changes detected. Modify quantities or select a status before saving.';
                    showCustomPopup(noChangeMsg, true);
                    return;
                }

                if (isInventoryPage && (quantitiesChanged || selectedStatus)) {
                    showCustomPopup('Status quantity changes are managed on the Product Returns page.', true);
                    return;
                }

                const newAvailableQty = finalAvailable;
                const newReturnedQty = finalReturned;
                const newDamagedQty = finalDamaged;
                const newRepairedQty = finalRepaired;
                const newDisposedQty = finalDisposed;
                const notes = ''; // Removed Notes field for compact modal
                
                const calculatedTotalForBackend = newAvailableQty + newDamagedQty;
                
                const formData = new FormData();
                formData.append('variationID', parseInt(variationId));
                formData.append('availableQuantity', newAvailableQty);
                formData.append('returnedQuantity', newReturnedQty);
                formData.append('damagedQuantity', newDamagedQty);
                formData.append('repairedQuantity', newRepairedQty);
                formData.append('disposedQuantity', newDisposedQty);
                formData.append('notes', notes || '');
                if (catalogMode) {
                    formData.append('catalogOnly', '1');
                    const vName = String(variationNameInput?.value || '').trim();
                    if (vName) formData.append('variationName', vName);
                    if (colorInput) formData.append('color', String(colorInput.value || '').trim());
                    appendVariationMediaToFormData(formData, document.getElementById('editVariationStatusForm'), {
                        includeMain: true,
                        mainImageId: 'editVariationCatalogMainImage'
                    });
                } else if (inventoryMode) {
                    formData.append('inventoryEdit', '1');
                    if (skuInput) formData.append('sku', String(skuInput.value || '').trim());
                    if (colorInput) formData.append('color', String(colorInput.value || '').trim());
                    appendVariationMediaToFormData(formData, document.getElementById('editVariationStatusForm'), { includeMain: true });
                } else if (!isProductReturnsPage) {
                    appendVariationMediaToFormData(formData, document.getElementById('editVariationStatusForm'));
                }
                formData.append('recipeMaterials', (isProductReturnsPage || catalogMode)
                    ? '[]'
                    : JSON.stringify(getEditVariationRequiredMaterials()));
                
                console.log('Final quantities to save:', {
                    available: newAvailableQty,
                    returned: newReturnedQty,
                    damaged: newDamagedQty,
                    repaired: newRepairedQty,
                    disposed: newDisposedQty,
                    calculatedTotal: calculatedTotalForBackend
                });

                // Enhanced validation: If status is selected and quantity input is visible, it should have a value
                if (selectedStatus && !isInventoryPage) {
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
                if (newAvailableQty < 0 || newReturnedQty < 0 || newDamagedQty < 0 || newRepairedQty < 0 || newDisposedQty < 0) {
                    showCustomPopup('Validation Error: Quantities cannot be negative. Please check your inputs.', true);
                    return;
                }

                // Enhanced validation: Maximum quantity check
                const MAX_QUANTITY = 999999;
                if (newAvailableQty > MAX_QUANTITY || newReturnedQty > MAX_QUANTITY || newDamagedQty > MAX_QUANTITY ||
                    newRepairedQty > MAX_QUANTITY || newDisposedQty > MAX_QUANTITY) {
                    showCustomPopup(`Validation Error: Quantities cannot exceed ${MAX_QUANTITY.toLocaleString()}. Please check your inputs.`, true);
                    return;
                }

                const stockDelta = (newAvailableQty + newDamagedQty) - (currentAvailable + currentDamaged);
                if (!isProductReturnsPage && stockDelta > 0) {
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
                        showCustomPopup(catalogMode
                            ? 'Variation catalog updated.'
                            : 'Variation status updated. Product inventory totals are synced.');
                        const editVariationStatusModal = document.getElementById('editVariationStatusModal');
                        if (editVariationStatusModal) editVariationStatusModal.style.display = 'none';
                        const pid = currentSelectedProductId || window.currentVariationProductId;
                        if (pid) {
                            if (catalogMode) {
                                await loadInventoryProductVariations(pid);
                            } else {
                                await notifyInventoryStockChanged(pid, result);
                            }
                            if (isFlatListPage) {
                                const productRow = document.querySelector('#productsFlatTable tr.product-flat-row[data-inventory-product-id="' + pid + '"]');
                                if (productRow) loadFlatVariationsForProduct(pid, productRow);
                            } else if (isProductReturnsPage) {
                                await loadInventoryProductVariations(pid);
                            } else if (isProductsListingPage && catalogMode) {
                                await loadInventoryProductVariations(pid);
                            }
                        }
                    } else {
                        console.error('Failed to update variation status:', result);
                        showCustomPopup('Failed to update variation status: ' + (result.message || 'Unknown error'), true);
                    }
                } catch (error) {
                    console.error('Error updating variation status:', error);
                    showCustomPopup('Failed to update variation status', true);
                }
            };
        
        function closeRepairVariationModal() {
            const modal = document.getElementById('repairVariationModal');
            if (modal) modal.style.display = 'none';
        }

        function resolveVariationAvailableQty(variationData, fallback) {
            const quantityFromDB = Number(variationData?.Quantity) || Number(fallback?.quantity) || 0;
            let available = variationData?.AvailableQuantity;
            if ((available === null || available === undefined || available === 0) && quantityFromDB > 0) {
                available = quantityFromDB;
            } else {
                available = Number(available) || Number(fallback?.availableQty) || 0;
            }
            return available;
        }

        async function openRepairVariationModal(variationId, datasetFallback) {
            const modal = document.getElementById('repairVariationModal');
            if (!modal) return;

            let variationData = null;
            try {
                const response = await fetch('/api/admin/inventory-variation-quantity/' + variationId);
                const result = await response.json();
                if (result.success && result.variation) {
                    variationData = result.variation;
                }
            } catch (err) {
                console.warn('[Repair] Could not load variation:', err);
            }

            const fb = datasetFallback || {};
            const available = resolveVariationAvailableQty(variationData, fb);
            const returned = Number(variationData?.ReturnedQuantity ?? fb.returnedQty) || 0;
            const damaged = Number(variationData?.DamagedQuantity ?? fb.damagedQty) || 0;
            const repaired = Number(variationData?.RepairedQuantity ?? fb.repairedQty) || 0;
            const disposed = Number(variationData?.DisposedQuantity ?? fb.disposedQty) || 0;
            const inventoryProductId = variationData?.InventoryProductID || fb.inventoryProductId || '';
            const variationName = variationData?.VariationName || fb.variationName || 'Variation';

            if (damaged <= 0) {
                showCustomPopup('No damaged quantity available to repair.', true);
                return;
            }

            document.getElementById('repairVariationId').value = variationId;
            document.getElementById('repairVariationInventoryProductId').value = inventoryProductId;
            document.getElementById('repairVariationAvailableQty').value = available;
            document.getElementById('repairVariationReturnedQty').value = returned;
            document.getElementById('repairVariationRepairedQty').value = repaired;
            document.getElementById('repairVariationDisposedQty').value = disposed;
            document.getElementById('repairVariationMaxDamaged').value = damaged;

            const qtyInput = document.getElementById('repairVariationQtyInput');
            if (qtyInput) {
                qtyInput.min = '1';
                qtyInput.max = String(damaged);
                qtyInput.value = '1';
            }

            const subtitle = document.getElementById('repairVariationSubtitle');
            if (subtitle) {
                subtitle.textContent = 'Variation: ' + variationName;
            }
            const hint = document.getElementById('repairVariationHint');
            if (hint) {
                hint.textContent = 'Currently damaged: ' + damaged + '. Items move to Repaired (not available until you click Available on the Repaired column).';
            }

            modal.style.display = 'block';
        }

        async function submitVariationRepair() {
            const variationId = parseInt(document.getElementById('repairVariationId')?.value, 10);
            const maxDamaged = parseInt(document.getElementById('repairVariationMaxDamaged')?.value, 10) || 0;
            const repairQty = parseInt(document.getElementById('repairVariationQtyInput')?.value, 10) || 0;
            const available = parseInt(document.getElementById('repairVariationAvailableQty')?.value, 10) || 0;
            const returned = parseInt(document.getElementById('repairVariationReturnedQty')?.value, 10) || 0;
            const repaired = parseInt(document.getElementById('repairVariationRepairedQty')?.value, 10) || 0;
            const disposed = parseInt(document.getElementById('repairVariationDisposedQty')?.value, 10) || 0;
            const inventoryProductId = document.getElementById('repairVariationInventoryProductId')?.value || '';

            if (!variationId) {
                showCustomPopup('Variation not found.', true);
                return;
            }
            if (repairQty < 1) {
                showCustomPopup('Enter at least 1 item to repair.', true);
                return;
            }
            if (repairQty > maxDamaged) {
                showCustomPopup('Cannot repair more than the damaged quantity (' + maxDamaged + ').', true);
                return;
            }

            const transferQty = Math.min(repairQty, maxDamaged);
            const newDamaged = maxDamaged - transferQty;
            const newRepaired = repaired + transferQty;

            const confirmBtn = document.getElementById('confirmRepairVariation');
            if (confirmBtn) {
                confirmBtn.disabled = true;
                confirmBtn.textContent = 'Saving…';
            }

            const formData = new FormData();
            formData.append('variationID', variationId);
            formData.append('availableQuantity', available);
            formData.append('returnedQuantity', returned);
            formData.append('damagedQuantity', newDamaged);
            formData.append('repairedQuantity', newRepaired);
            formData.append('disposedQuantity', disposed);
            formData.append('notes', 'Repair from damaged (' + transferQty + ')');
            formData.append('recipeMaterials', '[]');

            try {
                const response = await fetch('/api/admin/inventory-product-variations/update-status', {
                    method: 'POST',
                    body: formData
                });
                if (!response.ok) {
                    showCustomPopup('Failed to repair items: server returned ' + response.status, true);
                    return;
                }
                const result = await response.json();
                if (result.success) {
                    showCustomPopup('Repaired ' + transferQty + ' item(s). Damaged → Repaired.');
                    closeRepairVariationModal();
                    const pid = inventoryProductId || currentSelectedProductId;
                    if (pid) {
                        await notifyInventoryStockChanged(pid, result);
                        await loadInventoryProductVariations(pid);
                    }
                } else {
                    showCustomPopup('Failed to repair: ' + (result.message || 'Unknown error'), true);
                }
            } catch (err) {
                console.error('[Repair] Error:', err);
                showCustomPopup('Failed to repair items.', true);
            } finally {
                if (confirmBtn) {
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = 'Confirm repair';
                }
            }
        }

        async function openMakeAvailableVariationModal(variationId, datasetFallback) {
            const modal = document.getElementById('makeAvailableVariationModal');
            if (!modal) return;

            let variationData = null;
            try {
                const response = await fetch('/api/admin/inventory-variation-quantity/' + variationId);
                const result = await response.json();
                if (result.success && result.variation) {
                    variationData = result.variation;
                }
            } catch (err) {
                console.warn('[MakeAvailable] Could not load variation:', err);
            }

            const fb = datasetFallback || {};
            const available = resolveVariationAvailableQty(variationData, fb);
            const returned = Number(variationData?.ReturnedQuantity ?? fb.returnedQty) || 0;
            const damaged = Number(variationData?.DamagedQuantity ?? fb.damagedQty) || 0;
            const repaired = Number(variationData?.RepairedQuantity ?? fb.repairedQty) || 0;
            const disposed = Number(variationData?.DisposedQuantity ?? fb.disposedQty) || 0;
            const inventoryProductId = variationData?.InventoryProductID || fb.inventoryProductId || '';
            const variationName = variationData?.VariationName || fb.variationName || 'Variation';

            if (repaired <= 0) {
                showCustomPopup('No repaired quantity available to move to stock.', true);
                return;
            }

            document.getElementById('makeAvailableVariationId').value = variationId;
            document.getElementById('makeAvailableVariationInventoryProductId').value = inventoryProductId;
            document.getElementById('makeAvailableVariationAvailableQty').value = available;
            document.getElementById('makeAvailableVariationReturnedQty').value = returned;
            document.getElementById('makeAvailableVariationDamagedQty').value = damaged;
            document.getElementById('makeAvailableVariationRepairedQty').value = repaired;
            document.getElementById('makeAvailableVariationDisposedQty').value = disposed;
            document.getElementById('makeAvailableVariationMaxRepaired').value = repaired;

            const qtyInput = document.getElementById('makeAvailableVariationQtyInput');
            if (qtyInput) {
                qtyInput.min = '1';
                qtyInput.max = String(repaired);
                qtyInput.value = '1';
            }

            const subtitle = document.getElementById('makeAvailableVariationSubtitle');
            if (subtitle) {
                subtitle.textContent = 'Variation: ' + variationName;
            }
            const hint = document.getElementById('makeAvailableVariationHint');
            if (hint) {
                hint.textContent = 'Currently repaired: ' + repaired + '. This adds sellable available stock.';
            }

            modal.style.display = 'block';
        }

        function closeMakeAvailableVariationModal() {
            const modal = document.getElementById('makeAvailableVariationModal');
            if (modal) modal.style.display = 'none';
        }

        async function submitVariationMakeAvailable() {
            const variationId = parseInt(document.getElementById('makeAvailableVariationId')?.value, 10);
            const maxRepaired = parseInt(document.getElementById('makeAvailableVariationMaxRepaired')?.value, 10) || 0;
            const moveQty = parseInt(document.getElementById('makeAvailableVariationQtyInput')?.value, 10) || 0;
            const available = parseInt(document.getElementById('makeAvailableVariationAvailableQty')?.value, 10) || 0;
            const returned = parseInt(document.getElementById('makeAvailableVariationReturnedQty')?.value, 10) || 0;
            const damaged = parseInt(document.getElementById('makeAvailableVariationDamagedQty')?.value, 10) || 0;
            const repaired = parseInt(document.getElementById('makeAvailableVariationRepairedQty')?.value, 10) || 0;
            const disposed = parseInt(document.getElementById('makeAvailableVariationDisposedQty')?.value, 10) || 0;
            const inventoryProductId = document.getElementById('makeAvailableVariationInventoryProductId')?.value || '';

            if (!variationId) {
                showCustomPopup('Variation not found.', true);
                return;
            }
            if (moveQty < 1) {
                showCustomPopup('Enter at least 1 item to make available.', true);
                return;
            }
            if (moveQty > maxRepaired) {
                showCustomPopup('Cannot move more than the repaired quantity (' + maxRepaired + ').', true);
                return;
            }

            const transferQty = Math.min(moveQty, maxRepaired);
            const newRepaired = maxRepaired - transferQty;
            const newAvailable = available + transferQty;

            const confirmBtn = document.getElementById('confirmMakeAvailableVariation');
            if (confirmBtn) {
                confirmBtn.disabled = true;
                confirmBtn.textContent = 'Saving…';
            }

            const formData = new FormData();
            formData.append('variationID', variationId);
            formData.append('availableQuantity', newAvailable);
            formData.append('returnedQuantity', returned);
            formData.append('damagedQuantity', damaged);
            formData.append('repairedQuantity', newRepaired);
            formData.append('disposedQuantity', disposed);
            formData.append('notes', 'Repaired → available (' + transferQty + ')');
            formData.append('recipeMaterials', '[]');

            try {
                const response = await fetch('/api/admin/inventory-product-variations/update-status', {
                    method: 'POST',
                    body: formData
                });
                if (!response.ok) {
                    showCustomPopup('Failed to update stock: server returned ' + response.status, true);
                    return;
                }
                const result = await response.json();
                if (result.success) {
                    showCustomPopup('Moved ' + transferQty + ' item(s) to available stock.');
                    closeMakeAvailableVariationModal();
                    const pid = inventoryProductId || currentSelectedProductId;
                    if (pid) {
                        await notifyInventoryStockChanged(pid, result);
                        await loadInventoryProductVariations(pid);
                    }
                } else {
                    showCustomPopup('Failed: ' + (result.message || 'Unknown error'), true);
                }
            } catch (err) {
                console.error('[MakeAvailable] Error:', err);
                showCustomPopup('Failed to update stock.', true);
            } finally {
                if (confirmBtn) {
                    confirmBtn.disabled = false;
                    confirmBtn.textContent = 'Make available';
                }
            }
        }

        function initRepairVariationModal() {
            if (!isProductReturnsPage) return;
            ['closeRepairVariationModal', 'cancelRepairVariation'].forEach(function (id) {
                const el = document.getElementById(id);
                if (el && !el.hasAttribute('data-repair-listener')) {
                    el.addEventListener('click', closeRepairVariationModal);
                    el.setAttribute('data-repair-listener', '1');
                }
            });
            const confirmBtn = document.getElementById('confirmRepairVariation');
            if (confirmBtn && !confirmBtn.hasAttribute('data-repair-listener')) {
                confirmBtn.addEventListener('click', submitVariationRepair);
                confirmBtn.setAttribute('data-repair-listener', '1');
            }
            const repairModal = document.getElementById('repairVariationModal');
            if (repairModal && !repairModal.hasAttribute('data-repair-listener')) {
                repairModal.addEventListener('click', function (e) {
                    if (e.target === repairModal) closeRepairVariationModal();
                });
                repairModal.setAttribute('data-repair-listener', '1');
            }

            ['closeMakeAvailableVariationModal', 'cancelMakeAvailableVariation'].forEach(function (id) {
                const el = document.getElementById(id);
                if (el && !el.hasAttribute('data-available-listener')) {
                    el.addEventListener('click', closeMakeAvailableVariationModal);
                    el.setAttribute('data-available-listener', '1');
                }
            });
            const makeAvailableConfirm = document.getElementById('confirmMakeAvailableVariation');
            if (makeAvailableConfirm && !makeAvailableConfirm.hasAttribute('data-available-listener')) {
                makeAvailableConfirm.addEventListener('click', submitVariationMakeAvailable);
                makeAvailableConfirm.setAttribute('data-available-listener', '1');
            }
            const makeAvailableModal = document.getElementById('makeAvailableVariationModal');
            if (makeAvailableModal && !makeAvailableModal.hasAttribute('data-available-listener')) {
                makeAvailableModal.addEventListener('click', function (e) {
                    if (e.target === makeAvailableModal) closeMakeAvailableVariationModal();
                });
                makeAvailableModal.setAttribute('data-available-listener', '1');
            }
        }

        initRepairVariationModal();

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

            const editVariationRestockBtn = document.getElementById('editVariationRestockBtn');
            if (editVariationRestockBtn && !editVariationRestockBtn.hasAttribute('data-listener-attached')) {
                editVariationRestockBtn.addEventListener('click', async function() {
                    const vid = parseInt(document.getElementById('editVariationStatusVariationID')?.value, 10);
                    const ipid = parseInt(document.getElementById('editVariationStatusInventoryProductID')?.value, 10);
                    const qty = parseInt(document.getElementById('editVariationRestockQty')?.value, 10);
                    if (vid && ipid && typeof window.restockVariationInline === 'function') {
                        await window.restockVariationInline(vid, ipid, editVariationRestockBtn, qty);
                    }
                });
                editVariationRestockBtn.setAttribute('data-listener-attached', 'true');
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
        
        // Attach variation status listeners only on Products listing page
        if (document.getElementById('editVariationStatusModal')) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function() {
                    configureVariationEditModalForPage();
                    setTimeout(attachEditVariationStatusListeners, 100);
                });
            } else {
                configureVariationEditModalForPage();
                setTimeout(attachEditVariationStatusListeners, 100);
            }
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

        if (document.getElementById('editVariationStatusModal')) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => setTimeout(attachEditVariationStatusCloseListeners, 100));
            } else {
                setTimeout(attachEditVariationStatusCloseListeners, 100);
            }
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
        if (isFlatListPage) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initFlatProductTables);
            } else {
                initFlatProductTables();
            }
        }

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
