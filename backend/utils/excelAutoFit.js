'use strict';

/** Auto-size column widths from cell content (ExcelJS worksheet). */
function autoFitWorksheetColumns(worksheet, options = {}) {
    const minWidth = options.minWidth ?? 8;
    const maxWidth = options.maxWidth ?? 52;
    const padding = options.padding ?? 2;

    worksheet.columns.forEach((column) => {
        if (!column) return;
        let maxLen = minWidth;
        column.eachCell({ includeEmpty: false }, (cell) => {
            let cellLen = 10;
            const v = cell.value;
            if (v == null) return;
            if (v instanceof Date) {
                cellLen = 20;
            } else if (typeof v === 'object' && v.richText) {
                cellLen = v.richText.map(t => t.text || '').join('').length;
            } else if (typeof v === 'number') {
                cellLen = String(v).length + 4;
            } else {
                cellLen = String(v).length;
            }
            if (cell.font && cell.font.bold) cellLen += 1;
            maxLen = Math.max(maxLen, cellLen);
        });
        column.width = Math.min(maxWidth, Math.max(minWidth, maxLen + padding));
    });
}

/** Set row heights from wrapped text (approximate line count). */
function autoFitWorksheetRows(worksheet, startRow, endRow, options = {}) {
    const minHeight = options.minHeight ?? 16;
    const maxHeight = options.maxHeight ?? 72;
    const lineHeight = options.lineHeight ?? 15;

    for (let r = startRow; r <= endRow; r++) {
        const row = worksheet.getRow(r);
        let maxLines = 1;
        row.eachCell({ includeEmpty: false }, (cell) => {
            const col = worksheet.getColumn(cell.col);
            const colWidth = col.width || 10;
            const text = cell.value == null ? '' : String(
                cell.value instanceof Date ? cell.value.toLocaleString() : cell.value
            );
            const charsPerLine = Math.max(8, Math.floor(colWidth * 1.15));
            const lines = text.split(/\r?\n/).reduce((sum, line) => {
                return sum + Math.max(1, Math.ceil(line.length / charsPerLine));
            }, 0);
            maxLines = Math.max(maxLines, lines);
        });
        row.height = Math.min(maxHeight, Math.max(minHeight, maxLines * lineHeight));
    }
}

function escapeCsvCell(val) {
    if (val == null) return '';
    const s = val instanceof Date
        ? val.toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : String(val);
    if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

function rowsToCsv(rows) {
    return rows.map(row => row.map(escapeCsvCell).join(',')).join('\r\n');
}

module.exports = {
    autoFitWorksheetColumns,
    autoFitWorksheetRows,
    escapeCsvCell,
    rowsToCsv
};
