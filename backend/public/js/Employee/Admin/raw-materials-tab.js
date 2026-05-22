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
        const addBtn = document.getElementById('rmAddMaterialBtn');
        if (addBtn) addBtn.addEventListener('click', function () { openModal('rmAddMaterialModal'); });

        wireClose(['rmCloseAddMaterial', 'rmCancelAddMaterial'], 'rmAddMaterialModal');

        document.querySelectorAll('#rawMaterialsTab .edit-material-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
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
        });

        wireClose(['rmCloseEditMaterial', 'rmCancelEditMaterial'], 'rmEditMaterialModal');

        ['rmAddMaterialModal', 'rmEditMaterialModal', 'rmQuickAddModal', 'rmManageUnitsModal'].forEach(function (modalId) {
            const modal = document.getElementById(modalId);
            if (!modal) return;
            modal.addEventListener('click', function (e) {
                if (e.target === modal) closeModal(modalId);
            });
        });
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
                    const res = await fetch('/Employee/Admin/RawMaterials/Add', {
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
                popup('Added ' + ok + ' material(s).' + (fail ? ' ' + fail + ' skipped (may already exist).' : ''));
                setTimeout(function () {
                    window.location.href = '/Employee/Admin/ProductInventory?tab=raw-materials';
                }, 800);
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
        document.querySelectorAll('#rawMaterialsTab .archive-material-btn').forEach(function (btn) {
            btn.addEventListener('click', async function () {
                const materialId = btn.getAttribute('data-id');
                const materialName = btn.getAttribute('data-name') || 'this material';
                if (!materialId) return;
                if (!confirm('Archive raw material "' + materialName + '"? You can restore it from Archived.')) return;

                btn.disabled = true;
                try {
                    const res = await fetch('/api/rawmaterials/' + materialId, {
                        method: 'DELETE',
                        credentials: 'include'
                    });
                    const data = await res.json();
                    if (data.success) {
                        popup('"' + materialName + '" archived. Restore it from the Archived page.');
                        removeMaterialRow(materialId);
                    } else {
                        popup(data.message || 'Failed to archive material.', true);
                        btn.disabled = false;
                    }
                } catch (e) {
                    popup('Failed to archive material.', true);
                    btn.disabled = false;
                }
            });
        });
    }

    function init() {
        if (!document.getElementById('rawMaterialsTab')) return;
        initAddEditModals();
        initQuickAdd();
        initManageUnits();
        initArchiveButtons();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
