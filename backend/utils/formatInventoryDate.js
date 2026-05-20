/**
 * Parse inventory/SQL date values for admin UI display.
 * Handles Date objects, ISO strings, /Date(ms)/, unix ms, and OLE day serials.
 */
function parseInventoryDate(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === 'object') {
        if (typeof value.toISOString === 'function') {
            const d = new Date(value.toISOString());
            return Number.isNaN(d.getTime()) ? null : d;
        }
    }
    const s = String(value).trim();
    const netDate = s.match(/^\/Date\((-?\d+)\)\/$/);
    if (netDate) {
        const d = new Date(parseInt(netDate[1], 10));
        return Number.isNaN(d.getTime()) ? null : d;
    }
    const n = Number(s);
    if (s !== '' && !Number.isNaN(n) && /^-?\d+(\.\d+)?$/.test(s)) {
        if (n > 1e11) {
            const d = new Date(n);
            return Number.isNaN(d.getTime()) ? null : d;
        }
        if (n > 25000 && n < 120000) {
            const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n * 86400000));
            return Number.isNaN(d.getTime()) ? null : d;
        }
    }
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
}

function formatInventoryDate(value, emptyLabel) {
    const d = parseInventoryDate(value);
    if (!d) return emptyLabel == null ? 'N/A' : emptyLabel;
    return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' });
}

module.exports = {
    parseInventoryDate,
    formatInventoryDate
};
