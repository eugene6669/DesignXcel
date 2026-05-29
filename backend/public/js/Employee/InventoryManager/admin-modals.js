/* Admin modals — disable closing when clicking the overlay backdrop */
(function () {
    'use strict';

    function markNoBackdropClose(root) {
        var scope = root || document;
        scope.querySelectorAll('.modal, .inventory-confirmation-modal, .pi-modal').forEach(function (el) {
            el.setAttribute('data-no-backdrop-close', '1');
        });
    }

    function init() {
        markNoBackdropClose(document);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.markAdminModalsNoBackdropClose = markNoBackdropClose;
})();
