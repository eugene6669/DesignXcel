'use strict';

function styleExcelCell(cell, options = {}) {
    if (options.font) cell.font = options.font;
    if (options.fill) cell.fill = options.fill;
    if (options.border) cell.border = options.border;
    if (options.alignment) cell.alignment = options.alignment;
    if (options.numFmt) cell.numFmt = options.numFmt;
}

function createExcelHeaderRow(worksheet, rowNumber, columns, startCol = 1) {
    const row = worksheet.getRow(rowNumber);
    columns.forEach((col, index) => {
        const cell = row.getCell(startCol + index);
        cell.value = col;
        styleExcelCell(cell, {
            font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } },
            alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
            border: {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            }
        });
    });
    row.height = 30;
    return row;
}

function createExcelTitle(worksheet, rowNumber, title, colSpan = 1) {
    const row = worksheet.getRow(rowNumber);
    const cell = row.getCell(1);
    cell.value = title;
    worksheet.mergeCells(rowNumber, 1, rowNumber, colSpan);
    styleExcelCell(cell, {
        font: { bold: true, size: 16, color: { argb: 'FF1F4E78' } },
        alignment: { horizontal: 'left', vertical: 'middle', wrapText: true }
    });
    row.height = 30;
    return row;
}

function createExcelSectionHeader(worksheet, rowNumber, title, colSpan = 1) {
    const row = worksheet.getRow(rowNumber);
    const cell = row.getCell(1);
    cell.value = title;
    worksheet.mergeCells(rowNumber, 1, rowNumber, colSpan);
    styleExcelCell(cell, {
        font: { bold: true, size: 12, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF70AD47' } },
        alignment: { horizontal: 'left', vertical: 'middle', wrapText: true },
        border: {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        }
    });
    row.height = 22;
    return row;
}

function addSpacingRow(worksheet, rowNumber) {
    const row = worksheet.getRow(rowNumber);
    row.height = 5;
    return row;
}

module.exports = {
    styleExcelCell,
    createExcelHeaderRow,
    createExcelTitle,
    createExcelSectionHeader,
    addSpacingRow
};
