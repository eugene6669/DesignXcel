(function () {
    'use strict';

    function popup(message, isError) {
        if (typeof showCustomPopup === 'function') {
            showCustomPopup(message, isError);
        } else {
            alert(message);
        }
    }

    function openModal(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'block';
    }

    function closeModal(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    }

    let cachedRawMaterials = null;

    async function getRawMaterialsList() {
        if (cachedRawMaterials) return cachedRawMaterials;
        const el = document.getElementById('bomRawMaterialsJson');
        if (el && el.textContent) {
            try {
                cachedRawMaterials = JSON.parse(el.textContent);
                if (cachedRawMaterials.length) return cachedRawMaterials;
            } catch (e) { /* fetch */ }
        }
        try {
            const res = await fetch('/api/rawmaterials', { credentials: 'include' });
            const data = await res.json();
            if (data.success) {
                cachedRawMaterials = (data.materials || []).map(function (m) {
                    return {
                        id: m.id,
                        sku: m.sku,
                        name: m.name,
                        unit: m.unit,
                        stockQuantity: Number(m.stockQuantity) || 0
                    };
                });
            }
        } catch (e) {
            cachedRawMaterials = [];
        }
        return cachedRawMaterials || [];
    }

    function getMaterialById(id) {
        return (cachedRawMaterials || []).find(function (m) {
            return String(m.id) === String(id);
        });
    }

    function materialOptionLabel(m) {
        const sku = m.sku ? m.sku + ' — ' : '';
        return sku + m.name + ' (' + (m.unit || 'pcs') + ', stock: ' + (m.stockQuantity ?? 0) + ')';
    }

    function getSelectedMaterialIds(excludeSelect) {
        const ids = new Set();
        document.querySelectorAll('#bomMaterialsContainer .material-select').forEach(function (sel) {
            if (sel === excludeSelect) return;
            if (sel.value) ids.add(sel.value);
        });
        return ids;
    }

    function applyQtyLimits(row) {
        const select = row.querySelector('.material-select');
        const qtyInput = row.querySelector('.material-quantity');
        let hint = row.querySelector('.material-qty-hint');
        if (!hint) {
            hint = document.createElement('div');
            hint.className = 'material-qty-hint';
            row.appendChild(hint);
        }
        const mat = getMaterialById(select?.value);
        const stock = mat ? (mat.stockQuantity ?? 0) : 0;
        if (mat) {
            qtyInput.max = String(Math.max(stock, 0));
            qtyInput.title = 'Max ' + stock + ' (current stock)';
            hint.textContent = stock > 0
                ? 'Max ' + stock + ' ' + (mat.unit || 'pcs') + ' per unit'
                : 'Out of stock — cannot use in bundle';
            if (parseInt(qtyInput.value, 10) > stock) {
                qtyInput.value = stock > 0 ? stock : 1;
            }
            if (stock <= 0) qtyInput.setAttribute('readonly', 'readonly');
            else qtyInput.removeAttribute('readonly');
        } else {
            qtyInput.removeAttribute('max');
            qtyInput.removeAttribute('readonly');
            hint.textContent = '';
        }
    }

    function refreshAllMaterialSelects() {
        document.querySelectorAll('#bomMaterialsContainer .bom-material-row').forEach(function (row) {
            const select = row.querySelector('.material-select');
            if (!select) return;
            const current = select.value;
            const taken = getSelectedMaterialIds(select);
            const materials = cachedRawMaterials || [];
            let html = '<option value="">Select material</option>';
            materials.forEach(function (m) {
                const id = String(m.id);
                if (taken.has(id) && id !== String(current)) return;
                html += '<option value="' + id + '"' + (id === String(current) ? ' selected' : '') + '>' +
                    materialOptionLabel(m) + '</option>';
            });
            select.innerHTML = html;
            applyQtyLimits(row);
        });
    }

    async function createBomMaterialRow(selectedId, qty) {
        await getRawMaterialsList();
        const row = document.createElement('div');
        row.className = 'bom-material-row material-row';

        const select = document.createElement('select');
        select.className = 'material-select';
        select.addEventListener('change', function () {
            applyQtyLimits(row);
            refreshAllMaterialSelects();
        });

        const qtyInput = document.createElement('input');
        qtyInput.type = 'number';
        qtyInput.className = 'material-quantity';
        qtyInput.min = '1';
        qtyInput.placeholder = 'Qty';
        qtyInput.value = qty || 1;
        qtyInput.addEventListener('input', function () {
            applyQtyLimits(row);
        });

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-material-btn';
        removeBtn.textContent = '×';
        removeBtn.title = 'Remove';
        removeBtn.addEventListener('click', function () {
            row.remove();
            refreshAllMaterialSelects();
        });

        row.appendChild(select);
        row.appendChild(qtyInput);
        row.appendChild(removeBtn);

        const container = document.getElementById('bomMaterialsContainer');
        if (container) container.appendChild(row);

        if (selectedId) select.value = String(selectedId);
        refreshAllMaterialSelects();
        return row;
    }

    function collectBomMaterials() {
        const map = new Map();
        document.querySelectorAll('#bomMaterialsContainer .bom-material-row').forEach(function (row) {
            const materialId = row.querySelector('.material-select')?.value;
            const quantityRequired = parseInt(row.querySelector('.material-quantity')?.value, 10);
            if (!materialId || quantityRequired <= 0) return;
            const mid = parseInt(materialId, 10);
            map.set(mid, (map.get(mid) || 0) + quantityRequired);
        });
        return Array.from(map.entries()).map(function ([materialId, quantityRequired]) {
            return { materialId, quantityRequired };
        });
    }

    function validateBomMaterialsStock(materials) {
        for (const entry of materials) {
            const mat = getMaterialById(entry.materialId);
            if (!mat) {
                return { ok: false, message: 'Invalid material selected.' };
            }
            const stock = mat.stockQuantity ?? 0;
            if (stock <= 0) {
                return { ok: false, message: '"' + mat.name + '" is out of stock.' };
            }
            if (entry.quantityRequired > stock) {
                return {
                    ok: false,
                    message: '"' + mat.name + '": qty per unit (' + entry.quantityRequired +
                        ') cannot exceed stock (' + stock + ').'
                };
            }
        }
        return { ok: true };
    }

    function resetBomForm() {
        document.getElementById('bomEditBundleId').value = '';
        document.getElementById('bomBundleName').value = '';
        document.getElementById('bomBundleDescription').value = '';
        const container = document.getElementById('bomMaterialsContainer');
        if (container) container.innerHTML = '';
        document.getElementById('bomModalTitle').textContent = 'Create BOM Bundle';
    }

    async function openBomModalForCreate() {
        resetBomForm();
        await createBomMaterialRow();
        openModal('bomBundleModal');
    }

    async function openBomModalForEdit(bundleId) {
        resetBomForm();
        document.getElementById('bomEditBundleId').value = bundleId;
        document.getElementById('bomModalTitle').textContent = 'Edit BOM Bundle';
        try {
            const res = await fetch('/api/admin/bom-bundles/' + bundleId, { credentials: 'include' });
            const data = await res.json();
            if (!data.success) {
                popup(data.message || 'Failed to load bundle.', true);
                return;
            }
            document.getElementById('bomBundleName').value = data.bundle.Name || '';
            document.getElementById('bomBundleDescription').value = data.bundle.Description || '';
            const container = document.getElementById('bomMaterialsContainer');
            if (container) container.innerHTML = '';
            if (data.materials && data.materials.length) {
                for (const m of data.materials) {
                    await createBomMaterialRow(m.materialId, m.quantityRequired);
                }
            } else {
                await createBomMaterialRow();
            }
            openModal('bomBundleModal');
        } catch (e) {
            popup('Failed to load bundle.', true);
        }
    }

    async function saveBomBundle() {
        const name = document.getElementById('bomBundleName').value.trim();
        if (!name) {
            popup('Bundle name is required.', true);
            return;
        }
        await getRawMaterialsList();
        const materials = collectBomMaterials();
        if (!materials.length) {
            popup('Add at least one material with quantity.', true);
            return;
        }
        const stockCheck = validateBomMaterialsStock(materials);
        if (!stockCheck.ok) {
            popup(stockCheck.message, true);
            return;
        }

        const editId = document.getElementById('bomEditBundleId').value;
        const payload = {
            name,
            description: document.getElementById('bomBundleDescription').value.trim(),
            materials
        };
        const btn = document.getElementById('bomSaveBundleBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
        try {
            const url = editId ? '/api/admin/bom-bundles/' + editId : '/api/admin/bom-bundles';
            const res = await fetch(url, {
                method: editId ? 'PUT' : 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.success) {
                popup(data.message || 'Bundle saved.');
                closeModal('bomBundleModal');
                setTimeout(function () {
                    window.location.href = '/Employee/Admin/ProductInventory?tab=bom-bundles';
                }, 600);
            } else {
                popup(data.message || 'Failed to save bundle.', true);
            }
        } catch (e) {
            popup('Failed to save bundle.', true);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
        }
    }

    async function archiveBomBundle(bundleId, bundleName) {
        if (!confirm('Archive BOM bundle "' + bundleName + '"?')) return;
        try {
            const res = await fetch('/api/admin/bom-bundles/' + bundleId, {
                method: 'DELETE',
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) {
                popup('Bundle archived. Restore it from the Archived page.');
                const row = document.querySelector('#bomBundlesTable tr[data-bundle-id="' + bundleId + '"]');
                if (row) row.remove();
            } else {
                popup(data.message || 'Failed to archive.', true);
            }
        } catch (e) {
            popup('Failed to archive bundle.', true);
        }
    }

    function init() {
        if (!document.getElementById('bomBundlesTab')) return;

        document.getElementById('bomAddBundleBtn')?.addEventListener('click', openBomModalForCreate);

        document.getElementById('bomAddMaterialRowBtn')?.addEventListener('click', async function () {
            const materials = await getRawMaterialsList();
            const rows = document.querySelectorAll('#bomMaterialsContainer .bom-material-row').length;
            if (rows >= materials.length) {
                popup('All materials are already in this bundle.', true);
                return;
            }
            await createBomMaterialRow();
        });

        document.getElementById('bomSaveBundleBtn')?.addEventListener('click', saveBomBundle);
        ['bomCloseModal', 'bomCancelModal'].forEach(function (id) {
            document.getElementById(id)?.addEventListener('click', function () {
                closeModal('bomBundleModal');
            });
        });

        const modal = document.getElementById('bomBundleModal');
        if (modal) {
            modal.addEventListener('click', function (e) {
                if (e.target === modal) closeModal('bomBundleModal');
            });
        }

        document.querySelectorAll('#bomBundlesTab .edit-bom-bundle-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                openBomModalForEdit(btn.getAttribute('data-id'));
            });
        });

        document.querySelectorAll('#bomBundlesTab .delete-bom-bundle-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                archiveBomBundle(btn.getAttribute('data-id'), btn.getAttribute('data-name'));
            });
        });
    }

    document.addEventListener('rawMaterialArchived', function () {
        cachedRawMaterials = null;
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
