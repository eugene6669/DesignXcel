(function () {
    if (window.__dxEmployeeSidebarInit) return;
    window.__dxEmployeeSidebarInit = true;

    var STORAGE_KEY = 'dx-employee-sidebar-collapsed';

    function setCollapsed(collapsed) {
        document.querySelectorAll('.dashboard-container').forEach(function (el) {
            el.classList.toggle('sidebar-collapsed', collapsed);
        });
        document.querySelectorAll('.sidebar-collapse-btn').forEach(function (btn) {
            btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            btn.setAttribute('aria-label', collapsed ? 'Show sidebar' : 'Hide sidebar');
            btn.title = collapsed ? 'Show sidebar' : 'Hide sidebar';
        });
    }

    function toggleSidebar() {
        var container = document.querySelector('.dashboard-container');
        if (!container) return;
        var collapsed = !container.classList.contains('sidebar-collapsed');
        try {
            localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
        } catch (e) { /* ignore */ }
        setCollapsed(collapsed);
    }

    document.addEventListener('DOMContentLoaded', function () {
        var saved = false;
        try {
            saved = localStorage.getItem(STORAGE_KEY) === '1';
        } catch (e) { /* ignore */ }
        if (saved) setCollapsed(true);

        document.body.addEventListener('click', function (e) {
            if (e.target.closest('.sidebar-collapse-btn')) {
                e.preventDefault();
                toggleSidebar();
            }
        });
    });
})();
