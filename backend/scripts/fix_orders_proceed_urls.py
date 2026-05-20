#!/usr/bin/env python3
"""Restore POST action URLs to legacy route names (not Orders?tab= paths)."""
from pathlib import Path

ADMIN = Path(__file__).resolve().parents[1] / "views" / "Employee" / "Admin"

# Wrong fragment -> correct API route segment
API_FIXES = [
    ("Orders?tab=processing/Proceed", "OrdersProcessing/Proceed"),
    ("Orders?tab=processing/Cancel", "OrdersProcessing/Cancel"),
    ("Orders?tab=shipping/Proceed", "OrdersShipping/Proceed"),
    ("Orders?tab=shipping/Cancel", "OrdersShipping/Cancel"),
    ("Orders?tab=delivery/Proceed", "OrdersDelivery/Proceed"),
    ("Orders?tab=delivery/Cancel", "OrdersDelivery/Cancel"),
    ("Orders?tab=receive/Proceed", "OrdersReceive/Proceed"),
    ("Orders?tab=receive/Cancel", "OrdersReceive/Cancel"),
    ("Orders?tab=pending/Proceed", "OrdersPending/Proceed"),
    ("Orders?tab=pending/Cancel", "OrdersPending/Cancel"),
]

FILES = list(ADMIN.glob("AdminOrders*.ejs"))


def main() -> None:
    for path in FILES:
        c = path.read_text(encoding="utf-8")
        orig = c
        for wrong, right in API_FIXES:
            c = c.replace(wrong, right)
        if c != orig:
            path.write_text(c, encoding="utf-8")
            print("fixed API URLs:", path.name)


if __name__ == "__main__":
    main()
