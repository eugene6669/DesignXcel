const fs = require('fs');
const p = require('path').join(__dirname, '../views/Employee/Admin/AdminProductInventory.ejs');
let s = fs.readFileSync(p, 'utf8');

if (!s.includes('create-variation-image')) {
  s = s.replace(
    `                <motion.div>
                    <label style="font-size: 0.85em;">Price (₱)</label>
                    <input type="number" class="create-variation-price" step="0.01" min="0" placeholder="0.00" style="width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;">
                </motion.div>
                <button type="button" class="remove-create-variation-btn"`,
    `                <motion.div>
                    <label style="font-size: 0.85em;">Price (₱)</label>
                    <input type="number" class="create-variation-price" step="0.01" min="0" placeholder="0.00" style="width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;">
                </motion.div>
                <motion.div>
                    <label style="font-size: 0.85em;">Image</label>
                    <input type="file" class="create-variation-image" accept="image/*" style="width: 100%; font-size: 0.8em;">
                </motion.div>
                <button type="button" class="remove-create-variation-btn"`
  );
  // fix motion.div typos from template above
  s = s.replace(/<motion\.div>/g, '<div>').replace(/<\/motion\.motion\.motion\.motion\.div>/g, '</motion.div>');
}

// simpler image insert
if (!s.includes('create-variation-image')) {
  const needle = `                    <input type="number" class="create-variation-price" step="0.01" min="0" placeholder="0.00" style="width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;">
                </motion.div>
                <button type="button" class="remove-create-variation-btn"`;
  const repl = `                    <input type="number" class="create-variation-price" step="0.01" min="0" placeholder="0.00" style="width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;">
                </motion.div>
                <motion.div>
                    <label style="font-size: 0.85em;">Image</label>
                    <input type="file" class="create-variation-image" accept="image/*" style="width: 100%; font-size: 0.8em;">
                </motion.div>
                <button type="button" class="remove-create-variation-btn"`;
  if (s.includes('create-variation-price') && s.includes('remove-create-variation-btn')) {
    s = s.replace(
      /(\s+<input type="number" class="create-variation-price"[^>]+>\s+<\/div>\s+)(<button type="button" class="remove-create-variation-btn")/,
      `$1<div>
                    <label style="font-size: 0.85em;">Image</label>
                    <input type="file" class="create-variation-image" accept="image/*" style="width: 100%; font-size: 0.8em;">
                </motion.div>
                $2`
    );
  }
}

if (!s.includes('function updateCreateVariationTotalSummary')) {
  s = s.replace(
    "row.querySelector('.remove-create-variation-btn').addEventListener('click', () => row.remove());",
    `row.querySelector('.remove-create-variation-btn').addEventListener('click', () => {
                row.remove();
                updateCreateVariationTotalSummary();
            });
            row.querySelector('.create-variation-quantity')?.addEventListener('input', updateCreateVariationTotalSummary);`
  );
  s = s.replace(
    '        function collectCreateProductVariations() {',
    `        function updateCreateVariationTotalSummary() {
            const summary = document.getElementById('createVariationTotalSummary');
            if (!summary) return;
            const total = collectCreateProductVariations().reduce((sum, v) => sum + (v.quantity || 0), 0);
            summary.textContent = 'Total quantity: ' + total;
        }

        function collectCreateProductVariations() {`
  );
}

if (!s.includes('window.restockVariationInline')) {
  s = s.replace(
    '        let allRawMaterials = [];',
    `        window.restockVariationInline = async function(variationId, inventoryProductId, buttonEl) {
            const qtyInput = document.getElementById('restock-qty-' + variationId);
            const quantity = parseInt(qtyInput?.value, 10);
            if (!variationId || !inventoryProductId || !quantity || quantity <= 0) {
                showCustomPopup('Enter a positive restock quantity.', true);
                return;
            }
            if (buttonEl) { buttonEl.disabled = true; buttonEl.textContent = '...'; }
            try {
                const response = await fetch('/api/admin/inventory-products/restock', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ inventoryProductId, variationId, quantity })
                });
                const result = await response.json();
                if (result.success) {
                    showCustomPopup(result.message || 'Restock successful.');
                    refreshProductVariationsUI(inventoryProductId);
                    setTimeout(() => window.location.reload(), 600);
                } else {
                    showCustomPopup(result.message || 'Restock failed.', true);
                }
            } catch (err) {
                showCustomPopup('Restock failed: ' + err.message, true);
            } finally {
                if (buttonEl) { buttonEl.disabled = false; buttonEl.textContent = 'Add'; }
            }
        };

        let allRawMaterials = [];`
  );
}

// form submit ajax
if (!s.includes('X-Requested-With')) {
  s = s.replace(
    `        const addProductForm = document.getElementById('addProductForm');
        if (addProductForm) {
            addProductForm.addEventListener('submit', function(e) {
                const recipeRows = document.querySelectorAll('#createInventoryMaterialsContainer .material-row');
                const recipeMaterials = getCreateInventoryRequiredMaterials();
                if (recipeRows.length > 0 && recipeMaterials.length === 0) {
                    e.preventDefault();
                    showCustomPopup('For each recipe row, pick a material and quantity (or remove empty rows).', true);
                    return;
                }

                const variations = collectCreateProductVariations();
                const jsonField = document.getElementById('variationsJson');
                const qtyField = document.getElementById('quantity');
                if (qtyField) {
                    const totalVariationQty = variations.reduce((sum, v) => sum + (v.quantity || 0), 0);
                    qtyField.value = variations.length > 0 ? String(totalVariationQty) : String(parseInt(qtyField.value, 10) || 0);
                }
                if (jsonField) {
                    jsonField.value = variations.length > 0 ? JSON.stringify(variations) : '';
                }

                const materialsField = document.getElementById('requiredMaterials');
                if (materialsField) {
                    materialsField.value = JSON.stringify(recipeMaterials);
                }

                const length = document.getElementById('length');
                const width = document.getElementById('width');
                const height = document.getElementById('height');
                const unit = document.getElementById('dimensionUnit');

                if (length && width && height && unit) {
                    if (length.value || width.value || height.value) {
                        const dimensions = JSON.stringify({
                            length: length.value || 0,
                            width: width.value || 0,
                            height: height.value || 0,
                            unit: unit.value
                        });
                        const hiddenInput = document.createElement('input');
                        hiddenInput.type = 'hidden';
                        hiddenInput.name = 'dimensions';
                        hiddenInput.value = dimensions;
                        this.appendChild(hiddenInput);
                    }
                }
            });
        }`,
    `        const addProductForm = document.getElementById('addProductForm');
        if (addProductForm) {
            addProductForm.addEventListener('submit', async function(e) {
                e.preventDefault();
                const recipeRows = document.querySelectorAll('#createInventoryMaterialsContainer .material-row');
                const recipeMaterials = getCreateInventoryRequiredMaterials();
                if (recipeRows.length > 0 && recipeMaterials.length === 0) {
                    showCustomPopup('For each recipe row, pick a material and quantity (or remove empty rows).', true);
                    return;
                }

                const variations = collectCreateProductVariations();
                if (!variations.length) {
                    showCustomPopup('Add at least one variation before creating the product.', true);
                    return;
                }

                const jsonField = document.getElementById('variationsJson');
                const qtyField = document.getElementById('quantity');
                const totalVariationQty = variations.reduce((sum, v) => sum + (v.quantity || 0), 0);
                if (qtyField) qtyField.value = String(totalVariationQty);
                if (jsonField) jsonField.value = JSON.stringify(variations);

                const materialsField = document.getElementById('requiredMaterials');
                if (materialsField) materialsField.value = JSON.stringify(recipeMaterials);

                const formData = new FormData(this);
                document.querySelectorAll('#createProductVariationsList .create-product-variation-row').forEach((row) => {
                    const fileInput = row.querySelector('.create-variation-image');
                    if (fileInput?.files?.[0]) {
                        formData.append('variationImage', fileInput.files[0]);
                    }
                });

                const submitBtn = this.querySelector('button[type="submit"]');
                if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Creating...'; }
                try {
                    const response = await fetch(this.action, {
                        method: 'POST',
                        body: formData,
                        credentials: 'include',
                        headers: { 'X-Requested-With': 'XMLHttpRequest' }
                    });
                    const result = await response.json();
                    if (result.success) {
                        showCustomPopup(result.message || 'Product created.');
                        setTimeout(() => {
                            window.location.href = '/Employee/Admin/ProductInventory?inventoryProductId=' + result.inventoryProductId + '&tab=variations';
                        }, 500);
                    } else {
                        showCustomPopup(result.message || 'Failed to create product.', true);
                    }
                } catch (err) {
                    showCustomPopup('Failed to create product: ' + err.message, true);
                } finally {
                    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Create Product'; }
                }
            });
        }`
  );
}

// default variation on open
if (!s.includes('list.appendChild(buildCreateProductVariationRow())')) {
  s = s.replace(
    `                resetCreateProductVariations();
                resetCreateInventoryMaterials();
                addProductModal.style.display = 'block';`,
    `                resetCreateProductVariations();
                resetCreateInventoryMaterials();
                const createVarList = document.getElementById('createProductVariationsList');
                if (createVarList) createVarList.appendChild(buildCreateProductVariationRow());
                updateCreateVariationTotalSummary();
                addProductModal.style.display = 'block';`
  );
}

// product image preview
if (!s.includes('productImage') && s.includes('id="productImage"')) {
  s = s.replace(
    `        if (addInventoryItemBtn && addProductModal) {
            addInventoryItemBtn.addEventListener('click', () => {`,
    `        const productImageInput = document.getElementById('productImage');
        if (productImageInput) {
            productImageInput.addEventListener('change', function() {
                const preview = document.getElementById('addInventoryProductImagePreview');
                if (!preview) return;
                preview.innerHTML = '';
                if (this.files && this.files[0]) {
                    const img = document.createElement('img');
                    img.src = URL.createObjectURL(this.files[0]);
                    img.style.cssText = 'max-width:120px;max-height:120px;border-radius:4px;border:1px solid #ddd;';
                    preview.appendChild(img);
                }
            });
        }

        if (addInventoryItemBtn && addProductModal) {
            addInventoryItemBtn.addEventListener('click', () => {`
  );
}

// hide restock btn references
s = s.replace(/\s*if \(restockInventoryBtn\) restockInventoryBtn\.style\.display = 'inline-block';\s*/g, '\n');
s = s.replace(/const restockInventoryBtn = document\.getElementById\('restockInventoryBtn'\);\s*/g, '');

fs.writeFileSync(p, s);
console.log('done', { hasImage: s.includes('create-variation-image'), hasRestockFn: s.includes('restockVariationInline'), hasAjax: s.includes('XMLHttpRequest') });
