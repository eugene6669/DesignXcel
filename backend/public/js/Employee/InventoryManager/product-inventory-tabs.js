/* Product Inventory — tab switching */
(function () {
    'use strict';

    var INVENTORY_BASE = '/Employee/InventoryManager/ProductInventory';
    var DEFAULT_TAB = 'ProductInventory';
    var TAB_PANELS = ['productsTab', 'rawMaterialsTab', 'bomBundlesTab', 'stockMovementTab'];
    var TAB_NAMES = ['ProductInventory', 'raw-materials', 'rawmaterials-bundles', 'stock-movement'];

    function normalizeTabName(urlTab) {
        if (!urlTab || urlTab === 'products') return DEFAULT_TAB;
        if (urlTab === 'ProductInventory') return DEFAULT_TAB;
        if (urlTab === 'bom-bundles') return 'rawmaterials-bundles';
        return urlTab;
    }

    function tabUrl(name) {
        var tab = normalizeTabName(name);
        return INVENTORY_BASE + '?tab=' + encodeURIComponent(tab);
    }

    function getTabFromUrl() {
        return normalizeTabName(new URLSearchParams(window.location.search).get('tab'));
    }

    function showTab(name) {
        var tab = normalizeTabName(name);
        if (TAB_NAMES.indexOf(tab) === -1) {
            tab = DEFAULT_TAB;
        }

        TAB_PANELS.forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.classList.remove('active');
        });

        document.querySelectorAll('.tab-navigation .tab-button').forEach(function (btn) {
            btn.classList.remove('active');
        });

        var panelId = tab === 'raw-materials' ? 'rawMaterialsTab'
            : tab === 'rawmaterials-bundles' ? 'bomBundlesTab'
            : tab === 'stock-movement' ? 'stockMovementTab'
            : 'productsTab';
        var panel = document.getElementById(panelId);
        if (panel) panel.classList.add('active');

        var btn = document.querySelector('.tab-navigation .tab-button[data-tab="' + tab + '"]');
        if (btn) btn.classList.add('active');

        var bomModal = document.getElementById('bomBundleModal');
        if (bomModal) {
            bomModal.style.display = 'none';
        }
    }

    function initProductInventoryTabs() {
        var tabButtons = document.querySelectorAll('.tab-navigation .tab-button');
        if (!tabButtons.length) return;

        tabButtons.forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                var tab = btn.getAttribute('data-tab');
                if (!tab) return;
                var target = tabUrl(tab);
                var current = new URL(window.location.href);
                var next = new URL(target, window.location.origin);
                if (current.pathname === next.pathname && current.searchParams.get('tab') === next.searchParams.get('tab')) {
                    showTab(tab);
                    return;
                }
                window.location.assign(target);
            });
        });

        showTab(getTabFromUrl());
    }

    window.showProductInventoryTab = showTab;

    document.addEventListener('click', function (e) {
        if (e.target && (e.target.id === 'addEditVariationMaterialBtn' || e.target.closest('#addEditVariationMaterialBtn'))) {
            e.preventDefault();
            e.stopPropagation();
            var container = document.getElementById('editVariationMaterialsContainer');
            if (container && typeof createEditVariationMaterialRow === 'function') {
                container.appendChild(createEditVariationMaterialRow());
                if (typeof updateEditVariationMaterialsSummary === 'function') {
                    updateEditVariationMaterialsSummary();
                }
            }
        }
    });

    function boot() {
        initProductInventoryTabs();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    window.addEventListener('pageshow', function () {
        showTab(getTabFromUrl());
    });
})();
