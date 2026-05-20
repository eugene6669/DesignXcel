#!/usr/bin/env python3
"""Patch admin order EJS views for unified Orders tabs and compact table."""
import re
from pathlib import Path

ADMIN = Path(__file__).resolve().parents[1] / "views" / "Employee" / "Admin"

TAB_FILES = {
    "AdminOrdersProcessing.ejs": "processing",
    "AdminOrdersShipping.ejs": "shipping",
    "AdminOrdersDelivery.ejs": "delivery",
    "AdminOrdersReceive.ejs": "receive",
    "AdminCancelledOrders.ejs": "cancelled",
    "AdminCompletedOrders.ejs": "completed",
}

REDIRECTS = [
    ("/Employee/Admin/OrdersProcessing", "/Employee/Admin/Orders?tab=processing"),
    ("/Employee/Admin/OrdersShipping", "/Employee/Admin/Orders?tab=shipping"),
    ("/Employee/Admin/OrdersDelivery", "/Employee/Admin/Orders?tab=delivery"),
    ("/Employee/Admin/OrdersReceive", "/Employee/Admin/Orders?tab=receive"),
    ("/Employee/Admin/OrdersPending", "/Employee/Admin/Orders?tab=pending"),
    ("/Employee/Admin/CancelledOrders", "/Employee/Admin/Orders?tab=cancelled"),
    ("/Employee/Admin/CompletedOrders", "/Employee/Admin/Orders?tab=completed"),
]


def patch(path: Path, tab: str | None) -> None:
    c = path.read_text(encoding="utf-8")
    if "admin-orders-compact.css" not in c:
        c = c.replace(
            '<link rel="stylesheet" href="/css/Employee/Admin/AdminIndexStyles.css">',
            '<link rel="stylesheet" href="/css/Employee/Admin/AdminIndexStyles.css">\n'
            '    <link rel="stylesheet" href="/css/Employee/Admin/admin-orders-compact.css">',
        )
    c = re.sub(
        r"include\('partials/sidebar', \{ activePage: 'orders-[^']+' \}\)",
        "include('partials/sidebar', { activePage: typeof activePage !== 'undefined' ? activePage : 'orders' })",
        c,
    )
    if tab and "admin-orders-tabs" not in c:
        c = re.sub(
            r"(</div>\s*</div>\s*<div class=\"content-area\">)",
            f"</div>\n\n            <%- include('partials/admin-orders-tabs', {{ ordersTab: typeof ordersTab !== 'undefined' ? ordersTab : '{tab}' }}) %>\n\n            <div class=\"content-area\">",
            c,
            count=1,
        )
    c = c.replace(
        "<!-- View Toggle and Pagination Info -->\n                <div style=\"display: flex",
        "<!-- View Toggle and Pagination Info -->\n                <div class=\"orders-view-toggle-row\" style=\"display: flex",
    )
    c = c.replace(
        '<div class="orders-grid" id="ordersGrid">',
        '<div class="orders-grid" id="ordersGrid" style="display: none;">',
    )
    c = c.replace(
        'id="ordersTable" style="display: none;',
        'id="ordersTable" style="display: block;',
    )
    c = c.replace(
        '<table style="width: 100%; border-collapse: collapse;">',
        '<table class="admin-orders-compact-table">',
    )
    if "admin-orders-compact.js" not in c:
        if 'admin-loading-spinner.js' in c:
            c = c.replace(
                '<script src="/js/Employee/Admin/admin-loading-spinner.js">',
                '<script src="/js/Employee/Admin/admin-orders-compact.js"></script>\n'
                '    <script src="/js/Employee/Admin/admin-loading-spinner.js">',
            )
        else:
            c = c.replace(
                "</body>",
                '    <script src="/js/Employee/Admin/admin-orders-compact.js"></script>\n</body>',
            )
    for old, new in REDIRECTS:
        c = c.replace(old, new)
    path.write_text(c, encoding="utf-8")
    print("patched", path.name)


def patch_returned() -> None:
    path = ADMIN / "AdminReturnedOrders.ejs"
    c = path.read_text(encoding="utf-8")
    if "admin-orders-compact.css" not in c:
        c = c.replace(
            '<link rel="stylesheet" href="/css/Employee/Admin/AdminIndexStyles.css">',
            '<link rel="stylesheet" href="/css/Employee/Admin/AdminIndexStyles.css">\n'
            '    <link rel="stylesheet" href="/css/Employee/Admin/admin-orders-compact.css">',
        )
    c = re.sub(
        r"include\('partials/sidebar', \{ activePage: 'orders-returned' \}\)",
        "include('partials/sidebar', { activePage: typeof activePage !== 'undefined' ? activePage : 'orders-returned' })",
        c,
    )
    c = c.replace(
        "<!-- View Toggle and Pagination Info -->\n                <div style=\"display: flex",
        "<!-- View Toggle and Pagination Info -->\n                <div class=\"orders-view-toggle-row\" style=\"display: flex",
    )
    c = c.replace(
        '<div class="orders-grid" id="ordersGrid">',
        '<div class="orders-grid" id="ordersGrid" style="display: none;">',
    )
    c = c.replace(
        'id="ordersTable" style="display: none;',
        'id="ordersTable" style="display: block;',
    )
    c = c.replace(
        '<table style="width: 100%; border-collapse: collapse;">',
        '<table class="admin-orders-compact-table">',
    )
    # Add Return Type column header if missing
    if "Return Type" not in c and "<th" in c:
        c = c.replace(
            "<th style=\"padding: 1rem; text-align: left; font-weight: 600; color: #6b7280; font-size: 0.75rem; text-transform: uppercase;\">Status</th>",
            "<th style=\"padding: 1rem; text-align: left; font-weight: 600; color: #6b7280; font-size: 0.75rem; text-transform: uppercase;\">Status</th>\n"
            "                                    <th style=\"padding: 1rem; text-align: left; font-weight: 600; color: #6b7280; font-size: 0.75rem; text-transform: uppercase;\">Return Type</th>",
            1,
        )
    if "admin-orders-compact.js" not in c:
        c = c.replace(
            '<script src="/js/Employee/Admin/admin-loading-spinner.js">',
            '<script src="/js/Employee/Admin/admin-orders-compact.js"></script>\n'
            '    <script src="/js/Employee/Admin/admin-loading-spinner.js">',
        )
    path.write_text(c, encoding="utf-8")
    print("patched", path.name)


def main() -> None:
    for name, tab in TAB_FILES.items():
        patch(ADMIN / name, tab)
    patch_returned()


if __name__ == "__main__":
    main()
