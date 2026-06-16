'use strict';

/**
 * Parse money from form input. Supports en-US display format:
 * comma = thousands separator, dot = decimal (e.g. "1,234.56").
 */
function parseMoneyInput(value) {
    if (value == null) return NaN;
    const raw = String(value).trim();
    if (!raw) return NaN;

    let s = raw.replace(/\s/g, '').replace(/[^\d.,-]/g, '');
    if (!s || s === '-' || s === '.' || s === ',') return NaN;

    if (s.includes('.')) {
        const n = parseFloat(s.replace(/,/g, ''));
        return Number.isFinite(n) ? n : NaN;
    }

    const lastComma = s.lastIndexOf(',');
    if (lastComma !== -1) {
        const after = s.slice(lastComma + 1);
        if (/^\d{1,2}$/.test(after)) {
            const n = parseFloat(s.slice(0, lastComma).replace(/,/g, '') + '.' + after);
            return Number.isFinite(n) ? n : NaN;
        }
    }

    const n = parseFloat(s.replace(/,/g, ''));
    return Number.isFinite(n) ? n : NaN;
}

module.exports = { parseMoneyInput };
