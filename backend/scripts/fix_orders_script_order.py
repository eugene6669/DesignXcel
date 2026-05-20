from pathlib import Path

ADMIN = Path(__file__).resolve().parents[1] / "views" / "Employee" / "Admin"

OLD = """    <script src="/js/Employee/Admin/admin-orders-compact.js?v=20260521a"></script>
    <script src="/js/Employee/Admin/admin-loading-spinner.js"></script>"""

NEW = """    <script src="/js/Employee/Admin/admin-loading-spinner.js"></script>
    <script src="/js/Employee/Admin/admin-orders-compact.js?v=20260521a"></script>"""

ALT_OLD = """    <script src="/js/Employee/Admin/admin-orders-compact.js"></script>
    <script src="/js/Employee/Admin/admin-loading-spinner.js"></script>"""


def main() -> None:
    for p in ADMIN.glob("Admin*Order*.ejs"):
        c = p.read_text(encoding="utf-8")
        if OLD in c:
            c = c.replace(OLD, NEW)
            p.write_text(c, encoding="utf-8")
            print("reordered", p.name)
        elif "admin-orders-compact.js" in c and "admin-loading-spinner.js" in c:
            import re
            c2 = re.sub(
                r'<script src="/js/Employee/Admin/admin-orders-compact\.js[^"]*"></script>\s*'
                r'<script src="/js/Employee/Admin/admin-loading-spinner\.js"></script>',
                NEW,
                c,
            )
            if c2 != c:
                p.write_text(c2, encoding="utf-8")
                print("reordered (regex)", p.name)


if __name__ == "__main__":
    main()
