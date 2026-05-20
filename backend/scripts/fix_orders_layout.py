#!/usr/bin/env python3
"""Fix missing orders-header closing div before tabs include."""
from pathlib import Path

ADMIN = Path(__file__).resolve().parents[1] / "views" / "Employee" / "Admin"

FILES = [
    "AdminOrdersProcessing.ejs",
    "AdminOrdersShipping.ejs",
    "AdminOrdersDelivery.ejs",
    "AdminOrdersReceive.ejs",
    "AdminCancelledOrders.ejs",
    "AdminCompletedOrders.ejs",
]

OLD = """                </div>

            <%- include('partials/admin-orders-tabs'"""

NEW = """                </div>
            </div>

            <%- include('partials/admin-orders-tabs'"""


def main() -> None:
    for name in FILES:
        path = ADMIN / name
        c = path.read_text(encoding="utf-8")
        if OLD in c:
            c = c.replace(OLD, NEW, 1)
            path.write_text(c, encoding="utf-8")
            print("fixed header close:", name)
        elif NEW.split("\n")[2] in c:
            print("already fixed:", name)
        else:
            print("pattern not found:", name)


if __name__ == "__main__":
    main()
