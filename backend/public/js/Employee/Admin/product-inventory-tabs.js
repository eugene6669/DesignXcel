/* Product Inventory — tab switching */
(function () {
    'use strict';

    var TAB_PANELS = ['productsTab', 'rawMaterialsTab', 'bomBundlesTab'];
    var TAB_NAMES = ['products', 'raw-materials', 'bom-bundles'];

    function tabUrl(name) {
        var base = '/Employee/Admin/ProductInventory';
        if (name === 'products') {
            return base + '?tab=products';
        }
        return base + '?tab=' + encodeURIComponent(name);
    }

    function getTabFromUrl() {
        var urlTab = new URLSearchParams(window.location.search).get('tab');
        if (urlTab === 'raw-materials' || urlTab === 'bom-bundles') {
            return urlTab;
        }
        return 'products';
    }

    function showTab(name) {
        if (TAB_NAMES.indexOf(name) === -1) {
            name = 'products';
        }

        TAB_PANELS.forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.classList.remove('active');
        });

        document.querySelectorAll('.tab-navigation .tab-button').forEach(function (btn) {
            btn.classList.remove('active');
        });

        var panelId = name === 'raw-materials' ? 'rawMaterialsTab'
            : name === 'bom-bundles' ? 'bomBundlesTab' : 'productsTab';
        var panel = document.getElementById(panelId);
        if (panel) panel.classList.add('active');

        var btn = document.querySelector('.tab-navigation .tab-button[data-tab="' + name + '"]');
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
                if (window.location.pathname + window.location.search === target ||
                    window.location.href.endsWith(target.replace(/^\//, ''))) {
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
