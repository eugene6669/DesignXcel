(function () {
    'use strict';

    function popup(message, isError) {
        if (typeof showCustomPopup === 'function') {
            showCustomPopup(message, isError);
        } else {
            alert(message);
        }
    }

    const commonMaterials = [
        { name: 'Plywood (3/4 inch)', unit: 'sheet', category: 'Wood' },
        { name: 'Plywood (1/2 inch)', unit: 'sheet', category: 'Wood' },
        { name: 'Plywood (1/4 inch)', unit: 'sheet', category: 'Wood' },
        { name: 'MDF Board (Medium Density Fiberboard)', unit: 'sheet', category: 'Wood' },
        { name: 'Particle Board', unit: 'sheet', category: 'Wood' },
        { name: 'Hardwood (Oak)', unit: 'board', category: 'Wood' },
        { name: 'Hardwood (Maple)', unit: 'board', category: 'Wood' },
        { name: 'Veneer Sheet', unit: 'sheet', category: 'Wood' },
        { name: 'Laminate Sheet', unit: 'sheet', category: 'Wood' },
        { name: 'Steel Sheet (16 gauge)', unit: 'sheet', category: 'Metal' },
        { name: 'Steel Sheet (18 gauge)', unit: 'sheet', category: 'Metal' },
        { name: 'Aluminum Sheet', unit: 'sheet', category: 'Metal' },
        { name: 'Steel Tube (Square)', unit: 'm', category: 'Metal' },
        { name: 'Steel Tube (Round)', unit: 'm', category: 'Metal' },
        { name: 'Stainless Steel Sheet', unit: 'sheet', category: 'Metal' },
        { name: 'Wood Screws (#8)', unit: 'pcs', category: 'Hardware' },
        { name: 'Wood Screws (#10)', unit: 'pcs', category: 'Hardware' },
        { name: 'Machine Screws (M6)', unit: 'pcs', category: 'Hardware' },
        { name: 'Machine Screws (M8)', unit: 'pcs', category: 'Hardware' },
        { name: 'Bolts (M6)', unit: 'pcs', category: 'Hardware' },
        { name: 'Bolts (M8)', unit: 'pcs', category: 'Hardware' },
        { name: 'Nuts (M6)', unit: 'pcs', category: 'Hardware' },
        { name: 'Nuts (M8)', unit: 'pcs', category: 'Hardware' },
        { name: 'Washers (Flat)', unit: 'pcs', category: 'Hardware' },
        { name: 'Hinges (Butt)', unit: 'pair', category: 'Hardware' },
        { name: 'Drawer Slides', unit: 'pair', category: 'Hardware' },
        { name: 'Drawer Pulls', unit: 'pcs', category: 'Hardware' },
        { name: 'Cabinet Handles', unit: 'pcs', category: 'Hardware' },
        { name: 'Casters (Furniture)', unit: 'pcs', category: 'Hardware' },
        { name: 'Leveling Feet', unit: 'pcs', category: 'Hardware' },
        { name: 'Fabric (Upholstery Grade)', unit: 'sqm', category: 'Upholstery' },
        { name: 'Leather (Genuine)', unit: 'sqm', category: 'Upholstery' },
        { name: 'Foam (High Density)', unit: 'sheet', category: 'Upholstery' },
        { name: 'Foam (Medium Density)', unit: 'sheet', category: 'Upholstery' },
        { name: 'Batting', unit: 'sqm', category: 'Upholstery' },
        { name: 'Tempered Glass (1/4 inch)', unit: 'sheet', category: 'Glass' },
        { name: 'Acrylic Sheet (Clear)', unit: 'sheet', category: 'Glass' },
        { name: 'Wood Stain', unit: 'l', category: 'Finishing' },
        { name: 'Wood Varnish', unit: 'l', category: 'Finishing' },
        { name: 'Polyurethane (Clear)', unit: 'l', category: 'Finishing' },
        { name: 'Paint (Primer)', unit: 'l', category: 'Finishing' },
        { name: 'Paint (Enamel)', unit: 'l', category: 'Finishing' },
        { name: 'Wood Filler', unit: 'kg', category: 'Finishing' },
        { name: 'Sandpaper (120 grit)', unit: 'sheet', category: 'Finishing' },
        { name: 'Wood Glue', unit: 'l', category: 'Finishing' },
        { name: 'Contact Cement', unit: 'l', category: 'Finishing' },
        { name: 'LED Strip Light', unit: 'm', category: 'Electrical' },
        { name: 'Cable Management', unit: 'm', category: 'Electrical' },
        { name: 'Felt Pads', unit: 'pcs', category: 'Padding' },
        { name: 'Epoxy Adhesive', unit: 'l', category: 'Adhesives' },
        { name: 'Silicone Sealant', unit: 'l', category: 'Adhesives' },
        { name: 'Bubble Wrap', unit: 'roll', category: 'Packaging' },
        { name: 'Packing Tape', unit: 'roll', category: 'Packaging' },
        { name: 'Cable Grommet', unit: 'pcs', category: 'Miscellaneous' },
        { name: 'Grommet (Desk Hole)', unit: 'pcs', category: 'Miscellaneous' },
        { name: 'Rubber Bumpers', unit: 'pcs', category: 'Miscellaneous' }
    ];

    function openModal(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'block';
    }

    function closeModal(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    }

    function wireClose(ids, modalId) {
        ids.forEach(function (id) {
            const el = document.getElementById(id);
            if (el) el.addEventListener('click', function () { closeModal(modalId); });
        });
    }

    function populateCommonMaterials() {
        const list = document.getElementById('rmCommonMaterialsList');
        if (!list) return;

        const grouped = {};
        commonMaterials.forEach(function (m) {
            if (!grouped[m.category]) grouped[m.category] = [];
            grouped[m.category].push(m);
        });

        let html = '';
        Object.keys(grouped).sort().forEach(function (cat) {
            html += '<TAG class="rm-quick-cat">' + cat + '</TAG>';
            grouped[cat].forEach(function (material) {
                const esc = material.name.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
                html += '<TAG class="rm-quick-item"><label>' +
                    '<input type="checkbox" class="rm-material-checkbox" data-name="' + esc + '" data-unit="' + material.unit + '">' +
                    '<span><strong>' + material.name + '</strong><br><span style="color:#666;">' + material.unit + '</span></span>' +
                    '</label></TAG>';
            });
        });
        list.innerHTML = html.replace(/TAG/g, 'div');
    }

    function initAddEditModals() {
        const tab = document.getElementById('rawMaterialsTab');
        const addBtn = document.getElementById('rmAddMaterialBtn');
        if (addBtn) addBtn.addEventListener('click', function () { openModal('rmAddMaterialModal'); });

        wireClose(['rmCloseAddMaterial', 'rmCancelAddMaterial'], 'rmAddMaterialModal');

        if (tab && !tab.getAttribute('data-rm-edit-delegation')) {
            tab.setAttribute('data-rm-edit-delegation', '1');
            tab.addEventListener('click', function (e) {
                const btn = e.target.closest('.edit-raw-material-btn');
                if (!btn) return;
                document.getElementById('rmEditMaterialID').value = btn.getAttribute('data-id');
                const skuEl = document.getElementById('rmEditSku');
                if (skuEl) skuEl.value = btn.getAttribute('data-sku') || '';
                document.getElementById('rmEditMaterialName').value = btn.getAttribute('data-name');
                document.getElementById('rmEditQuantity').value = btn.getAttribute('data-quantity');
                document.getElementById('rmEditUnit').value = btn.getAttribute('data-unit');
                const supplierEl = document.getElementById('rmEditSupplier');
                if (supplierEl) supplierEl.value = btn.getAttribute('data-supplier') || '';
                openModal('rmEditMaterialModal');
            });
        }

        wireClose(['rmCloseEditMaterial', 'rmCancelEditMaterial'], 'rmEditMaterialModal');

    }

    function initQuickAdd() {
        const quickBtn = document.getElementById('rmQuickAddBtn');
        const submitBtn = document.getElementById('rmSubmitQuickAdd');
        if (!quickBtn || !submitBtn) return;

        quickBtn.addEventListener('click', function () {
            populateCommonMaterials();
            openModal('rmQuickAddModal');
        });

        wireClose(['rmCloseQuickAdd', 'rmCancelQuickAdd'], 'rmQuickAddModal');

        submitBtn.addEventListener('click', async function () {
            const checked = document.querySelectorAll('.rm-material-checkbox:checked');
            if (!checked.length) {
                popup('Select at least one material.', true);
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Adding…';
            let ok = 0;
            let fail = 0;

            for (const cb of checked) {
                const formData = new URLSearchParams();
                formData.append('name', cb.getAttribute('data-name'));
                formData.append('quantity', '0');
                formData.append('unit', cb.getAttribute('data-unit'));
                formData.append('redirectTab', 'raw-materials');
                try {
                    const res = await fetch('/Employee/InventoryManager/RawMaterials/Add', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        credentials: 'include',
                        body: formData
                    });
                    if (res.ok || res.redirected) ok++;
                    else fail++;
                } catch (e) {
                    fail++;
                }
            }

            submitBtn.disabled = false;
            submitBtn.textContent = 'Add Selected';

            if (ok > 0) {
                const refreshed = await refreshRawMaterialsTable();
                popup('Added ' + ok + ' material(s).' + (fail ? ' ' + fail + ' skipped (may already exist).' : '') + (refreshed ? '' : ' Refresh page if list did not update.'));
                closeModal('rmQuickAddModal');
            } else {
                popup('No materials were added. They may already exist.', true);
            }
        });
    }

    async function loadUnits() {
        const unitsList = document.getElementById('rmUnitsList');
        if (!unitsList) return;
        try {
            const res = await fetch('/api/admin/measurement-units', { credentials: 'include' });
            const data = await res.json();
            if (data.success && data.units && data.units.length) {
                unitsList.innerHTML = data.units.map(function (unit) {
                    const safeName = (unit.UnitName || '').replace(/'/g, "\\'");
                    return '<div class="rm-unit-row"><span>' + unit.UnitName + '</span>' +
                        '<button type="button" class="rm-btn" style="background:#dc3545;color:#fff;padding:4px 10px;" data-unit-id="' + unit.UnitID + '" data-unit-name="' + safeName + '">Delete</button></div>';
                }).join('');
                unitsList.querySelectorAll('button[data-unit-id]').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        deleteUnit(parseInt(btn.getAttribute('data-unit-id'), 10), btn.getAttribute('data-unit-name'));
                    });
                });
            } else {
                unitsList.innerHTML = '<p style="color:#888;font-size:0.85em;">No units yet. Add one above.</p>';
            }
        } catch (err) {
            unitsList.innerHTML = '<p style="color:#c00;">Failed to load units.</p>';
        }
    }

    async function deleteUnit(unitId, unitName) {
        if (!confirm('Delete unit "' + unitName + '"?')) return;
        try {
            const res = await fetch('/api/admin/measurement-units/' + unitId, {
                method: 'DELETE',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await res.json();
            if (data.success) {
                popup(data.message || 'Unit deleted.');
                loadUnits();
            } else {
                popup(data.message || 'Failed to delete unit.', true);
            }
        } catch (e) {
            popup('Error deleting unit.', true);
        }
    }

    function initManageUnits() {
        const manageBtn = document.getElementById('rmManageUnitsBtn');
        const addUnitBtn = document.getElementById('rmAddUnitBtn');
        const newUnitInput = document.getElementById('rmNewUnitName');
        if (!manageBtn) return;

        manageBtn.addEventListener('click', function () {
            loadUnits();
            openModal('rmManageUnitsModal');
        });

        wireClose(['rmCloseManageUnits', 'rmCloseManageUnitsBtn'], 'rmManageUnitsModal');

        if (addUnitBtn && newUnitInput) {
            addUnitBtn.addEventListener('click', async function () {
                const unitName = newUnitInput.value.trim();
                if (!unitName) {
                    popup('Enter a unit name.', true);
                    return;
                }
                addUnitBtn.disabled = true;
                try {
                    const res = await fetch('/api/admin/measurement-units', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ unitName: unitName })
                    });
                    const data = await res.json();
                    if (data.success) {
                        popup('Unit added.');
                        newUnitInput.value = '';
                        loadUnits();
                    } else {
                        popup(data.message || 'Failed to add unit.', true);
                    }
                } catch (e) {
                    popup('Error adding unit.', true);
                }
                addUnitBtn.disabled = false;
            });
        }
    }

    function initRawMaterialFormsRealtime() {
        const addForm = document.querySelector('#rmAddMaterialModal form[action="/Employee/InventoryManager/RawMaterials/Add"]');
        if (addForm && !addForm.getAttribute('data-rm-realtime')) {
            addForm.setAttribute('data-rm-realtime', '1');
            addForm.addEventListener('submit', async function (e) {
                e.preventDefault();
                const submitBtn = addForm.querySelector('button[type="submit"]');
                if (submitBtn) submitBtn.disabled = true;
                try {
                    const formData = new URLSearchParams(new FormData(addForm));
                    const res = await fetch('/Employee/InventoryManager/RawMaterials/Add', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        credentials: 'include',
                        body: formData
                    });
                    if (!res.ok) throw new Error('Add request failed');
                    const refreshed = await refreshRawMaterialsTable();
                    popup('Raw material added.' + (refreshed ? '' : ' Refresh page if list did not update.'));
                    addForm.reset();
                    closeModal('rmAddMaterialModal');
                } catch (err) {
                    popup('Failed to add raw material.', true);
                } finally {
                    if (submitBtn) submitBtn.disabled = false;
                }
            });
        }

        const editForm = document.getElementById('rmEditMaterialForm');
        if (editForm && !editForm.getAttribute('data-rm-realtime')) {
            editForm.setAttribute('data-rm-realtime', '1');
            editForm.addEventListener('submit', async function (e) {
                e.preventDefault();
                const submitBtn = editForm.querySelector('button[type="submit"]');
                if (submitBtn) submitBtn.disabled = true;
                try {
                    const formData = new URLSearchParams(new FormData(editForm));
                    const res = await fetch('/Employee/InventoryManager/RawMaterials/Edit', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        credentials: 'include',
                        body: formData
                    });
                    if (!res.ok) throw new Error('Edit request failed');
                    const refreshed = await refreshRawMaterialsTable();
                    popup('Raw material updated.' + (refreshed ? '' : ' Refresh page if list did not update.'));
                    closeModal('rmEditMaterialModal');
                } catch (err) {
                    popup('Failed to update raw material.', true);
                } finally {
                    if (submitBtn) submitBtn.disabled = false;
                }
            });
        }
    }

    function stockQtyClassFor(n) {
        const num = Number(n) || 0;
        if (num < 0) return 'stock-qty-negative';
        if (num === 0) return 'stock-qty-out';
        if (num <= 10) return 'stock-qty-critical';
        if (num <= 20) return 'stock-qty-low';
        return 'stock-qty-normal';
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatUpdatedDate(value) {
        if (!value) return '—';
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '—';
        return d.toLocaleDateString();
    }

    function normalizeMaterial(item) {
        return {
            id: item && (item.id != null ? item.id : item.MaterialID),
            sku: item && (item.sku != null ? item.sku : item.SKU),
            name: item && (item.name != null ? item.name : item.Name),
            stockQuantity: Number(item && (item.stockQuantity != null ? item.stockQuantity : item.QuantityAvailable)) || 0,
            unit: item && (item.unit != null ? item.unit : item.Unit),
            supplier: item && (item.supplier != null ? item.supplier : item.Supplier),
            createdAt: item && (item.createdAt != null ? item.createdAt : item.LastUpdated)
        };
    }

    function renderRawMaterialsTable(materials) {
        const tab = document.getElementById('rawMaterialsTab');
        if (!tab) return;
        const content = tab.querySelector('.content-area');
        if (!content) return;

        const oldTable = document.getElementById('rawMaterialsTable');
        if (oldTable) {
            oldTable.remove();
        } else {
            const oldEmpty = content.querySelector('[data-rm-empty-state="1"]');
            if (oldEmpty) oldEmpty.remove();
        }

        if (!materials || !materials.length) {
            const empty = document.createElement('p');
            empty.setAttribute('data-rm-empty-state', '1');
            empty.style.cssText = 'color:#666;font-size:0.9em;';
            empty.innerHTML = 'No raw materials yet. Use <strong>Quick Add Common</strong> or <strong>Add Material</strong>.';
            content.appendChild(empty);
            return;
        }

        const table = document.createElement('table');
        table.id = 'rawMaterialsTable';
        table.innerHTML =
            '<thead><tr>' +
            '<th>SKU</th><th>Name</th><th class="qty-col">Qty</th><th>Unit</th><th>Supplier</th><th>Updated</th><th class="pi-actions-col">Actions</th>' +
            '</tr></thead><tbody></tbody>';
        const tbody = table.querySelector('tbody');

        materials.forEach(function (rawItem) {
            const item = normalizeMaterial(rawItem);
            const tr = document.createElement('tr');
            tr.setAttribute('data-material-id', String(item.id));
            tr.innerHTML =
                '<td><code style="font-size:0.85em;">' + escapeHtml(item.sku || '—') + '</code></td>' +
                '<td>' + escapeHtml(item.name || '') + '</td>' +
                '<td class="qty-col"><span class="stock-qty rm-qty-display ' + stockQtyClassFor(item.stockQuantity) + '" data-material-id="' + escapeHtml(item.id) + '">' + escapeHtml(item.stockQuantity) + '</span></td>' +
                '<td>' + escapeHtml(item.unit || '') + '</td>' +
                '<td>' + escapeHtml(item.supplier || '—') + '</td>' +
                '<td class="rm-updated-cell">' + escapeHtml(formatUpdatedDate(item.createdAt)) + '</td>' +
                '<td class="pi-actions-col">' +
                '<div class="pi-actions-cell">' +
                '<button type="button" class="restock-raw-material-btn pi-icon-restock-btn" data-material-id="' + escapeHtml(item.id) + '" data-material-name="' + escapeHtml(item.name || 'Material') + '" data-quantity="' + escapeHtml(item.stockQuantity) + '" data-unit="' + escapeHtml(item.unit || '') + '" title="Restock" aria-label="Restock">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>' +
                '</button>' +
                '<button type="button" class="edit-raw-material-btn pi-icon-edit-btn" title="Edit" aria-label="Edit" data-id="' + escapeHtml(item.id) + '" data-sku="' + escapeHtml(item.sku || '') + '" data-name="' + escapeHtml(item.name || '') + '" data-quantity="' + escapeHtml(item.stockQuantity) + '" data-unit="' + escapeHtml(item.unit || '') + '" data-supplier="' + escapeHtml(item.supplier || '') + '">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>' +
                '</button>' +
                '<button type="button" class="archive-material-btn pi-icon-archive-btn" title="Archive" aria-label="Archive" data-id="' + escapeHtml(item.id) + '" data-name="' + escapeHtml(item.name || '') + '">' +
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"/></svg>' +
                '</button>' +
                '</div>' +
                '</td>';
            tbody.appendChild(tr);
        });

        content.appendChild(table);
        if (typeof window.piEnhanceActionsCells === 'function') {
            window.piEnhanceActionsCells(table);
        }
    }

    async function refreshRawMaterialsTable() {
        try {
            const res = await fetch('/api/rawmaterials?_=' + Date.now(), {
                credentials: 'include',
                headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }
            });
            const data = await res.json();
            if (data && data.success && Array.isArray(data.materials)) {
                renderRawMaterialsTable(data.materials);
                syncGlobalRawMaterialsCache(data.materials);
                return data.materials;
            }
        } catch (err) {
            console.error('Failed to refresh raw materials table:', err);
        }
        return null;
    }

    window.refreshRawMaterialsTable = refreshRawMaterialsTable;

    function updateMaterialQtyDisplay(materialId, newQty, updatedAt) {
        const mid = String(materialId);
        const n = Number(newQty) || 0;
        const qtyClass = 'stock-qty rm-qty-display ' + stockQtyClassFor(n);

        document.querySelectorAll('#rawMaterialsTab tr[data-material-id="' + mid + '"] .rm-qty-display, #rawMaterialsTab tr[data-material-id="' + mid + '"] td.qty-col .stock-qty').forEach(function (span) {
            span.textContent = String(n);
            span.className = qtyClass;
            span.classList.add('rm-qty-updated');
            window.setTimeout(function () { span.classList.remove('rm-qty-updated'); }, 1200);
        });

        document.querySelectorAll('#rawMaterialsTab .restock-raw-material-btn[data-material-id="' + mid + '"]').forEach(function (btn) {
            btn.setAttribute('data-quantity', String(n));
        });
        document.querySelectorAll('#rawMaterialsTab .edit-raw-material-btn[data-id="' + mid + '"]').forEach(function (btn) {
            btn.setAttribute('data-quantity', String(n));
        });

        if (updatedAt) {
            const updatedText = formatUpdatedDate(updatedAt);
            document.querySelectorAll('#rawMaterialsTab tr[data-material-id="' + mid + '"] .rm-updated-cell').forEach(function (cell) {
                cell.textContent = updatedText;
            });
        }

        const currentQtyEl = document.getElementById('rawMaterialRestockCurrentQty');
        const restockIdEl = document.getElementById('rawMaterialRestockId');
        if (currentQtyEl && restockIdEl && String(restockIdEl.value) === mid) {
            currentQtyEl.textContent = String(n);
        }
    }

    function syncGlobalRawMaterialsCache(materials) {
        if (!Array.isArray(materials)) return;
        if (typeof window.updateRawMaterialsTableFromList === 'function') {
            window.updateRawMaterialsTableFromList(materials);
        }
        document.dispatchEvent(new CustomEvent('rawMaterialsListRefreshed', { detail: { materials: materials } }));
    }

    function initRestock() {
        const tab = document.getElementById('rawMaterialsTab');
        const modal = document.getElementById('rawMaterialRestockModal');
        const qtyInput = document.getElementById('rawMaterialRestockQty');
        const continueBtn = document.getElementById('rmConfirmRestock');
        const confirmModal = document.getElementById('rawMaterialRestockConfirmModal');
        const confirmText = document.getElementById('rawMaterialRestockConfirmText');
        const cancelConfirmBtn = document.getElementById('rmCancelRestockConfirm');
        const finalConfirmBtn = document.getElementById('rmConfirmRestockFinal');
        if (!tab || !modal || !continueBtn) return;

        function closeRestockModal() {
            closeModal('rawMaterialRestockModal');
            if (qtyInput) qtyInput.value = '1';
        }

        function closeConfirmModal() {
            if (confirmModal) confirmModal.classList.remove('show');
        }

        wireClose(['rmCloseRestockModal', 'rmCancelRestock'], 'rawMaterialRestockModal');
        if (cancelConfirmBtn && !cancelConfirmBtn.getAttribute('data-listener-attached')) {
            cancelConfirmBtn.setAttribute('data-listener-attached', '1');
            cancelConfirmBtn.addEventListener('click', function () {
                closeConfirmModal();
                openModal('rawMaterialRestockModal');
            });
        }

        if (!tab.getAttribute('data-restock-delegation')) {
            tab.setAttribute('data-restock-delegation', '1');
            tab.addEventListener('click', function (e) {
                const btn = e.target.closest('.restock-raw-material-btn');
                if (!btn) return;
                const materialId = btn.getAttribute('data-material-id');
                const name = btn.getAttribute('data-material-name') || 'Material';
                const qty = parseInt(btn.getAttribute('data-quantity'), 10) || 0;
                const unit = btn.getAttribute('data-unit') || '';
                document.getElementById('rawMaterialRestockId').value = materialId;
                document.getElementById('rawMaterialRestockName').textContent = name;
                document.getElementById('rawMaterialRestockCurrentQty').textContent = String(qty);
                const unitEl = document.getElementById('rawMaterialRestockUnit');
                if (unitEl) unitEl.textContent = unit ? ' ' + unit : '';
                if (qtyInput) qtyInput.value = '1';
                openModal('rawMaterialRestockModal');
            });
        }

        if (!continueBtn.getAttribute('data-listener-attached')) {
        continueBtn.setAttribute('data-listener-attached', '1');

        continueBtn.addEventListener('click', function () {
            const materialId = document.getElementById('rawMaterialRestockId').value;
            const materialName = document.getElementById('rawMaterialRestockName').textContent || 'Material';
            const quantityToAdd = parseInt(qtyInput && qtyInput.value, 10);
            if (!materialId) {
                popup('Missing material ID.', true);
                return;
            }
            if (!quantityToAdd || quantityToAdd < 1) {
                popup('Enter a quantity of at least 1.', true);
                return;
            }
            if (confirmModal && confirmText) {
                confirmText.textContent = 'Add ' + quantityToAdd + ' to "' + materialName + '"?';
                closeModal('rawMaterialRestockModal');
                confirmModal.classList.add('show');
                return;
            }
            if (window.confirm('Add ' + quantityToAdd + ' to "' + materialName + '"?')) {
                performRawMaterialRestock(materialId, quantityToAdd, closeRestockModal);
            }
        });
        }

        if (finalConfirmBtn && !finalConfirmBtn.getAttribute('data-final-attached')) {
        finalConfirmBtn.setAttribute('data-final-attached', '1');

        finalConfirmBtn.addEventListener('click', async function () {
            const materialId = document.getElementById('rawMaterialRestockId').value;
            const quantityToAdd = parseInt(qtyInput && qtyInput.value, 10);
            closeConfirmModal();
            await performRawMaterialRestock(materialId, quantityToAdd, closeRestockModal);
        });
        }
    }

    async function performRawMaterialRestock(materialId, quantityToAdd, onSuccessClose) {
        const finalConfirmBtn = document.getElementById('rmConfirmRestockFinal');
        const continueBtn = document.getElementById('rmConfirmRestock');
        const btn = finalConfirmBtn || continueBtn;
        if (!materialId || !quantityToAdd || quantityToAdd < 1) return;
        if (btn) btn.disabled = true;
        try {
            const res = await fetch('/api/admin/raw-materials/' + materialId + '/restock', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quantityToAdd: quantityToAdd })
            });
            let data = {};
            try {
                data = await res.json();
            } catch (parseErr) {
                data = {};
            }
            if (data.success) {
                const newQty = data.quantityAvailable != null ? data.quantityAvailable : data.newQuantity;
                const updatedAt = data.lastUpdated || new Date().toISOString();
                updateMaterialQtyDisplay(materialId, newQty, updatedAt);
                const refreshedMaterials = await refreshRawMaterialsTable();
                if (Array.isArray(refreshedMaterials)) {
                    const match = refreshedMaterials.find(function (m) {
                        return String(normalizeMaterial(m).id) === String(materialId);
                    });
                    if (match) {
                        const normalized = normalizeMaterial(match);
                        updateMaterialQtyDisplay(materialId, normalized.stockQuantity, normalized.createdAt);
                    }
                }
                popup(data.message || 'Stock updated.');
                if (typeof window.loadStockMovementHistory === 'function') {
                    window.loadStockMovementHistory();
                }
                document.dispatchEvent(new CustomEvent('rawMaterialRestocked', {
                    detail: {
                        materialId: materialId,
                        quantityAvailable: newQty,
                        materials: Array.isArray(refreshedMaterials) ? refreshedMaterials : null
                    }
                }));
                if (onSuccessClose) onSuccessClose();
            } else {
                popup(data.message || 'Failed to restock.', true);
            }
        } catch (e) {
            popup('Failed to restock material.', true);
        }
        if (btn) btn.disabled = false;
    }

    function removeMaterialRow(materialId) {
        const row = document.querySelector('#rawMaterialsTable tr[data-material-id="' + materialId + '"]');
        if (row) row.remove();
        const tbody = document.querySelector('#rawMaterialsTable tbody');
        if (tbody && !tbody.querySelector('tr')) {
            const table = document.getElementById('rawMaterialsTable');
            if (table) {
                const empty = document.createElement('p');
                empty.style.cssText = 'color:#666;font-size:0.9em;';
                empty.innerHTML = 'No raw materials yet. Use <strong>Quick Add Common</strong> or <strong>Add Material</strong>.';
                table.replaceWith(empty);
            }
        }
        document.dispatchEvent(new CustomEvent('rawMaterialArchived', { detail: { materialId: materialId } }));
    }

    function initArchiveButtons() {
        const tab = document.getElementById('rawMaterialsTab');
        if (!tab || tab.getAttribute('data-rm-archive-delegation')) return;
        tab.setAttribute('data-rm-archive-delegation', '1');
        tab.addEventListener('click', function (e) {
            const btn = e.target.closest('.archive-material-btn');
            if (!btn) return;
            const materialId = btn.getAttribute('data-id');
            const materialName = btn.getAttribute('data-name') || 'this material';
            if (!materialId) return;

            const runArchive = async function () {
                btn.disabled = true;
                try {
                    const res = await fetch('/api/rawmaterials/' + materialId, {
                        method: 'DELETE',
                        credentials: 'include'
                    });
                    const data = await res.json();
                    if (data.success) {
                        await refreshRawMaterialsTable();
                        popup('"' + materialName + '" archived. Restore it from the Archived page.');
                    } else {
                        popup(data.message || 'Failed to archive material.', true);
                        btn.disabled = false;
                    }
                } catch (err) {
                    popup('Failed to archive material.', true);
                    btn.disabled = false;
                }
            };

            if (typeof window.showArchiveConfirmModal === 'function') {
                window.showArchiveConfirmModal(materialName, runArchive);
            } else if (window.confirm('Archive raw material "' + materialName + '"? You can restore it from Archived.')) {
                runArchive();
            }
        });
    }

    function focusRawMaterialFromUrl() {
        const materialId = new URLSearchParams(window.location.search).get('materialId');
        if (!materialId) return;
        const row = document.querySelector('#rawMaterialsTable tr[data-material-id="' + materialId + '"]');
        if (!row) return;
        row.classList.add('inventory-focus-row');
        row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    function init() {
        if (!document.getElementById('rawMaterialsTab')) return;
        initAddEditModals();
        initRawMaterialFormsRealtime();
        initQuickAdd();
        initManageUnits();
        initArchiveButtons();
        initRestock();
        focusRawMaterialFromUrl();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
