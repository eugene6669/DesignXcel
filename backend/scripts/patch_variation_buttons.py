from pathlib import Path

p = Path(r'c:\Users\user\Downloads\DesignXcel\backend\public\js\Employee\Admin\product-inventory.js')
text = p.read_text(encoding='utf-8')
old = """                    '<button type="button" class="edit-variation-status-btn" data-variation-id="' + variationId + '" title="' + editTitle + '" style="background-color:#ffc107;color:#000;border:none;padding:5px 8px;border-radius:4px;cursor:pointer;">Edit</button>' +
                    '<button type="button" class="archive-variation-btn" data-variation-id="' + variationId + '" data-variation-name="' + escapeHtml(variationName) + '" title="Archive Variation">Archive</button>' +"""
new = """                    (showVariationEdit
                        ? '<button type="button" class="edit-variation-status-btn" data-variation-id="' + variationId + '" title="' + editTitle + '" style="background-color:#ffc107;color:#000;border:none;padding:5px 8px;border-radius:4px;cursor:pointer;">Edit</button>'
                        : '') +
                    (showVariationArchive
                        ? '<button type="button" class="archive-variation-btn" data-variation-id="' + variationId + '" data-variation-name="' + escapeHtml(variationName) + '" title="Archive Variation">Archive</button>'
                        : '') +"""
if old not in text:
    raise SystemExit('block not found')
text = text.replace(old, new, 1)
# append init and product return edit handler before final closing of IIFE - find last DOMContentLoaded or end
marker = "        document.addEventListener('DOMContentLoaded', function() {\n            // Edit inventory buttons"
if marker in text and 'initFlatProductTables' not in text[text.find(marker):text.find(marker)+500]:
    insert = """        if (isFlatListPage) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initFlatProductTables);
            } else {
                initFlatProductTables();
            }
        }

        document.addEventListener('click', function(e) {
            const productEditBtn = e.target.closest('.edit-product-return-status-btn');
            if (productEditBtn) {
                e.preventDefault();
                const pid = parseInt(productEditBtn.getAttribute('data-inventory-product-id'), 10);
                if (!pid) return;
                fetch('/api/admin/inventory-product-variations/' + pid)
                    .then(function(r) { return r.json(); })
                    .then(function(data) {
                        if (!data.success || !data.variations || !data.variations.length) {
                            showCustomPopup('No variations found for this product.', true);
                            return;
                        }
                        const withIssue = data.variations.filter(variationHasIssueStock);
                        const target = withIssue[0] || data.variations[0];
                        if (target && target.VariationID && typeof window.editVariationStatus === 'function') {
                            window.editVariationStatus(target.VariationID);
                        }
                    })
                    .catch(function() { showCustomPopup('Failed to load variations.', true); });
            }
        });

"""
    text = text.replace(marker, insert + marker)

# Fix handleVariationStatusSubmit isProductsListingPage -> isProductReturnsPage for returns-only status
text = text.replace(
    "if (isInventoryPage && (quantitiesChanged || selectedStatus))",
    "if (isInventoryPage && (quantitiesChanged || selectedStatus))"
)
text = text.replace(
    "const noChangeMsg = isInventoryPage",
    "const noChangeMsg = isInventoryPage"
)

# refresh flat list after status update
old_success = """                        const pid = currentSelectedProductId || window.currentVariationProductId;
                        if (pid) await notifyInventoryStockChanged(pid, result);"""
new_success = """                        const pid = currentSelectedProductId || window.currentVariationProductId;
                        if (pid) {
                            await notifyInventoryStockChanged(pid, result);
                            if (isFlatListPage) {
                                const productRow = document.querySelector('#productsFlatTable tr.product-flat-row[data-inventory-product-id=\"' + pid + '\"]');
                                if (productRow) loadFlatVariationsForProduct(pid, productRow);
                            }
                        }"""
if old_success in text:
    text = text.replace(old_success, new_success, 1)

p.write_text(text, encoding='utf-8')
print('patched')
