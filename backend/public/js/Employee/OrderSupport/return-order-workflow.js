/**

 * Admin returned-order workflow: receiving proceed, item inspection, inventory split.

 */

(function () {

    'use strict';



    let inspectOrderId = null;

    let inspectItems = [];

    let selectedInspectIndex = 0;

    let inspectReturnType = '';

    let inspectReturnReason = '';

    let pendingReceiveOrderId = null;

    let pendingPickupOrderId = null;
    let pendingPickupActionType = '';
    let pendingInspectStartOrderId = null;



    function returnReasonTypeLabel(type) {

        const t = String(type || '').toLowerCase().trim();

        if (t === 'damage') return 'Damaged Item';

        if (t === 'wrong_item') return 'Wrong Item';

        if (t === 'mixed') return 'Mixed Reason Type';

        if (t === 'other') return 'Other Reason';

        return type || '—';

    }



    function renderInspectCustomerReason() {

        const box = document.getElementById('returnInspectCustomerReason');

        if (!box) return;

        if (!inspectReturnType && !inspectReturnReason) {

            box.style.display = 'none';

            box.innerHTML = '';

            return;

        }

        const typeLabel = returnReasonTypeLabel(inspectReturnType);

        const reasonText = stripInspectReturnReason(inspectReturnReason);

        const details = reasonText

            ? '<div style="margin-top:6px;color:#334155;"><strong>Details:</strong> ' + escapeHtml(reasonText) + '</div>'

            : '';

        box.innerHTML =

            '<div><strong>Return reason type:</strong> ' + escapeHtml(typeLabel) + '</div>' + details;

        box.style.display = 'block';

    }



    function inspectReturnTypeNorm() {
        return String(inspectReturnType || '').toLowerCase().trim();
    }

    function isWrongItemReturnType() {
        return inspectReturnTypeNorm() === 'wrong_item';
    }

    function isDamageReturnType() {
        const t = inspectReturnTypeNorm();
        return t === 'damage' || t === 'damaged';
    }

    function isMixedReturnType() {
        return inspectReturnTypeNorm() === 'mixed';
    }

    function updateInspectHintText() {
        const hint = document.getElementById('returnInspectHint');
        if (!hint) return;
        if (isMixedReturnType()) {
            hint.innerHTML = 'Mixed return: enter <strong>Damaged</strong>, <strong>Bad item</strong>, and <strong>Good item</strong> quantities. Damaged and bad units go to damaged stock; good units restock to available.';
        } else if (isWrongItemReturnType()) {
            hint.innerHTML = 'Wrong item return: classify each unit as <strong>Good Item</strong> (restock to available) or <strong>Bad Item</strong> (damaged stock). Totals must match returned quantity.';
        } else if (isDamageReturnType()) {
            hint.innerHTML = 'Damaged item return: mark units as <strong>Damaged</strong>. They will go to damaged stock on Product Returns.';
        } else {
            hint.innerHTML = 'Enter how many units are damaged vs good (restock). Totals must match returned quantity.';
        }
    }

    function prefillInspectFromCustomerReason() {
        if (isWrongItemReturnType()) {
            inspectItems.forEach(function (item, index) {
                setInspectVariantDisposition(index, 'good');
            });
        } else if (isDamageReturnType()) {
            inspectItems.forEach(function (item, index) {
                setInspectVariantDisposition(index, 'damaged');
            });
        }
    }



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



    function stripInspectReturnReason(reason) {
        const s = String(reason || '').trim();
        if (s.startsWith('[PRE_RECEIVE]')) {
            return s.slice('[PRE_RECEIVE]'.length).trim();
        }
        return s;
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

            const goodInput = row.querySelector('.inspect-good-qty');

            const badInput = row.querySelector('.inspect-bad-qty');

            let damagedQty = parseInt(damagedInput?.value, 10) || 0;

            let wrongItemQty = parseInt(wrongInput?.value, 10) || 0;

            let mixedDamagedQty = 0;

            let mixedBadQty = 0;

            let mixedGoodQty = 0;

            if (isMixedReturnType()) {

                mixedDamagedQty = parseInt(damagedInput?.value, 10) || 0;

                mixedBadQty = parseInt(badInput?.value, 10) || 0;

                mixedGoodQty = parseInt(goodInput?.value, 10) || 0;

                damagedQty = mixedDamagedQty + mixedBadQty;

                wrongItemQty = mixedGoodQty;

            } else if (isWrongItemReturnType()) {

                wrongItemQty = parseInt(goodInput?.value, 10) || 0;

                damagedQty = parseInt(badInput?.value, 10) || 0;

            } else if (isDamageReturnType()) {

                wrongItemQty = 0;

            }

            items.push({

                productId: base.productId,

                variationId: base.variationId,

                quantity: base.quantity,

                damagedQty: damagedQty,

                wrongItemQty: wrongItemQty,

                mixedDamagedQty: mixedDamagedQty,

                mixedBadQty: mixedBadQty,

                mixedGoodQty: mixedGoodQty

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

            if (isMixedReturnType()) {

                const sum = (it.mixedDamagedQty || 0) + (it.mixedBadQty || 0) + (it.mixedGoodQty || 0);

                if (sum !== it.quantity) {

                    return 'For each variant, damaged + bad item + good item must equal returned quantity (' + it.quantity + ').';

                }

            } else if (it.damagedQty + it.wrongItemQty !== it.quantity) {

                if (isWrongItemReturnType()) {

                    return 'For each variant, good item + bad item must equal returned quantity (' + it.quantity + ').';

                }

                if (isDamageReturnType()) {

                    return 'For each variant, damaged quantity must equal returned quantity (' + it.quantity + ').';

                }

                return 'For each variant, damaged + good item must equal returned quantity (' + it.quantity + ').';

            }

            if (isDamageReturnType() && it.wrongItemQty !== 0) {

                return 'Damaged returns cannot include good-item quantities.';

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



    function buildInspectQtyRow(item, index) {
        const q = item.quantity;
        if (isMixedReturnType()) {
            return '<div class="return-inspect-qty-row return-inspect-qty-row-mixed">' +
                '<div><label>Damaged qty</label><input type="number" class="inspect-damaged-qty" min="0" max="' + q + '" value="0"></div>' +
                '<div><label>Bad item qty</label><input type="number" class="inspect-bad-qty" min="0" max="' + q + '" value="0"></div>' +
                '<div><label>Good item qty</label><input type="number" class="inspect-good-qty" min="0" max="' + q + '" value="0"></div>' +
                '</div>';
        }
        if (isWrongItemReturnType()) {
            return '<div class="return-inspect-qty-row">' +
                '<div><label>Good item qty</label><input type="number" class="inspect-good-qty" min="0" max="' + q + '" value="0"></div>' +
                '<div><label>Bad item qty</label><input type="number" class="inspect-bad-qty" min="0" max="' + q + '" value="0"></div>' +
                '</div>';
        }
        if (isDamageReturnType()) {
            return '<div class="return-inspect-qty-row">' +
                '<div><label>Damaged qty</label><input type="number" class="inspect-damaged-qty" min="0" max="' + q + '" value="0"></div>' +
                '</div>';
        }
        return '<div class="return-inspect-qty-row">' +
            '<div><label>Damaged qty</label><input type="number" class="inspect-damaged-qty" min="0" max="' + q + '" value="0"></div>' +
            '<div><label>Good item qty</label><input type="number" class="inspect-wrong-qty inspect-good-qty" min="0" max="' + q + '" value="0"></div>' +
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

                buildInspectQtyRow(item, index) + '</div>'

            );

        }).join('');



        container.querySelectorAll('.inspect-damaged-qty, .inspect-wrong-qty, .inspect-good-qty, .inspect-bad-qty').forEach(function (input) {

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

        const goodInput = row.querySelector('.inspect-good-qty');

        const badInput = row.querySelector('.inspect-bad-qty');

        if (type === 'damaged') {

            if (damagedInput) damagedInput.value = String(item.quantity);

            if (wrongInput) wrongInput.value = '0';

            if (goodInput) goodInput.value = '0';

            if (badInput) badInput.value = '0';

        } else if (type === 'good') {

            if (goodInput) goodInput.value = String(item.quantity);

            if (wrongInput) wrongInput.value = String(item.quantity);

            if (badInput) badInput.value = '0';

            if (damagedInput) damagedInput.value = '0';

        } else if (type === 'bad') {

            if (badInput) badInput.value = String(item.quantity);

            if (damagedInput) damagedInput.value = String(item.quantity);

            if (goodInput) goodInput.value = '0';

            if (wrongInput) wrongInput.value = '0';

        } else if (type === 'wrong') {

            if (wrongInput) wrongInput.value = String(item.quantity);

            if (damagedInput) damagedInput.value = '0';

            if (goodInput) goodInput.value = String(item.quantity);

            if (badInput) badInput.value = '0';

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

        const goodInput = row.querySelector('.inspect-good-qty');

        const badInput = row.querySelector('.inspect-bad-qty');

        let d = parseInt(damagedInput?.value, 10) || 0;

        let w = parseInt(wrongInput?.value, 10) || 0;

        let g = parseInt(goodInput?.value, 10) || 0;

        let b = parseInt(badInput?.value, 10) || 0;

        const active = document.activeElement;

        if (isMixedReturnType()) {

            let total = d + b + g;

            if (total > item.quantity && active) {

                const others = total - (parseInt(active.value, 10) || 0);

                const room = Math.max(0, item.quantity - others);

                active.value = String(Math.min(parseInt(active.value, 10) || 0, room));

            }

            return;

        }

        if (isWrongItemReturnType()) {

            if (active === goodInput && g + b > item.quantity) {

                b = Math.max(0, item.quantity - g);

                if (badInput) badInput.value = String(b);

            } else if (active === badInput && g + b > item.quantity) {

                g = Math.max(0, item.quantity - b);

                if (goodInput) goodInput.value = String(g);

            }

            return;

        }

        if (d + w > item.quantity) {

            if (active === damagedInput) {

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

        inspectReturnType = '';

        inspectReturnReason = '';

        showInspectError('');

        renderInspectCustomerReason();

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

            inspectReturnType = result.returnType || '';

            inspectReturnReason = result.returnReason || '';

            renderInspectCustomerReason();

            updateInspectHintText();

            renderInspectVariants();

            prefillInspectFromCustomerReason();

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



    window.openReturnInspectConfirmModal = function () {

        if (!inspectOrderId) return;

        const selections = getInspectSelections();

        const validationError = validateInspectSelections(selections);

        if (validationError) {

            showInspectError(validationError);

            return;

        }

        showInspectError('');

        const inspectOverlay = document.getElementById('returnInspectModal');

        if (inspectOverlay) inspectOverlay.classList.remove('show');

        const modal = document.getElementById('returnInspectConfirmModal');

        if (modal) modal.classList.add('show');

    };



    window.closeReturnInspectConfirmModal = function () {

        const modal = document.getElementById('returnInspectConfirmModal');

        if (modal) modal.classList.remove('show');

        if (inspectOrderId && inspectItems.length) {

            const inspectOverlay = document.getElementById('returnInspectModal');

            if (inspectOverlay) inspectOverlay.classList.add('show');

        }

    };



    window.executeReturnInspectProceed = async function () {

        if (!inspectOrderId) return;

        const selections = getInspectSelections();

        const validationError = validateInspectSelections(selections);

        if (validationError) {

            closeReturnInspectConfirmModal();

            showInspectError(validationError);

            return;

        }

        const btn = document.getElementById('returnInspectConfirmBtn');

        const proceedBtn = document.getElementById('returnInspectProceedBtn');

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

                closeReturnInspectConfirmModal();

                closeReturnInspectModal();

                if (typeof showSuccessModal === 'function') {
                    window.__pendingSuccessReload = true;
                    showSuccessModal(result.message || 'Inspection saved.', '', 'approve');
                } else {

                    alert(result.message || 'Inspection saved.');

                    window.location.reload();

                }

            } else {

                closeReturnInspectConfirmModal();

                showInspectError(result.message || 'Failed to save inspection.');

            }

        } catch (err) {

            console.error(err);

            closeReturnInspectConfirmModal();

            showInspectError('Failed to save inspection. Please try again.');

        } finally {

            if (btn) {

                btn.disabled = false;

                btn.textContent = 'Apply & Complete';

            }

            if (proceedBtn) {

                proceedBtn.disabled = false;

                proceedBtn.textContent = 'Proceed';

            }

        }

    };



    window.openReturnReceiveConfirmModal = function (orderId) {

        pendingReceiveOrderId = orderId;

        const modal = document.getElementById('returnReceiveConfirmModal');

        if (modal) modal.classList.add('show');

    };



    window.closeReturnReceiveConfirmModal = function () {

        const modal = document.getElementById('returnReceiveConfirmModal');

        if (modal) modal.classList.remove('show');

        pendingReceiveOrderId = null;

    };



    window.executeReturnReceivingProceed = async function () {

        const orderId = pendingReceiveOrderId;

        if (!orderId) return;

        const btn = document.getElementById('returnReceiveConfirmBtn');

        if (btn) {

            btn.disabled = true;

            btn.textContent = 'Saving…';

        }

        try {

            const response = await fetch('/api/admin/orders/' + orderId + '/return/receiving-proceed', {

                method: 'POST',

                headers: { 'Content-Type': 'application/json' },

                credentials: 'include'

            });

            const result = await response.json();

            if (result.success) {

                closeReturnReceiveConfirmModal();

                if (typeof showSuccessModal === 'function') {

                    window.__pendingSuccessReload = true;
                    showSuccessModal(result.message || 'Ready for inspection.', '', 'approve');

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

        } finally {

            if (btn) {

                btn.disabled = false;

                btn.textContent = 'Receive Item';

            }

        }

    };



    window.openReturnInspectStartConfirm = function (orderId) {
        pendingInspectStartOrderId = orderId;
        const modal = document.getElementById('returnInspectStartModal');
        if (modal) modal.classList.add('show');
    };

    window.closeReturnInspectStartModal = function () {
        const modal = document.getElementById('returnInspectStartModal');
        if (modal) modal.classList.remove('show');
        pendingInspectStartOrderId = null;
    };

    window.confirmReturnInspectStart = function () {
        const orderId = pendingInspectStartOrderId;
        closeReturnInspectStartModal();
        if (orderId) openReturnInspectModal(orderId);
    };

    window.openReturnPickupProceedModal = function (orderId, actionType) {

        pendingPickupOrderId = orderId;
        pendingPickupActionType = String(actionType || '').toLowerCase().trim();

        const modal = document.getElementById('returnPickupProceedModal');
        const title = document.getElementById('returnPickupProceedTitle');
        const message = document.getElementById('returnPickupProceedMessage');
        const btn = document.getElementById('returnPickupProceedBtn');

        if (pendingPickupActionType === 'refund') {
            if (title) title.textContent = 'Process Refund';
            if (message) message.textContent = 'Confirm process the customer refund?';
            if (btn) btn.textContent = 'Process Refund';
        } else if (pendingPickupActionType === 'replacement') {
            if (title) title.textContent = 'Process Replacement';
            if (message) message.textContent = 'Confirm pickup is complete and proceed to process the replacement order?';
            if (btn) btn.textContent = 'Process Replacement';
        } else {
            if (title) title.textContent = 'Proceed';
            if (message) message.textContent = 'Confirm and proceed?';
            if (btn) btn.textContent = 'Proceed';
        }

        if (modal) modal.classList.add('show');

    };



    window.closeReturnPickupProceedModal = function () {

        const modal = document.getElementById('returnPickupProceedModal');

        if (modal) modal.classList.remove('show');

        pendingPickupOrderId = null;
        pendingPickupActionType = '';

    };



    window.executeReturnPickupProceed = async function () {

        const orderId = pendingPickupOrderId;

        if (!orderId) return;

        const btn = document.getElementById('returnPickupProceedBtn');

        if (btn) {

            btn.disabled = true;

            btn.textContent = 'Saving…';

        }

        try {

            const response = await fetch('/api/admin/orders/' + orderId + '/return/pickup-complete', {

                method: 'POST',

                headers: { 'Content-Type': 'application/json' },

                credentials: 'include'

            });

            const result = await response.json();

            if (result.success) {

                closeReturnPickupProceedModal();

                if (typeof showSuccessModal === 'function') {

                    window.__pendingSuccessReload = true;
                    showSuccessModal('Success!\nProcess refund', '', 'approve');

                } else {

                    alert(result.message || 'Ready for refund or replacement.');

                    window.location.reload();

                }

            } else {

                alert(result.message || 'Failed to proceed.');

            }

        } catch (err) {

            console.error(err);

            alert('Failed to proceed. Please try again.');

        } finally {

            if (btn) {

                btn.disabled = false;

                btn.textContent = 'Proceed';

            }

        }

    };



    // Backward-compatible aliases

    window.confirmReturnReceivingProceed = window.openReturnReceiveConfirmModal;

    window.confirmReturnPickup = window.openReturnPickupProceedModal;

    /** Proceed on inspect modal — validate, close overlay, apply inspection (no second confirm). */
    window.proceedReturnInspectDirect = function () {
        if (!inspectOrderId) return;
        const selections = getInspectSelections();
        const validationError = validateInspectSelections(selections);
        if (validationError) {
            showInspectError(validationError);
            return;
        }
        showInspectError('');
        const inspectOverlay = document.getElementById('returnInspectModal');
        if (inspectOverlay) inspectOverlay.classList.remove('show');
        executeReturnInspectProceed();
    };

    window.confirmReturnInspectProceed = window.openReturnInspectConfirmModal;



    document.addEventListener('click', function (e) {

        const modal = document.getElementById('returnInspectModal');

        if (modal && e.target === modal) closeReturnInspectModal();

    });

})();

