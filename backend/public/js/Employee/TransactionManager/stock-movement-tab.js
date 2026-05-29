/* Product Inventory — Stock Movement (grouped by product → variation) */
(function () {
    'use strict';

    var API = '/api/admin/inventory-stock-movements';
    var INVENTORY_BASE = '/Employee/TransactionManager/ProductInventory';
    var currentPage = 1;
    var pageSize = 10;
    var productFilter = '';
    var expandedProducts = new Set();
    var expandedVariations = new Set();
    var expandedRawMaterials = new Set();

    var CHEVRON_SVG = '<svg class="stock-movement-chevron" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>';

    function escapeHtml(text) {
        if (text == null) return '';
        var div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    function formatMovementDate(value) {
        if (!value) return '—';
        try {
            var d = new Date(value);
            if (isNaN(d.getTime())) return String(value);
            return d.toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return String(value);
        }
    }

    function formatStatusLabel(status) {
        if (!status) return '—';
        var s = String(status);
        if (s === 'available') return 'Available';
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function movementTypeBadgeClass(type) {
        var t = String(type || '');
        if (t === 'return_received') return 'stock-mv-badge-returned';
        if (t === 'returned_to_damaged') return 'stock-mv-badge-damaged';
        if (t === 'damaged_to_repaired') return 'stock-mv-badge-repaired';
        if (t === 'repaired_to_available') return 'stock-mv-badge-available';
        if (t === 'restock_available' || t === 'restock_variation' || t === 'restock_product' || t === 'restock_raw_material') return 'stock-mv-badge-restock';
        return 'stock-mv-badge-default';
    }

    function variationKey(productId, variationId) {
        return String(productId) + '-' + String(variationId != null ? variationId : 0);
    }

    function getElements() {
        return {
            tab: document.getElementById('stockMovementTab'),
            loading: document.getElementById('stockMovementLoading'),
            listWrap: document.getElementById('stockMovementListWrap'),
            list: document.getElementById('stockMovementGroupedList'),
            rawList: document.getElementById('stockMovementRawMaterialsList'),
            rawSectionHead: document.getElementById('stockMovementRawSectionHead'),
            empty: document.getElementById('stockMovementEmpty'),
            summary: document.getElementById('stockMovementSummary'),
            pagination: document.getElementById('stockMovementPagination'),
            productInput: document.getElementById('stockMovementProductFilter'),
            pageSizeSelect: document.getElementById('stockMovementPageSize'),
            applyBtn: document.getElementById('stockMovementApplyFilter'),
            clearBtn: document.getElementById('stockMovementClearFilter')
        };
    }

    function readStateFromUrl() {
        var params = new URLSearchParams(window.location.search);
        currentPage = Math.max(parseInt(params.get('page'), 10) || 1, 1);
        productFilter = String(params.get('inventoryProductId') || '').trim();
        var limit = parseInt(params.get('limit'), 10);
        if (limit >= 5 && limit <= 100) pageSize = limit;
        var el = getElements();
        if (el.productInput && productFilter) el.productInput.value = productFilter;
        if (el.pageSizeSelect) el.pageSizeSelect.value = String(pageSize);
    }

    function updateUrl() {
        var params = new URLSearchParams();
        params.set('tab', 'stock-movement');
        if (currentPage > 1) params.set('page', String(currentPage));
        if (pageSize !== 10) params.set('limit', String(pageSize));
        if (productFilter) params.set('inventoryProductId', productFilter);
        history.replaceState(null, '', INVENTORY_BASE + '?' + params.toString());
    }

    function isStockMovementTabActive() {
        var tab = document.getElementById('stockMovementTab');
        return tab && tab.classList.contains('active');
    }

    function setLoading(show) {
        var el = getElements();
        if (el.loading) el.loading.style.display = show ? 'block' : 'none';
        if (el.listWrap) el.listWrap.style.display = show ? 'none' : (el.list && el.list.children.length ? 'block' : 'none');
        if (show && el.pagination) el.pagination.style.display = 'none';
    }

    function toggleProduct(productId) {
        var key = String(productId);
        if (expandedProducts.has(key)) {
            expandedProducts.delete(key);
        } else {
            expandedProducts.add(key);
        }
        renderGroupedList(window.__stockMovementProducts || []);
    }

    function toggleVariation(productId, variationId) {
        var key = variationKey(productId, variationId);
        if (expandedVariations.has(key)) {
            expandedVariations.delete(key);
        } else {
            expandedVariations.add(key);
        }
        renderGroupedList(window.__stockMovementProducts || []);
    }

    function renderMovementTable(movements) {
        if (!movements || !movements.length) {
            return '<p class="stock-mv-no-movements">No movements for this group.</p>';
        }
        var html = '<table class="stock-mv-nested-table"><thead><tr>' +
            '<th>Date</th><th>Movement</th><th>From</th><th>To</th><th class="qty-col">Qty</th><th>Notes</th>' +
            '</tr></thead><tbody>';
        movements.forEach(function (mv) {
            var badgeClass = movementTypeBadgeClass(mv.movementType);
            html += '<tr>' +
                '<td class="last-added-cell">' + escapeHtml(formatMovementDate(mv.createdAt)) + '</td>' +
                '<td><span class="stock-mv-badge ' + badgeClass + '">' + escapeHtml(mv.movementLabel || mv.movementType) + '</span></td>' +
                '<td>' + escapeHtml(formatStatusLabel(mv.fromStatus)) + '</td>' +
                '<td>' + escapeHtml(formatStatusLabel(mv.toStatus)) + '</td>' +
                '<td class="qty-col"><span class="stock-qty">' + (mv.quantity || 0) + '</span></td>' +
                '<td class="stock-mv-notes-cell">' + escapeHtml(mv.notes || '—') + '</td>' +
                '</tr>';
        });
        html += '</tbody></table>';
        return html;
    }

    function toggleRawMaterial(rawMaterialId) {
        var key = String(rawMaterialId);
        if (expandedRawMaterials.has(key)) {
            expandedRawMaterials.delete(key);
        } else {
            expandedRawMaterials.add(key);
        }
        renderRawMaterialsList(window.__stockMovementRawMaterials || []);
    }

    function renderRawMaterialsList(materials) {
        var el = getElements();
        if (!el.rawList) return;
        window.__stockMovementRawMaterials = materials || [];
        el.rawList.innerHTML = '';

        if (!materials || !materials.length) {
            if (el.rawSectionHead) el.rawSectionHead.style.display = 'none';
            return;
        }

        if (el.rawSectionHead) el.rawSectionHead.style.display = 'block';

        materials.forEach(function (material) {
            var mid = material.rawMaterialId;
            var mKey = String(mid);
            var mOpen = expandedRawMaterials.has(mKey);
            var mBlock = document.createElement('div');
            mBlock.className = 'stock-mv-product-block' + (mOpen ? ' is-expanded' : '');

            var mHeaderRow = document.createElement('div');
            mHeaderRow.className = 'stock-mv-header-row';

            var mHeader = document.createElement('button');
            mHeader.type = 'button';
            mHeader.className = 'stock-mv-product-header';
            mHeader.setAttribute('aria-expanded', mOpen ? 'true' : 'false');
            var unitPart = material.materialUnit ? ' <span class="stock-mv-muted">(' + escapeHtml(material.materialUnit) + ')</span>' : '';
            mHeader.innerHTML =
                '<span class="stock-mv-expand-icon">' + CHEVRON_SVG + '</span>' +
                '<span class="stock-mv-product-title"><strong>' + escapeHtml(material.materialName) + '</strong>' +
                ' <span class="stock-mv-muted">#' + mid + '</span>' + unitPart + '</span>' +
                '<span class="stock-mv-meta">' + material.movementCount + ' movement' + (material.movementCount === 1 ? '' : 's') +
                (material.lastMovementAt ? ' · Last ' + escapeHtml(formatMovementDate(material.lastMovementAt)) : '') +
                '</span>';
            mHeader.addEventListener('click', function () {
                toggleRawMaterial(mid);
            });
            mHeaderRow.appendChild(mHeader);
            mBlock.appendChild(mHeaderRow);

            var mBody = document.createElement('div');
            mBody.className = 'stock-mv-product-body';
            mBody.style.display = mOpen ? 'block' : 'none';
            mBody.innerHTML = renderMovementTable(material.movements);
            mBlock.appendChild(mBody);

            el.rawList.appendChild(mBlock);
        });
    }

    function renderGroupedList(products) {
        var el = getElements();
        if (!el.list) return;
        window.__stockMovementProducts = products || [];

        el.list.innerHTML = '';
        var hasProducts = products && products.length;
        var hasRaw = window.__stockMovementRawMaterials && window.__stockMovementRawMaterials.length;

        if (!hasProducts && !hasRaw) {
            if (el.listWrap) el.listWrap.style.display = 'none';
            if (el.empty) el.empty.style.display = 'block';
            return;
        }

        if (el.empty) el.empty.style.display = 'none';
        if (el.listWrap) el.listWrap.style.display = 'block';

        if (!hasProducts) {
            el.list.innerHTML = '<p class="stock-mv-no-movements">No product inventory movements yet.</p>';
        }

        (products || []).forEach(function (product) {
            var pid = product.inventoryProductId;
            var pKey = String(pid);
            var pOpen = expandedProducts.has(pKey);
            var pBlock = document.createElement('div');
            pBlock.className = 'stock-mv-product-block' + (pOpen ? ' is-expanded' : '');

            var pHeaderRow = document.createElement('div');
            pHeaderRow.className = 'stock-mv-header-row';

            var pHeader = document.createElement('button');
            pHeader.type = 'button';
            pHeader.className = 'stock-mv-product-header';
            pHeader.setAttribute('aria-expanded', pOpen ? 'true' : 'false');
            pHeader.innerHTML =
                '<span class="stock-mv-expand-icon">' + CHEVRON_SVG + '</span>' +
                '<span class="stock-mv-product-title"><strong>' + escapeHtml(product.productName) + '</strong>' +
                ' <span class="stock-mv-muted">#' + pid + '</span></span>' +
                '<span class="stock-mv-meta">' + product.movementCount + ' movement' + (product.movementCount === 1 ? '' : 's') +
                (product.lastMovementAt ? ' · Last ' + escapeHtml(formatMovementDate(product.lastMovementAt)) : '') +
                '</span>';
            pHeader.addEventListener('click', function () {
                toggleProduct(pid);
            });
            pHeaderRow.appendChild(pHeader);
            pBlock.appendChild(pHeaderRow);

            var pBody = document.createElement('div');
            pBody.className = 'stock-mv-product-body';
            pBody.style.display = pOpen ? 'block' : 'none';

            var variations = product.variations || [];
            if (!variations.length) {
                pBody.innerHTML = '<p class="stock-mv-no-movements">No variation breakdown.</p>';
            } else {
                variations.forEach(function (variation) {
                    var vid = variation.variationId;
                    var vKey = variationKey(pid, vid);
                    var vOpen = expandedVariations.has(vKey);

                    var vBlock = document.createElement('div');
                    vBlock.className = 'stock-mv-variation-block' + (vOpen ? ' is-expanded' : '');

                    var vHeader = document.createElement('button');
                    vHeader.type = 'button';
                    vHeader.className = 'stock-mv-variation-header';
                    vHeader.setAttribute('aria-expanded', vOpen ? 'true' : 'false');
                    var skuPart = variation.variationSku
                        ? ' <code class="stock-mv-sku">' + escapeHtml(variation.variationSku) + '</code>'
                        : (vid ? ' <span class="stock-mv-muted">#' + vid + '</span>' : '');
                    vHeader.innerHTML =
                        '<span class="stock-mv-expand-icon stock-mv-expand-icon-nested">' + CHEVRON_SVG + '</span>' +
                        '<span class="stock-mv-variation-title">' + escapeHtml(variation.variationName) + skuPart + '</span>' +
                        '<span class="stock-mv-meta">' + variation.movementCount + ' movement' + (variation.movementCount === 1 ? '' : 's') + '</span>';
                    vHeader.addEventListener('click', function (e) {
                        e.stopPropagation();
                        toggleVariation(pid, vid);
                    });
                    vBlock.appendChild(vHeader);

                    var vBody = document.createElement('div');
                    vBody.className = 'stock-mv-variation-body';
                    vBody.style.display = vOpen ? 'block' : 'none';
                    vBody.innerHTML = renderMovementTable(variation.movements);
                    vBlock.appendChild(vBody);

                    pBody.appendChild(vBlock);
                });
            }

            pBlock.appendChild(pBody);
            el.list.appendChild(pBlock);
        });
    }

    function renderPagination(pagination) {
        var nav = document.getElementById('stockMovementPagination');
        if (!nav || !pagination) return;

        var page = pagination.page || 1;
        var totalPages = pagination.totalPages || 1;
        var totalProducts = pagination.totalCount != null ? pagination.totalCount : 0;

        if (totalProducts <= 0) {
            nav.style.display = 'none';
            nav.innerHTML = '';
            return;
        }

        nav.style.display = 'flex';
        var html = '';

        if (page > 1) {
            html += '<button type="button" class="stock-movement-page-btn" data-page="1" title="First page">«</button>';
            html += '<button type="button" class="stock-movement-page-btn" data-page="' + (page - 1) + '">Previous</button>';
        } else {
            html += '<span class="disabled">«</span><span class="disabled">Previous</span>';
        }

        var start = Math.max(1, page - 2);
        var end = Math.min(totalPages, page + 2);
        for (var p = start; p <= end; p++) {
            html += p === page
                ? '<span class="current">' + p + '</span>'
                : '<button type="button" class="stock-movement-page-btn" data-page="' + p + '">' + p + '</button>';
        }

        if (page < totalPages) {
            html += '<button type="button" class="stock-movement-page-btn" data-page="' + (page + 1) + '">Next</button>';
            html += '<button type="button" class="stock-movement-page-btn" data-page="' + totalPages + '" title="Last page">»</button>';
        } else {
            html += '<span class="disabled">Next</span><span class="disabled">»</span>';
        }

        var from = totalProducts === 0 ? 0 : ((page - 1) * (pagination.limit || pageSize) + 1);
        var to = Math.min(page * (pagination.limit || pageSize), totalProducts);
        html += '<span class="inventory-pagination-info">Products ' + from + '–' + to + ' of ' + totalProducts +
            ' (page ' + page + ' of ' + totalPages + ')</span>';

        nav.innerHTML = html;
        nav.querySelectorAll('.stock-movement-page-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                currentPage = parseInt(btn.getAttribute('data-page'), 10) || 1;
                updateUrl();
                loadStockMovements();
                nav.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
        });
    }

    async function loadStockMovements() {
        var el = getElements();
        if (!el.tab) return;

        setLoading(true);
        if (el.empty) el.empty.style.display = 'none';

        var params = new URLSearchParams();
        params.set('grouped', '1');
        params.set('page', String(currentPage));
        params.set('limit', String(pageSize));
        if (productFilter) params.set('inventoryProductId', productFilter);

        try {
            var response = await fetch(API + '?' + params.toString());
            var result = await response.json();
            setLoading(false);

            if (!result.success) {
                if (el.summary) el.summary.textContent = result.message || 'Failed to load movements.';
                if (el.empty) {
                    el.empty.style.display = 'block';
                    el.empty.textContent = result.message || 'Failed to load stock movements.';
                }
                return;
            }

            var products = result.products || [];
            var rawMaterials = result.rawMaterials || [];
            var pagination = result.pagination || {};
            if (pagination.page) currentPage = pagination.page;

            if (productFilter && products.length === 1) {
                expandedProducts.add(String(products[0].inventoryProductId));
            }

            if (el.summary) {
                var totalMv = pagination.totalMovementCount != null ? pagination.totalMovementCount : 0;
                var totalProd = pagination.totalCount != null ? pagination.totalCount : products.length;
                var rawCount = rawMaterials.length;
                var summary = totalMv + ' product movement' + (totalMv === 1 ? '' : 's') +
                    ' across ' + totalProd + ' product' + (totalProd === 1 ? '' : 's');
                if (rawCount) {
                    summary += '; ' + rawCount + ' raw material' + (rawCount === 1 ? '' : 's') + ' with history';
                }
                if (productFilter) summary += ' (filtered #' + productFilter + ')';
                el.summary.textContent = summary;
            }

            renderRawMaterialsList(rawMaterials);
            renderGroupedList(products);
            renderPagination(pagination);
        } catch (err) {
            console.error('stock-movement-tab:', err);
            setLoading(false);
            if (el.summary) el.summary.textContent = 'Could not load stock movements.';
            if (el.empty) {
                el.empty.style.display = 'block';
                el.empty.textContent = 'Could not load stock movements.';
            }
        }
    }

    function bindFilters() {
        var el = getElements();
        if (el.applyBtn && !el.applyBtn.hasAttribute('data-bound')) {
            el.applyBtn.addEventListener('click', function () {
                productFilter = el.productInput ? String(el.productInput.value || '').trim() : '';
                pageSize = parseInt(el.pageSizeSelect && el.pageSizeSelect.value, 10) || 10;
                currentPage = 1;
                expandedProducts = new Set();
                expandedVariations = new Set();
                updateUrl();
                loadStockMovements();
            });
            el.applyBtn.setAttribute('data-bound', '1');
        }
        if (el.clearBtn && !el.clearBtn.hasAttribute('data-bound')) {
            el.clearBtn.addEventListener('click', function () {
                productFilter = '';
                currentPage = 1;
                pageSize = 10;
                expandedProducts = new Set();
                expandedVariations = new Set();
                if (el.productInput) el.productInput.value = '';
                if (el.pageSizeSelect) el.pageSizeSelect.value = '10';
                updateUrl();
                loadStockMovements();
            });
            el.clearBtn.setAttribute('data-bound', '1');
        }
        if (el.pageSizeSelect && !el.pageSizeSelect.hasAttribute('data-bound')) {
            el.pageSizeSelect.addEventListener('change', function () {
                pageSize = parseInt(el.pageSizeSelect.value, 10) || 10;
                currentPage = 1;
                updateUrl();
                loadStockMovements();
            });
            el.pageSizeSelect.setAttribute('data-bound', '1');
        }
    }

    function maybeLoadOnTabShow() {
        if (!isStockMovementTabActive()) return;
        readStateFromUrl();
        loadStockMovements();
    }

    function init() {
        readStateFromUrl();
        bindFilters();

        document.addEventListener('rawMaterialRestocked', function () {
            if (isStockMovementTabActive()) loadStockMovements();
        });

        document.querySelectorAll('.tab-navigation .tab-button[data-tab="stock-movement"]').forEach(function (btn) {
            if (btn.hasAttribute('data-stock-movement-bound')) return;
            btn.addEventListener('click', function () {
                setTimeout(maybeLoadOnTabShow, 50);
            });
            btn.setAttribute('data-stock-movement-bound', '1');
        });

        if (new URLSearchParams(window.location.search).get('tab') === 'stock-movement') {
            loadStockMovements();
        }
    }

    window.loadStockMovementHistory = loadStockMovements;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.addEventListener('pageshow', function () {
        if (new URLSearchParams(window.location.search).get('tab') === 'stock-movement') {
            readStateFromUrl();
            loadStockMovements();
        }
    });
})();
