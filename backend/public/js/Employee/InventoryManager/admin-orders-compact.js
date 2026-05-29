(function () {
    function forceTableView() {
        var grid = document.getElementById('ordersGrid');
        var table = document.getElementById('ordersTable');
        if (grid) grid.style.display = 'none';
        if (table) table.style.display = 'block';
        var viewRow = document.querySelector('.orders-view-toggle-row');
        if (viewRow) viewRow.style.display = 'none';
    }

    function ensureInlineSpinnerElement() {
        var table = document.getElementById('ordersTable');
        if (!table || document.getElementById('orders-inline-spinner')) return;
        var toolbar = document.createElement('div');
        toolbar.className = 'orders-table-toolbar';
        toolbar.innerHTML =
            '<div id="orders-inline-spinner" class="orders-inline-spinner hidden" role="status" aria-live="polite">' +
            '<span class="orders-inline-spinner__icon" aria-hidden="true"></span>' +
            '<span class="orders-inline-spinner__text">Loading...</span>' +
            '</div>';
        table.parentNode.insertBefore(toolbar, table);
    }

    function patchSpinnerHelpers() {
        if (window.__ordersSpinnerPatched) return;
        ensureInlineSpinnerElement();

        var origShow = window.showLoadingSpinner;
        var origHide = window.hideLoadingSpinner;

        window.showLoadingSpinner = function (spinnerId, text) {
            var inline = document.getElementById('orders-inline-spinner');
            if (inline && (!spinnerId || spinnerId === 'orders-loading-spinner' || spinnerId === 'admin-loading-spinner')) {
                var textEl = inline.querySelector('.orders-inline-spinner__text');
                if (textEl) textEl.textContent = text || 'Loading...';
                inline.classList.remove('hidden');
                return;
            }
            if (typeof origShow === 'function') origShow(spinnerId, text);
        };

        window.hideLoadingSpinner = function (spinnerId) {
            var inline = document.getElementById('orders-inline-spinner');
            if (inline && (!spinnerId || spinnerId === 'orders-loading-spinner' || spinnerId === 'admin-loading-spinner')) {
                inline.classList.add('hidden');
                return;
            }
            if (typeof origHide === 'function') origHide(spinnerId);
        };

        window.__ordersSpinnerPatched = true;
    }

    function enhanceOrderDetails() {
        var table = document.getElementById('ordersTable');
        if (!table) return;

        var compactTable = table.querySelector('.admin-orders-compact-table');
        if (compactTable && table.querySelector('thead') && /return type/i.test(table.querySelector('thead').textContent || '')) {
            compactTable.classList.add('has-return-type');
        }

        document.querySelectorAll('#ordersTable tbody tr.table-order-row').forEach(function (row) {
            var actionsCell = row.cells && row.cells[row.cells.length - 1];
            if (actionsCell) actionsCell.classList.add('orders-actions-cell');

            var customerTd = row.cells && row.cells[1];
            if (customerTd && !customerTd.querySelector('.customer-cell-name')) {
                var divs = customerTd.querySelectorAll(':scope > div');
                if (divs[0]) divs[0].classList.add('customer-cell-name');
                if (divs[1]) divs[1].classList.add('customer-cell-email');
            }
            var bulkSpan = row.querySelector('td:first-child span[style*="Bulk"]');
            if (bulkSpan) bulkSpan.classList.add('bulk-badge-inline');
        });

        document.querySelectorAll('#ordersTable tr[id^="table-details-"]').forEach(function (tr) {
            tr.classList.add('table-details-row');
            var td = tr.querySelector('td');
            if (!td) return;
            td.classList.add('table-details-cell');

            var inner = td.querySelector(':scope > div');
            if (!inner) return;
            inner.classList.add('order-details-compact-grid');
            inner.style.display = '';
            inner.style.gridTemplateColumns = '';
            inner.style.gap = '';
            inner.style.fontSize = '';

            inner.querySelectorAll(':scope > div').forEach(function (section) {
                if (!section || section.classList.contains('od-products')) return;
                section.classList.add('od-section');
            });

            inner.querySelectorAll('h4').forEach(function (h4) {
                var section = h4.parentElement;
                if (!section || section.querySelector('.od-section-title')) return;
                var titleText = h4.textContent.replace(/\s*\(\d+\)\s*$/, '').trim();
                var title = document.createElement('div');
                title.className = 'od-section-title';
                title.textContent = titleText;
                h4.replaceWith(title);

                if (/shipping/i.test(titleText)) {
                    section.classList.add('od-shipping');
                }

                var bodyCandidates = Array.prototype.slice.call(section.children).filter(function (el) {
                    return el.classList && !el.classList.contains('od-section-title');
                });
                bodyCandidates.forEach(function (el) {
                    if (!el.classList.contains('od-product-list') && !el.classList.contains('od-section-body')) {
                        el.classList.add('od-section-body');
                    }
                });
            });

            inner.querySelectorAll('.od-section-title').forEach(function (t) {
                var title = (t.textContent || '').trim().toLowerCase();
                var section = t.parentElement;
                if (!section) return;
                if (/products/.test(title)) {
                    section.classList.add('od-products', 'od-section');
                } else if (/^customer/.test(title)) {
                    section.classList.add('od-customer', 'od-section');
                } else if (/shipping/.test(title)) {
                    section.classList.add('od-shipping', 'od-section');
                } else if (/payment/.test(title)) {
                    section.classList.add('od-payment', 'od-section');
                } else if (/order summary/.test(title)) {
                    section.classList.add('od-order-summary', 'od-section');
                }
            });

            var productList = inner.querySelector('.od-products div[style*="flex-direction"]') ||
                inner.querySelector('.od-products > div:last-child');
            if (productList && !productList.classList.contains('od-product-list')) {
                productList.classList.add('od-product-list');
            }
            inner.querySelectorAll('.od-product-list > div').forEach(function (row) {
                if (row.classList.contains('od-product-row')) return;
                row.classList.add('od-product-row');
                var thumb = row.querySelector('div[style*="width: 60px"]') ||
                    row.querySelector('div[style*="width:60px"]') ||
                    row.firstElementChild;
                if (thumb) {
                    thumb.classList.add('od-product-thumb');
                    thumb.style.width = '';
                    thumb.style.height = '';
                }
                var info = thumb && thumb.nextElementSibling;
                if (info) {
                    info.classList.add('od-product-info');
                    var nameEl = info.querySelector('div[style*="font-weight: 600"]') || info.firstElementChild;
                    if (nameEl) nameEl.classList.add('od-product-name');
                    var metaEl = nameEl && nameEl.nextElementSibling;
                    if (metaEl) metaEl.classList.add('od-product-meta');
                }
                var price = row.querySelector('div[style*="font-weight: 700"]');
                if (price && price !== thumb && price !== info) price.classList.add('od-product-price');
            });

            inner.querySelectorAll('div[style*="justify-content: space-between"]').forEach(function (row) {
                if (!row.closest('.od-order-summary')) return;
                if (row.closest('.od-summary-total') || row.closest('.od-summary-row')) return;
                if (row.style.borderTop && row.style.borderTop.indexOf('2px') !== -1) {
                    row.classList.add('od-summary-total');
                } else {
                    row.classList.add('od-summary-row');
                }
            });

            var summarySection = inner.querySelector('.od-order-summary');
            if (summarySection) {
                var summaryBody = summarySection.querySelector('.od-section-body');
                if (summaryBody) summaryBody.classList.add('od-summary-strip');
            }

            var layoutOrder = [
                inner.querySelector('.od-products'),
                inner.querySelector('.od-customer'),
                inner.querySelector('.od-shipping'),
                inner.querySelector('.od-payment'),
                inner.querySelector('.od-order-summary'),
                inner.querySelector('.od-return-actions')
            ];
            layoutOrder.forEach(function (el) {
                if (el && el.parentElement === inner) inner.appendChild(el);
            });
        });
    }

    function init() {
        document.body.classList.add('orders-page');
        if (/\/ReturnedOrders/i.test(window.location.pathname)) {
            document.body.classList.add('orders-returned-page');
        }
        forceTableView();
        enhanceOrderDetails();
        patchSpinnerHelpers();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.addEventListener('load', function () {
        patchSpinnerHelpers();
    });
})();
