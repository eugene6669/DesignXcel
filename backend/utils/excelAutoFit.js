'use strict';

function cellTextLength(cell) {
    const v = cell.value;
    if (v == null) return 0;
    if (v instanceof Date) return 20;
    if (typeof v === 'object' && v.richText) {
        return v.richText.map((t) => t.text || '').join('').length;
    }
    if (typeof v === 'number') return String(v).length + 4;
    const text = String(v);
    const lines = text.split(/\r?\n/);
    return Math.max(...lines.map((line) => line.length), 0);
}

/** Auto-size column widths from cell content (ExcelJS worksheet). */
function autoFitWorksheetColumns(worksheet, options = {}) {
    const minWidth = options.minWidth ?? 8;
    const maxWidth = options.maxWidth ?? 52;
    const padding = options.padding ?? 2;
    const startCol = options.startColumn ?? 1;
    const endCol = options.endColumn ?? (worksheet.columnCount || 26);
    const startRow = options.startRow ?? 1;
    const endRow = options.endRow ?? (worksheet.rowCount || 1);

    for (let colNum = startCol; colNum <= endCol; colNum++) {
        const column = worksheet.getColumn(colNum);
        if (!column) continue;
        let maxLen = minWidth;
        for (let rowNum = startRow; rowNum <= endRow; rowNum++) {
            const cell = worksheet.getRow(rowNum).getCell(colNum);
            if (cell.value === null || cell.value === undefined) continue;
            let cellLen = cellTextLength(cell);
            if (cell.font && cell.font.bold) cellLen += 1;
            if (cell.alignment && cell.alignment.wrapText && cellLen > maxWidth) {
                cellLen = Math.min(maxWidth, Math.ceil(cellLen / 2));
            }
            maxLen = Math.max(maxLen, cellLen);
        }
        column.width = Math.min(maxWidth, Math.max(minWidth, maxLen + padding));
    }
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
