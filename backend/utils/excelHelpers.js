/**
 * Excel utility functions for reports
 */

/**
 * Auto-fit columns in an Excel worksheet based on content
 */
function autoFitWorksheetColumns(worksheet, options = {}) {
    const { minWidth = 8, maxWidth = 50, padding = 2 } = options;
    
    worksheet.columns.forEach(column => {
        if (!column || !column.eachCell) return;
        
        let maxLength = 0;
        column.eachCell({ includeEmpty: false }, cell => {
            const cellValue = cell.value ? cell.value.toString() : '';
            maxLength = Math.max(maxLength, cellValue.length);
        });
        
        const width = Math.min(Math.max(maxLength + padding, minWidth), maxWidth);
        column.width = width;
    });
}

/**
 * Auto-fit row heights in an Excel worksheet
 */
function autoFitWorksheetRows(worksheet, startRow, endRow, options = {}) {
    const { minHeight = 15, maxHeight = 100 } = options;
    
    for (let i = startRow; i <= endRow; i++) {
        const row = worksheet.getRow(i);
        if (!row) continue;
        
        let maxLines = 1;
        row.eachCell({ includeEmpty: false }, cell => {
            const cellValue = cell.value ? cell.value.toString() : '';
            const lines = cellValue.split('\n').length;
            maxLines = Math.max(maxLines, lines);
        });
        
        const height = Math.min(Math.max(maxLines * 15, minHeight), maxHeight);
        row.height = height;
    }
}

/**
 * Convert rows to CSV format
 */
function rowsToCsv(rows) {
    if (!rows || rows.length === 0) return '';
    
    const escapeCsvValue = (value) => {
        if (value === null || value === undefined) return '';
        const str = String(value);
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    };
    
    return rows.map(row => {
        if (Array.isArray(row)) {
            return row.map(escapeCsvValue).join(',');
        } else if (typeof row === 'object') {
            return Object.values(row).map(escapeCsvValue).join(',');
        }
        return String(row);
    }).join('\n');
}

module.exports = {
    autoFitWorksheetColumns,
    autoFitWorksheetRows,
    rowsToCsv
};
