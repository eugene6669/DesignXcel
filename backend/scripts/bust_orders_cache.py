from pathlib import Path

ADMIN = Path(__file__).resolve().parents[1] / "views" / "Employee" / "Admin"
VER = "20260521a"
for p in ADMIN.glob("Admin*Order*.ejs"):
    c = p.read_text(encoding="utf-8")
    import re
    c = re.sub(r"admin-orders-compact\.css\?v=[^\"']+", f"admin-orders-compact.css?v={VER}", c)
    c = re.sub(r"admin-orders-compact\.js\?v=[^\"']+", f"admin-orders-compact.js?v={VER}", c)
    if f"admin-orders-compact.css?v={VER}" not in c:
        c = c.replace(
            "/css/Employee/Admin/admin-orders-compact.css",
            f"/css/Employee/Admin/admin-orders-compact.css?v={VER}",
        )
    if f"admin-orders-compact.js?v={VER}" not in c:
        c = c.replace(
            "/js/Employee/Admin/admin-orders-compact.js",
            f"/js/Employee/Admin/admin-orders-compact.js?v={VER}",
        )
    p.write_text(c, encoding="utf-8")
    print(p.name)
