/* Product Inventory — tab switching and delegated material row handler */
(function () {
    'use strict';

    function initProductInventoryTabs() {
        const tabButtons = document.querySelectorAll('.tab-navigation .tab-button');
        const productsTab = document.getElementById('productsTab');
        const rawTab = document.getElementById('rawMaterialsTab');

        function showTab(name) {
            tabButtons.forEach(function (btn) {
                btn.classList.toggle('active', btn.getAttribute('data-tab') === name);
            });
            if (productsTab) productsTab.classList.toggle('active', name === 'products');
            if (rawTab) rawTab.classList.toggle('active', name === 'raw-materials');
        }

        tabButtons.forEach(function (btn) {
            btn.addEventListener('click', function () {
                const tab = btn.getAttribute('data-tab');
                showTab(tab);
                const url = new URL(window.location.href);
                url.searchParams.set('tab', tab);
                window.history.replaceState({}, '', url);
            });
        });

        const params = new URLSearchParams(window.location.search);
        showTab(params.get('tab') === 'raw-materials' ? 'raw-materials' : 'products');
    }

    document.addEventListener('click', function (e) {
        if (e.target && (e.target.id === 'addEditVariationMaterialBtn' || e.target.closest('#addEditVariationMaterialBtn'))) {
            e.preventDefault();
            e.stopPropagation();
            const container = document.getElementById('editVariationMaterialsContainer');
            if (container && typeof createEditVariationMaterialRow === 'function') {
                container.appendChild(createEditVariationMaterialRow());
                updateEditVariationMaterialsSummary();
            }
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initProductInventoryTabs);
    } else {
        initProductInventoryTabs();
    }
})();
