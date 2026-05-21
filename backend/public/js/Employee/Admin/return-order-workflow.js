/**
 * Admin returned-order workflow: receiving proceed, item inspection, inventory split.
 */
(function () {
    'use strict';

    let inspectOrderId = null;
    let inspectItems = [];
    let selectedInspectIndex = 0;

    function showInspectError(msg) {
        const el = document.getElementById('returnInspectError');
        if (!el) return;
        if (msg) {
            el.textContent = msg;
            el.style.display = 'block';
        } else {
            el.textContent = '';
            el.style.display = 'none';
        }
    }

    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getInspectSelections() {
        const rows = document.querySelectorAll('#returnInspectVariants .return-inspect-variant');
        const items = [];
        rows.forEach(function (row) {
            const idx = parseInt(row.getAttribute('data-index'), 10);
            const base = inspectItems[idx];
            if (!base) return;
            const damagedInput = row.querySelector('.inspect-damaged-qty');
            const wrongInput = row.querySelector('.inspect-wrong-qty');
            items.push({
                productId: base.productId,
                variationId: base.variationId,
                quantity: base.quantity,
                damagedQty: parseInt(damagedInput?.value, 10) || 0,
                wrongItemQty: parseInt(wrongInput?.value, 10) || 0
            });
        });
        return items;
    }

    function validateInspectSelections(items) {
        if (!items.length) {
            return 'No returned items to inspect.';
        }
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (it.damagedQty + it.wrongItemQty !== it.quantity) {
                return 'For each variant, damaged + wrong item must equal returned quantity (' + it.quantity + ').';
            }
        }
        return null;
    }

    function renderInspectHero(item) {
        const hero = document.getElementById('returnInspectHero');
        if (!hero || !item) return;
        const imgSrc = item.imageUrl || '/images/placeholder-no-image.svg';
        const variantLabel = [item.variationName, item.color].filter(Boolean).join(' · ') || 'Standard';
        hero.innerHTML =
            '<img src="' + escapeHtml(imgSrc) + '" alt="" onerror="this.src=\'/images/placeholder-no-image.svg\'">' +
            '<div style="flex:1;min-width:200px;">' +
            '<h4 style="margin:0 0 8px;">' + escapeHtml(item.name) + '</h4>' +
            '<p style="margin:0;color:#64748b;">Variant: <strong>' + escapeHtml(variantLabel) + '</strong></p>' +
            (item.sku ? '<p style="margin:6px 0 0;color:#64748b;">SKU: <code>' + escapeHtml(item.sku) + '</code></p>' : '') +
            '<p style="margin:8px 0 0;">Returned quantity: <strong>' + item.quantity + '</strong></p>' +
            '</div>';
    }

    function renderInspectVariants() {
        const container = document.getElementById('returnInspectVariants');
        if (!container) return;
        if (!inspectItems.length) {
            container.innerHTML = '<p style="color:#888;">No return line items found.</p>';
            return;
        }
        container.innerHTML = inspectItems.map(function (item, index) {
            const variantLabel = [item.variationName, item.color].filter(Boolean).join(' · ') || 'Default';
            const selected = index === selectedInspectIndex ? ' selected' : '';
            return (
                '<div class="return-inspect-variant' + selected + '" data-index="' + index + '">' +
                '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">' +
                '<div><strong>' + escapeHtml(variantLabel) + '</strong>' +
                (item.sku ? ' <code style="font-size:0.85em;">' + escapeHtml(item.sku) + '</code>' : '') +
                '<div style="font-size:0.85em;color:#64748b;margin-top:4px;">Returned: ' + item.quantity + ' unit(s)</div></div>' +
                '<button type="button" class="btn-action" style="background:#6366f1;color:#fff;padding:4px 10px;font-size:0.8em;" onclick="selectInspectVariant(' + index + ')">View</button>' +
                '</div>' +
                '<div class="return-inspect-qty-row">' +
                '<div><label>Damaged qty</label><input type="number" class="inspect-damaged-qty" min="0" max="' + item.quantity + '" value="0" data-index="' + index + '"></div>' +
                '<div><label>Wrong item qty</label><input type="number" class="inspect-wrong-qty" min="0" max="' + item.quantity + '" value="0" data-index="' + index + '"></div>' +
                '<div style="display:flex;gap:6px;align-items:flex-end;padding-bottom:2px;">' +
                '<button type="button" class="btn-inspect-damaged" onclick="setInspectVariantDisposition(' + index + ', \'damaged\')">All Damaged</button>' +
                '<button type="button" class="btn-inspect-wrong" onclick="setInspectVariantDisposition(' + index + ', \'wrong\')">All Wrong Item</button>' +
                '</div></div></div>'
            );
        }).join('');

        container.querySelectorAll('.inspect-damaged-qty, .inspect-wrong-qty').forEach(function (input) {
            input.addEventListener('input', function () {
                const row = input.closest('.return-inspect-variant');
                const idx = parseInt(row?.getAttribute('data-index'), 10);
                if (!isNaN(idx)) syncInspectQtyPair(idx);
                showInspectError('');
            });
        });
    }

    window.selectInspectVariant = function (index) {
        selectedInspectIndex = index;
        document.querySelectorAll('#returnInspectVariants .return-inspect-variant').forEach(function (el, i) {
            el.classList.toggle('selected', i === index);
        });
        if (inspectItems[index]) renderInspectHero(inspectItems[index]);
    };

    window.setInspectVariantDisposition = function (index, type) {
        const item = inspectItems[index];
        if (!item) return;
        const row = document.querySelector('#returnInspectVariants .return-inspect-variant[data-index="' + index + '"]');
        if (!row) return;
        const damagedInput = row.querySelector('.inspect-damaged-qty');
        const wrongInput = row.querySelector('.inspect-wrong-qty');
        if (type === 'damaged') {
            if (damagedInput) damagedInput.value = String(item.quantity);
            if (wrongInput) wrongInput.value = '0';
        } else {
            if (damagedInput) damagedInput.value = '0';
            if (wrongInput) wrongInput.value = String(item.quantity);
        }
        selectInspectVariant(index);
        showInspectError('');
    };

    function syncInspectQtyPair(index) {
        const item = inspectItems[index];
        const row = document.querySelector('#returnInspectVariants .return-inspect-variant[data-index="' + index + '"]');
        if (!item || !row) return;
        const damagedInput = row.querySelector('.inspect-damaged-qty');
        const wrongInput = row.querySelector('.inspect-wrong-qty');
        let d = parseInt(damagedInput?.value, 10) || 0;
        let w = parseInt(wrongInput?.value, 10) || 0;
        if (d + w > item.quantity) {
            if (document.activeElement === damagedInput) {
                w = Math.max(0, item.quantity - d);
                if (wrongInput) wrongInput.value = String(w);
            } else {
                d = Math.max(0, item.quantity - w);
                if (damagedInput) damagedInput.value = String(d);
            }
        }
    }

    window.openReturnInspectModal = async function (orderId) {
        inspectOrderId = orderId;
        inspectItems = [];
        selectedInspectIndex = 0;
        showInspectError('');
        const modal = document.getElementById('returnInspectModal');
        const hero = document.getElementById('returnInspectHero');
        const variants = document.getElementById('returnInspectVariants');
        if (hero) hero.innerHTML = '<p style="color:#888;">Loading…</p>';
        if (variants) variants.innerHTML = '';
        if (modal) modal.classList.add('show');

        try {
            const response = await fetch('/api/admin/orders/' + orderId + '/return/inspect-items', {
                credentials: 'include'
            });
            const result = await response.json();
            if (!result.success || !result.items || !result.items.length) {
                showInspectError(result.message || 'Could not load return items.');
                return;
            }
            inspectItems = result.items;
            renderInspectVariants();
            selectInspectVariant(0);
        } catch (err) {
            console.error(err);
            showInspectError('Failed to load return items.');
        }
    };

    window.closeReturnInspectModal = function () {
        const modal = document.getElementById('returnInspectModal');
        if (modal) modal.classList.remove('show');
        inspectOrderId = null;
        inspectItems = [];
        showInspectError('');
    };

    window.confirmReturnInspectProceed = async function () {
        if (!inspectOrderId) return;
        const selections = getInspectSelections();
        const validationError = validateInspectSelections(selections);
        if (validationError) {
            showInspectError(validationError);
            return;
        }
        if (!confirm('Apply inspection results to inventory? Damaged units go to damaged stock; wrong items are restored to available.')) {
            return;
        }
        const btn = document.getElementById('returnInspectProceedBtn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Saving…';
        }
        try {
            const response = await fetch('/api/admin/orders/' + inspectOrderId + '/return/inspect-complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ items: selections })
            });
            const result = await response.json();
            if (result.success) {
                closeReturnInspectModal();
                if (typeof showSuccessModal === 'function') {
                    showSuccessModal(result.message || 'Inspection saved.', '', 'approve');
                    setTimeout(function () { window.location.reload(); }, 1200);
                } else {
                    alert(result.message || 'Inspection saved.');
                    window.location.reload();
                }
            } else {
                showInspectError(result.message || 'Failed to save inspection.');
            }
        } catch (err) {
            console.error(err);
            showInspectError('Failed to save inspection. Please try again.');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Proceed';
            }
        }
    };

    window.confirmReturnReceivingProceed = async function (orderId) {
        if (!orderId) return;
        if (!confirm('Mark returned items as received and proceed to inspection?')) return;
        try {
            const response = await fetch('/api/admin/orders/' + orderId + '/return/receiving-proceed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });
            const result = await response.json();
            if (result.success) {
                if (typeof showSuccessModal === 'function') {
                    showSuccessModal(result.message || 'Ready for inspection.', '', 'approve');
                    setTimeout(function () { window.location.reload(); }, 1200);
                } else {
                    alert(result.message || 'Ready for inspection.');
                    window.location.reload();
                }
            } else {
                alert(result.message || 'Failed to update status.');
            }
        } catch (err) {
            console.error(err);
            alert('Failed to update status. Please try again.');
        }
    };

    document.addEventListener('click', function (e) {
        const modal = document.getElementById('returnInspectModal');
        if (modal && e.target === modal) closeReturnInspectModal();
    });
})();
