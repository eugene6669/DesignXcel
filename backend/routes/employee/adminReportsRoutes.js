'use strict';

/**
 * Admin Reports Routes
 * Handles: Reports page, Inventory Reports, Sales Reports, and Masterlist Reports (data & exports)
 */

module.exports = function registerAdminReportsRoutes(router, context) {
    const {
        sql,
        pool,
        isAuthenticated,
        checkPermission
    } = context;

    // Import required utilities
    const ExcelJS = require('exceljs');
    const path = require('path');

    // Helper function to get ExcelJS instance
    function getExcelJS() {
        return ExcelJS;
    }

    // Helper functions for Excel formatting
    function createExcelTitle(worksheet, row, title, colSpan) {
        worksheet.mergeCells(row, 1, row, colSpan);
        const titleRow = worksheet.getRow(row);
        titleRow.getCell(1).value = title;
        titleRow.getCell(1).font = { bold: true, size: 16 };
        titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
        titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
        titleRow.height = 30;
    }

    function createExcelSectionHeader(worksheet, row, title, colSpan) {
        worksheet.mergeCells(row, 1, row, colSpan);
        const headerRow = worksheet.getRow(row);
        headerRow.getCell(1).value = title;
        headerRow.getCell(1).font = { bold: true, size: 12 };
        headerRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
        headerRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
        headerRow.height = 25;
    }

    function createExcelHeaderRow(worksheet, row, headers, startCol) {
        const headerRow = worksheet.getRow(row);
        headers.forEach((header, idx) => {
            const cell = headerRow.getCell(startCol + idx);
            cell.value = header;
            cell.font = { bold: true, size: 11 };
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1D5DB' } };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });
        headerRow.height = 20;
    }

    // Helper functions for inventory reports
    async function fetchInventoryReportProducts(pool, filters) {
        const { search, category, status, stockMin, stockMax } = filters;
        const { fetchInventoryReportProducts } = require('../../utils/inventoryReportHelpers');
        return fetchInventoryReportProducts(pool, filters);
    }

    async function fetchInventoryReportRawMaterials(pool, filters) {
        const { fetchInventoryReportRawMaterials } = require('../../utils/inventoryReportHelpers');
        return fetchInventoryReportRawMaterials(pool, filters);
    }

    async function fetchProductCategoriesList(pool) {
        const { fetchProductCategoriesList } = require('../../utils/inventoryReportHelpers');
        return fetchProductCategoriesList(pool);
    }

    // Helper functions for sales reports
    async function detectSalesReportSchema(pool) {
        const { detectSalesReportSchema } = require('../../utils/salesReportHelpers');
        return detectSalesReportSchema(pool);
    }

    function sumRefundMerchandise(orders) {
        const { sumRefundMerchandise } = require('../../utils/salesReportHelpers');
        return sumRefundMerchandise(orders);
    }

    function countRefundMerchandiseOrders(orders) {
        const { countRefundMerchandiseOrders } = require('../../utils/salesReportHelpers');
        return countRefundMerchandiseOrders(orders);
    }

    function isRefundMerchandiseOrder(order) {
        const { isRefundMerchandiseOrder } = require('../../utils/salesReportHelpers');
        return isRefundMerchandiseOrder(order);
    }

    async function computeInventoryLossAtCost(pool, sql, returnedOrders, hasReturnItemsColumn, hasCostPrice) {
        const { computeInventoryLossAtCost } = require('../../utils/salesReportHelpers');
        return computeInventoryLossAtCost(pool, sql, returnedOrders, hasReturnItemsColumn, hasCostPrice);
    }

    async function computeMerchandiseCostMetrics(pool, sql, orderIds, hasCostPrice) {
        const { computeMerchandiseCostMetrics } = require('../../utils/salesReportHelpers');
        return computeMerchandiseCostMetrics(pool, sql, orderIds, hasCostPrice);
    }

    function aggregateSalesReportFromOrders(orders, metrics) {
        const { aggregateSalesReportFromOrders } = require('../../utils/salesReportHelpers');
        return aggregateSalesReportFromOrders(orders, metrics);
    }

    function countsTowardGrossSales(order) {
        const { countsTowardGrossSales } = require('../../utils/salesReportHelpers');
        return countsTowardGrossSales(order);
    }

    function countsTowardNetRevenue(order) {
        const { countsTowardNetRevenue } = require('../../utils/salesReportHelpers');
        return countsTowardNetRevenue(order);
    }

    function countReturnedOrders(orders) {
        const { countReturnedOrders } = require('../../utils/salesReportHelpers');
        return countReturnedOrders(orders);
    }

    function applySalesReportOrderRowDisplay(order, items) {
        const { applySalesReportOrderRowDisplay } = require('../../utils/salesReportHelpers');
        return applySalesReportOrderRowDisplay(order, items);
    }

    function buildSalesReportExportSummaryRows(stats) {
        const { buildSalesReportExportSummaryRows } = require('../../utils/salesReportHelpers');
        return buildSalesReportExportSummaryRows(stats);
    }

    function getOrderStatusLabel(status) {
        const { getOrderStatusLabel } = require('../../utils/salesReportHelpers');
        return getOrderStatusLabel(status);
    }

    function autoFitWorksheetColumns(worksheet, options) {
        const { autoFitWorksheetColumns } = require('../../utils/excelHelpers');
        return autoFitWorksheetColumns(worksheet, options);
    }

    function autoFitWorksheetRows(worksheet, startRow, endRow, options) {
        const { autoFitWorksheetRows } = require('../../utils/excelHelpers');
        return autoFitWorksheetRows(worksheet, startRow, endRow, options);
    }

    function rowsToCsv(rows) {
        const { rowsToCsv } = require('../../utils/excelHelpers');
        return rowsToCsv(rows);
    }

    // =============================================================================
    // ADMIN REPORTS ROUTES
    // =============================================================================

    // Admin Reports Page
    router.get('/Employee/Admin/Reports', isAuthenticated, async (req, res) => {
        try {
            const {
                SALES_REPORT_METRIC_DEFINITIONS,
                SALES_REPORT_METRIC_FORMULAS
            } = require('../../utils/salesReportMetrics');
            res.render('Employee/Admin/AdminReports', {
                user: req.session.user,
                salesReportMetricFormulas: SALES_REPORT_METRIC_FORMULAS,
                salesReportMetricDefinitions: SALES_REPORT_METRIC_DEFINITIONS
            });
        } catch (err) {
            console.error('Error rendering reports page:', err);
            res.render('Employee/Admin/AdminReports', {
                user: req.session.user,
                salesReportMetricFormulas: {},
                salesReportMetricDefinitions: {}
            });
        }
    });

    // Inventory Manager Reports Page (alias)
    router.get('/Employee/InventoryManager/InventoryReports', isAuthenticated, checkPermission('inventory_reports'), async (req, res) => {
        try {
            res.render('Employee/InventoryManager/InventoryReports', {
                user: req.session.user
            });
        } catch (err) {
            console.error('Error rendering inventory reports page:', err);
            res.render('Employee/InventoryManager/InventoryReports', {
                user: req.session.user
            });
        }
    });

    [
        { segment: 'TransactionManager', prefix: 'Transaction' },
        { segment: 'UserManager', prefix: 'User' },
        { segment: 'OrderSupport', prefix: 'Order' }
    ].forEach(({ segment, prefix }) => {
        router.get(`/Employee/${segment}/${prefix}Reports`, isAuthenticated, checkPermission('inventory_reports'), (req, res) => {
            res.render(`Employee/${segment}/${prefix}Reports`, { user: req.session.user });
        });
    });

    // Inventory Report Data (aligned with Product Inventory products + raw materials tabs)
    router.get('/Employee/Admin/Reports/Inventory/Data', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const { search, category, status, stockMin, stockMax } = req.query;
            const filters = { search, category, status, stockMin, stockMax };

            const [productsData, rawMaterialsData, categories] = await Promise.all([
                fetchInventoryReportProducts(pool, filters),
                fetchInventoryReportRawMaterials(pool, filters),
                fetchProductCategoriesList(pool)
            ]);

            const countReportStockValue = (rows) => rows.reduce((sum, p) => {
                const avail = p.AvailableQuantity || 0;
                const price = p.Price || 0;
                if (p.RowType === 'Variation') {
                    return sum + (avail * price);
                }
                if (p.RowType === 'Parent' && !p.HasVariations) {
                    return sum + (avail * price);
                }
                return sum;
            }, 0);
            const countReportLowStock = (rows) => rows.filter((p) => {
                const avail = p.AvailableQuantity || 0;
                if (p.RowType === 'Parent' && p.HasVariations) return false;
                return avail > 0 && avail <= 10;
            }).length;
            const parentRows = productsData.filter((p) => p.RowType === 'Parent');
            const stats = {
                totalProducts: parentRows.length,
                activeProducts: parentRows.filter((p) => (p.AvailableQuantity || 0) > 0).length,
                lowStock: countReportLowStock(productsData),
                totalValue: countReportStockValue(productsData),
                totalRawMaterials: rawMaterialsData.length,
                activeRawMaterials: rawMaterialsData.filter((rm) => rm.IsActive).length,
                lowStockRawMaterials: rawMaterialsData.filter((rm) => {
                    const stock = rm.QuantityAvailable || 0;
                    return rm.IsActive && stock > 0 && stock <= 10;
                }).length,
                totalRawMaterialsQuantity: rawMaterialsData.reduce((sum, rm) => sum + (rm.QuantityAvailable || 0), 0)
            };

            res.json({
                success: true,
                data: productsData,
                rawMaterials: rawMaterialsData,
                categories: categories || [],
                stats
            });
        } catch (err) {
            console.error('Error fetching inventory report:', err);
            res.status(500).json({ success: false, error: err.message, details: err.toString(), stack: err.stack });
        }
    });

    // Inventory Report CSV Export
    router.get('/Employee/Admin/Reports/Inventory/Export', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const { search, category, status, stockMin, stockMax, dateFrom, dateTo } = req.query;

            const filters = { search, category, status, stockMin, stockMax };
            const [productsData, rawMaterialsData] = await Promise.all([
                fetchInventoryReportProducts(pool, filters),
                fetchInventoryReportRawMaterials(pool, filters)
            ]);
            const productsResult = {
                recordset: productsData.map((p) => ({
                    ...p,
                    Status: p.Status || (p.IsActive ? 'Active' : 'Inactive')
                }))
            };
            const rawMaterialsResult = {
                recordset: rawMaterialsData.map((rm) => ({
                    ...rm,
                    Status: rm.IsActive ? 'Active' : 'Inactive'
                }))
            };

            // Calculate summary statistics
            const exportParentRows = productsResult.recordset.filter((p) => p.RowType === 'Parent');
            const totalProducts = exportParentRows.length;
            const activeProducts = exportParentRows.filter((p) => (p.AvailableQuantity || 0) > 0).length;
            const inactiveProducts = exportParentRows.filter((p) => (p.AvailableQuantity || 0) === 0 && (p.StockQuantity || 0) === 0).length;
            const totalStock = productsResult.recordset.reduce((sum, p) => {
                if (p.RowType === 'Variation') return sum + (parseFloat(p.StockQuantity) || 0);
                if (p.RowType === 'Parent' && !p.HasVariations) return sum + (parseFloat(p.StockQuantity) || 0);
                return sum;
            }, 0);
            const lowStockProducts = productsResult.recordset.filter((p) => {
                const stock = parseFloat(p.AvailableQuantity || 0);
                if (p.RowType === 'Parent' && p.HasVariations) return false;
                return stock > 0 && stock <= 10;
            }).length;
            const totalValue = productsResult.recordset.reduce((sum, p) => {
                const avail = parseFloat(p.AvailableQuantity || 0);
                const price = parseFloat(p.Price || 0);
                if (p.RowType === 'Variation') return sum + (avail * price);
                if (p.RowType === 'Parent' && !p.HasVariations) return sum + (avail * price);
                return sum;
            }, 0);

            const totalRawMaterials = rawMaterialsResult.recordset.length;
            const activeRawMaterials = rawMaterialsResult.recordset.filter(rm => rm.Status === 'Active').length;
            const inactiveRawMaterials = rawMaterialsResult.recordset.filter(rm => rm.Status === 'Inactive').length;
            const totalRawMaterialsQuantity = rawMaterialsResult.recordset.reduce((sum, rm) => sum + (parseFloat(rm.QuantityAvailable) || 0), 0);

            // Generate Excel file with enhanced formatting
            const ExcelJS = getExcelJS();
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Inventory Report');

            const timestamp = new Date().toLocaleString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });

            let currentRow = 1;

            // Title
            createExcelTitle(worksheet, currentRow++, 'INVENTORY REPORT', 9);
            worksheet.getRow(currentRow++).getCell(1).value = `Generated on: ${timestamp}`;
            worksheet.getRow(currentRow++).getCell(1).value = `Report Type: Comprehensive Inventory Analysis`;
            currentRow++;

            // Filters Applied
            worksheet.getRow(currentRow++).getCell(1).value = 'FILTERS APPLIED';
            worksheet.getRow(currentRow).getCell(1).font = { bold: true, size: 11 };
            currentRow++;
            worksheet.getRow(currentRow++).getCell(1).value = `Category: ${category || 'All'}`;
            worksheet.getRow(currentRow++).getCell(1).value = `Status: ${status || 'All'}`;
            worksheet.getRow(currentRow++).getCell(1).value = `Stock Range: ${stockMin ? `Min: ${stockMin}` : ''}${stockMin && stockMax ? ' - ' : ''}${stockMax ? `Max: ${stockMax}` : ''}${!stockMin && !stockMax ? 'All' : ''}`;
            worksheet.getRow(currentRow++).getCell(1).value = `Date From: ${dateFrom || 'All'}`;
            worksheet.getRow(currentRow++).getCell(1).value = `Date To: ${dateTo || 'All'}`;
            worksheet.getRow(currentRow++).getCell(1).value = `Search: ${search || 'None'}`;
            currentRow++;

            // Calculate category breakdown for charts
            const categoryBreakdown = {};
            exportParentRows.forEach((row) => {
                const cat = row.CategoryName || 'Uncategorized';
                if (!categoryBreakdown[cat]) {
                    categoryBreakdown[cat] = { count: 0, stock: 0, value: 0 };
                }
                categoryBreakdown[cat].count++;
            });
            productsResult.recordset.forEach((row) => {
                const cat = row.CategoryName || 'Uncategorized';
                if (!categoryBreakdown[cat]) {
                    categoryBreakdown[cat] = { count: 0, stock: 0, value: 0 };
                }
                if (row.RowType === 'Variation') {
                    const avail = parseFloat(row.AvailableQuantity || 0);
                    categoryBreakdown[cat].stock += avail;
                    categoryBreakdown[cat].value += parseFloat(row.Price || 0) * avail;
                } else if (row.RowType === 'Parent' && !row.HasVariations) {
                    const avail = parseFloat(row.AvailableQuantity || 0);
                    categoryBreakdown[cat].stock += avail;
                    categoryBreakdown[cat].value += parseFloat(row.Price || 0) * avail;
                }
            });

            // Summary Statistics with better formatting
            const statsStartRow = currentRow;
            worksheet.getRow(currentRow++).getCell(1).value = 'SUMMARY STATISTICS';
            worksheet.getRow(currentRow - 1).getCell(1).font = { bold: true, size: 11 };
            worksheet.getRow(currentRow - 1).getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E6E6' } };
            currentRow++;

            // Products stats in a box
            worksheet.mergeCells(currentRow, 1, currentRow, 3);
            worksheet.getRow(currentRow++).getCell(1).value = 'PRODUCTS';
            worksheet.getRow(currentRow - 1).getCell(1).font = { bold: true, size: 10 };
            worksheet.getRow(currentRow - 1).getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };

            const productStats = [
                { label: 'Total Products', value: totalProducts },
                { label: 'Active Products', value: activeProducts },
                { label: 'Inactive Products', value: inactiveProducts },
                { label: 'Total Stock Quantity', value: totalStock },
                { label: 'Low Stock Items (≤10)', value: lowStockProducts },
                { label: 'Total Inventory Value', value: totalValue, format: '₱#,##0.00' }
            ];

            productStats.forEach((stat, idx) => {
                const row = worksheet.getRow(currentRow++);
                row.getCell(1).value = stat.label;
                row.getCell(1).font = { bold: true };
                row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
                row.getCell(2).value = stat.value;
                if (stat.format) {
                    row.getCell(2).numFmt = stat.format;
                }
                // Borders
                for (let i = 1; i <= 2; i++) {
                    row.getCell(i).border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' }
                    };
                }
            });
            currentRow++;

            // Raw Materials stats
            worksheet.mergeCells(currentRow, 1, currentRow, 3);
            worksheet.getRow(currentRow++).getCell(1).value = 'RAW MATERIALS';
            worksheet.getRow(currentRow - 1).getCell(1).font = { bold: true, size: 10 };
            worksheet.getRow(currentRow - 1).getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };

            const rawMaterialStats = [
                { label: 'Total Raw Materials', value: totalRawMaterials },
                { label: 'Active Raw Materials', value: activeRawMaterials },
                { label: 'Inactive Raw Materials', value: inactiveRawMaterials },
                { label: 'Total Quantity', value: totalRawMaterialsQuantity }
            ];

            rawMaterialStats.forEach((stat, idx) => {
                const row = worksheet.getRow(currentRow++);
                row.getCell(1).value = stat.label;
                row.getCell(1).font = { bold: true };
                row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
                row.getCell(2).value = stat.value;
                // Borders
                for (let i = 1; i <= 2; i++) {
                    row.getCell(i).border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' }
                    };
                }
            });
            currentRow += 2;

            // Chart Data: Category Breakdown
            const chartDataStartRow = currentRow;
            worksheet.getRow(currentRow++).getCell(11).value = 'Category Breakdown';
            worksheet.getRow(currentRow - 1).getCell(11).font = { bold: true, size: 11 };
            worksheet.getRow(currentRow++).getCell(11).value = 'Category';
            worksheet.getRow(currentRow - 1).getCell(11).font = { bold: true };
            worksheet.getRow(currentRow - 1).getCell(12).value = 'Products';
            worksheet.getRow(currentRow - 1).getCell(12).font = { bold: true };
            worksheet.getRow(currentRow - 1).getCell(13).value = 'Stock Qty';
            worksheet.getRow(currentRow - 1).getCell(13).font = { bold: true };
            worksheet.getRow(currentRow - 1).getCell(14).value = 'Value';
            worksheet.getRow(currentRow - 1).getCell(14).font = { bold: true };

            const categoryChartStartRow = currentRow;
            Object.keys(categoryBreakdown).sort().forEach((cat, idx) => {
                const row = worksheet.getRow(currentRow++);
                row.getCell(11).value = cat;
                row.getCell(12).value = categoryBreakdown[cat].count;
                row.getCell(13).value = categoryBreakdown[cat].stock;
                row.getCell(13).numFmt = '#,##0';
                row.getCell(14).value = categoryBreakdown[cat].value;
                row.getCell(14).numFmt = '₱#,##0.00';
            });
            const categoryChartEndRow = currentRow - 1;

            // Products section starts after stats section
            // Calculate where products section should be
            let productsSectionStartRow = statsStartRow + productStats.length + rawMaterialStats.length + 10;

            // Products section
            createExcelSectionHeader(worksheet, productsSectionStartRow++, 'PRODUCTS INVENTORY', 9);
            currentRow = productsSectionStartRow;
            createExcelHeaderRow(worksheet, currentRow++, ['Type', 'Product Name', 'SKU', 'Category', 'Available Stock', 'Total Stock', 'Unit Price', 'Line Value', 'Status', 'Last Updated'], 1);

            productsResult.recordset.forEach(row => {
                const isParent = row.RowType === 'Parent';
                const unitPrice = isParent ? 0 : parseFloat(row.Price || 0);
                const availQty = parseFloat(row.AvailableQuantity || 0);
                const stockQty = parseFloat(row.StockQuantity || 0);
                const lineValue = isParent ? 0 : (unitPrice * availQty);
                const dataRow = worksheet.getRow(currentRow++);
                dataRow.getCell(1).value = row.RowType || 'Parent';
                dataRow.getCell(2).value = row.RowType === 'Variation' ? `  ${row.Name || ''}` : (row.Name || '');
                dataRow.getCell(3).value = isParent ? '' : (row.SKU || '');
                dataRow.getCell(4).value = row.CategoryName || '';
                dataRow.getCell(5).value = availQty;
                dataRow.getCell(5).numFmt = '#,##0';
                dataRow.getCell(6).value = stockQty;
                dataRow.getCell(6).numFmt = '#,##0';
                dataRow.getCell(7).value = isParent ? '' : unitPrice;
                if (!isParent) dataRow.getCell(7).numFmt = '₱#,##0.00';
                dataRow.getCell(8).value = isParent ? '' : lineValue;
                if (!isParent) dataRow.getCell(8).numFmt = '₱#,##0.00';
                dataRow.getCell(9).value = row.Status || '';
                dataRow.getCell(10).value = row.LastUpdated ? new Date(row.LastUpdated) : '';
                dataRow.getCell(10).numFmt = 'mm/dd/yyyy hh:mm AM/PM';

                // Apply borders
                for (let i = 1; i <= 10; i++) {
                    const cell = dataRow.getCell(i);
                    cell.border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' }
                    };
                }
            });
            currentRow++;

            // Raw Materials section
            createExcelSectionHeader(worksheet, currentRow++, 'RAW MATERIALS INVENTORY', 6);
            createExcelHeaderRow(worksheet, currentRow++, ['Material Name', 'SKU', 'Unit', 'Available Quantity', 'Status', 'Last Updated'], 1);

            rawMaterialsResult.recordset.forEach(row => {
                const dataRow = worksheet.getRow(currentRow++);
                dataRow.getCell(1).value = row.Name || '';
                dataRow.getCell(2).value = row.SKU || '';
                dataRow.getCell(3).value = row.Unit || '';
                dataRow.getCell(4).value = row.QuantityAvailable || 0;
                dataRow.getCell(4).numFmt = '#,##0';
                dataRow.getCell(5).value = row.Status || '';
                dataRow.getCell(6).value = row.LastUpdated ? new Date(row.LastUpdated) : '';
                dataRow.getCell(6).numFmt = 'mm/dd/yyyy hh:mm AM/PM';

                // Apply borders
                for (let i = 1; i <= 6; i++) {
                    const cell = dataRow.getCell(i);
                    cell.border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' }
                    };
                }
            });

            // Set column widths
            worksheet.getColumn(1).width = 30; // Product Name / Material Name
            worksheet.getColumn(2).width = 20; // SKU / Unit
            worksheet.getColumn(3).width = 20; // Category / Available Quantity
            worksheet.getColumn(4).width = 15; // Stock Quantity / Status
            worksheet.getColumn(5).width = 15; // Unit Price / Last Updated
            worksheet.getColumn(6).width = 15; // Total Value / Created At
            worksheet.getColumn(7).width = 12; // Status
            worksheet.getColumn(8).width = 20; // Last Updated
            worksheet.getColumn(9).width = 20; // Created At
            worksheet.getColumn(11).width = 20; // Chart data columns
            worksheet.getColumn(12).width = 12;
            worksheet.getColumn(13).width = 15;
            worksheet.getColumn(14).width = 18;

            // Add charts if we have data
            if (Object.keys(categoryBreakdown).length > 0) {
                try {
                    // Chart 1: Products by Category (Column Chart)
                    worksheet.addChart({
                        type: 'column',
                        name: 'Products by Category',
                        title: {
                            name: 'Products by Category'
                        },
                        legend: {
                            position: 'right'
                        },
                        series: [{
                            name: 'Number of Products',
                            categories: {
                                address: `'Inventory Report'!$K$${categoryChartStartRow + 1}:$K$${categoryChartEndRow}`,
                                sheet: 'Inventory Report'
                            },
                            values: {
                                address: `'Inventory Report'!$L$${categoryChartStartRow + 1}:$L$${categoryChartEndRow}`,
                                sheet: 'Inventory Report'
                            }
                        }],
                        xAxis: {
                            title: 'Category'
                        },
                        yAxis: {
                            title: 'Number of Products'
                        }
                    });

                    // Chart 2: Stock Quantity by Category (Column Chart)
                    worksheet.addChart({
                        type: 'column',
                        name: 'Stock Quantity by Category',
                        title: {
                            name: 'Stock Quantity by Category'
                        },
                        legend: {
                            position: 'right'
                        },
                        series: [{
                            name: 'Stock Quantity',
                            categories: {
                                address: `'Inventory Report'!$K$${categoryChartStartRow + 1}:$K$${categoryChartEndRow}`,
                                sheet: 'Inventory Report'
                            },
                            values: {
                                address: `'Inventory Report'!$M$${categoryChartStartRow + 1}:$M$${categoryChartEndRow}`,
                                sheet: 'Inventory Report'
                            }
                        }],
                        xAxis: {
                            title: 'Category'
                        },
                        yAxis: {
                            title: 'Stock Quantity'
                        }
                    });

                    // Chart 3: Inventory Value by Category (Bar Chart)
                    worksheet.addChart({
                        type: 'bar',
                        name: 'Inventory Value by Category',
                        title: {
                            name: 'Inventory Value by Category'
                        },
                        legend: {
                            position: 'right'
                        },
                        series: [{
                            name: 'Total Value',
                            categories: {
                                address: `'Inventory Report'!$K$${categoryChartStartRow + 1}:$K$${categoryChartEndRow}`,
                                sheet: 'Inventory Report'
                            },
                            values: {
                                address: `'Inventory Report'!$N$${categoryChartStartRow + 1}:$N$${categoryChartEndRow}`,
                                sheet: 'Inventory Report'
                            }
                        }],
                        xAxis: {
                            title: 'Category'
                        },
                        yAxis: {
                            title: 'Total Value (₱)'
                        }
                    });
                } catch (chartError) {
                    console.error('Error adding charts:', chartError);
                    // Continue without charts if there's an error
                }
            }

            // Generate buffer and send
            const buffer = await workbook.xlsx.writeBuffer();
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=inventory-report-${new Date().toISOString().split('T')[0]}-${Date.now()}.xlsx`);
            res.send(buffer);
        } catch (err) {
            console.error('Error exporting inventory report:', err);
            res.status(500).send('Error exporting inventory report');
        }
    });

    // Sales Report Data
    router.get('/Employee/Admin/Reports/Sales/Data', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const { search, status, payment, dateFrom, dateTo, amountMin, amountMax } = req.query;

            // Import the complete sales report data handler
            const { handleSalesReportData } = require('../../utils/salesReportDataHandler');
            const result = await handleSalesReportData(pool, sql, req.query);
            
            res.json(result);
        } catch (err) {
            console.error('Error fetching sales report:', err);
            res.status(500).json({ success: false, error: err.message, details: err.toString() });
        }
    });

    // Sales Report CSV Export
    router.get('/Employee/Admin/Reports/Sales/Export', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const { search, status, payment, dateFrom, dateTo, amountMin, amountMax } = req.query;

            // Import the complete sales report export handler
            const { handleSalesReportExport } = require('../../utils/salesReportExportHandler');
            await handleSalesReportExport(pool, sql, req.query, res);
        } catch (err) {
            console.error('Error exporting sales report:', err);
            res.status(500).send('Error exporting sales report');
        }
    });

    // Masterlist Report Data
    router.get('/Employee/Admin/Reports/Masterlist/Data', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            const { search, type, role, status, dateFrom, dateTo } = req.query;

            let query = `
                SELECT 
                    u.FullName,
                    u.Email,
                    ISNULL(c.CustomerID, 0) AS CustomerID,
                    ISNULL(c.PhoneNumber, '') AS PhoneNumber,
                    r.RoleName,
                    CASE WHEN u.IsActive = 1 THEN 1 ELSE 0 END AS IsActive,
                    u.CreatedAt,
                    u.LastLogin,
                    CASE 
                        WHEN c.CustomerID IS NOT NULL THEN ISNULL((SELECT COUNT(*) FROM Orders o WHERE o.CustomerID = c.CustomerID), 0)
                        ELSE 0 
                    END AS TotalOrders,
                    CASE 
                        WHEN c.CustomerID IS NOT NULL THEN ISNULL((SELECT SUM(o.TotalAmount) FROM Orders o WHERE o.CustomerID = c.CustomerID), 0)
                        ELSE 0 
                    END AS TotalSpent,
                    CASE 
                        WHEN c.CustomerID IS NOT NULL THEN ISNULL((SELECT TOP 1 ISNULL(ca.HouseNumber, '') + ', ' + ISNULL(ca.Street, '') + ', ' + ISNULL(ca.Barangay, '') + ', ' + ISNULL(ca.City, '') + ', ' + ISNULL(ca.Province, '')
                               FROM CustomerAddresses ca 
                               WHERE ca.CustomerID = c.CustomerID 
                               ORDER BY ca.IsDefault DESC, ca.AddressID DESC), '')
                        ELSE '' 
                    END AS Address,
                    0 AS EmailVerified
                FROM Users u
                INNER JOIN Roles r ON u.RoleID = r.RoleID
                LEFT JOIN Customers c ON u.Email = c.Email
                WHERE 1=1
            `;

            const request = pool.request();

            if (type === 'customers') {
                query += ` AND r.RoleName = 'Customer'`;
            } else if (type === 'employees') {
                query += ` AND r.RoleName IN ('TransactionManager', 'InventoryManager', 'UserManager', 'OrderSupport', 'Employee')`;
            } else if (type === 'admins') {
                query += ` AND r.RoleName = 'Admin'`;
            }

            if (role && role.trim() !== '') {
                query += ` AND r.RoleName = @role`;
                request.input('role', sql.NVarChar, role.trim());
            }

            if (status === 'active') {
                query += ` AND u.IsActive = 1`;
            } else if (status === 'inactive') {
                query += ` AND u.IsActive = 0`;
            }

            if (search && search.trim() !== '') {
                query += ` AND (u.FullName LIKE @search OR u.Email LIKE @search OR r.RoleName LIKE @search)`;
                request.input('search', sql.NVarChar, `%${search.trim()}%`);
            }

            if (dateFrom && dateFrom.trim() !== '') {
                query += ` AND CAST(u.CreatedAt AS DATE) >= @dateFrom`;
                request.input('dateFrom', sql.Date, dateFrom);
            }

            if (dateTo && dateTo.trim() !== '') {
                query += ` AND CAST(u.CreatedAt AS DATE) <= @dateTo`;
                request.input('dateTo', sql.Date, dateTo);
            }

            query += ` ORDER BY u.CreatedAt DESC`;

            const result = await request.query(query);

            // Debug: Log the results to see what we're getting
            console.log('Masterlist Report - Total records:', result.recordset.length);
            console.log('Masterlist Report - Role names:', [...new Set(result.recordset.map(r => r.RoleName))]);

            // Also fetch customers directly from Customers table (in case they don't have User records)
            let customersQuery = `
                SELECT 
                    ISNULL(c.CustomerID, 0) AS CustomerID,
                    ISNULL(c.FullName, '') AS FullName,
                    ISNULL(c.Email, '') AS Email,
                    ISNULL(c.PhoneNumber, '') AS PhoneNumber,
                    ISNULL((SELECT COUNT(*) FROM Orders o WHERE o.CustomerID = c.CustomerID), 0) AS TotalOrders,
                    ISNULL((SELECT SUM(o.TotalAmount) FROM Orders o WHERE o.CustomerID = c.CustomerID), 0) AS TotalSpent,
                    ISNULL((SELECT TOP 1 ISNULL(ca.HouseNumber, '') + ', ' + ISNULL(ca.Street, '') + ', ' + ISNULL(ca.Barangay, '') + ', ' + ISNULL(ca.City, '') + ', ' + ISNULL(ca.Province, '')
                           FROM CustomerAddresses ca 
                           WHERE ca.CustomerID = c.CustomerID 
                           ORDER BY ca.IsDefault DESC, ca.AddressID DESC), '') AS Address,
                    CASE WHEN EXISTS(SELECT 1 FROM Users u WHERE u.Email = c.Email) THEN 1 ELSE 0 END AS HasUserRecord,
                    (SELECT u.IsActive FROM Users u WHERE u.Email = c.Email) AS IsActive,
                    (SELECT u.CreatedAt FROM Users u WHERE u.Email = c.Email) AS CreatedAt,
                    (SELECT u.LastLogin FROM Users u WHERE u.Email = c.Email) AS LastLogin
                FROM Customers c
                WHERE 1=1
            `;

            const customersRequest = pool.request();

            if (search && search.trim() !== '') {
                customersQuery += ` AND (c.FullName LIKE @searchCustomers OR c.Email LIKE @searchCustomers)`;
                customersRequest.input('searchCustomers', sql.NVarChar, `%${search.trim()}%`);
            }

            if (status === 'active') {
                customersQuery += ` AND EXISTS(SELECT 1 FROM Users u WHERE u.Email = c.Email AND u.IsActive = 1)`;
            } else if (status === 'inactive') {
                customersQuery += ` AND (NOT EXISTS(SELECT 1 FROM Users u WHERE u.Email = c.Email) OR EXISTS(SELECT 1 FROM Users u WHERE u.Email = c.Email AND u.IsActive = 0))`;
            }

            if (dateFrom && dateFrom.trim() !== '') {
                customersQuery += ` AND EXISTS(SELECT 1 FROM Users u WHERE u.Email = c.Email AND CAST(u.CreatedAt AS DATE) >= @dateFromCustomers)`;
                customersRequest.input('dateFromCustomers', sql.Date, dateFrom);
            }

            if (dateTo && dateTo.trim() !== '') {
                customersQuery += ` AND EXISTS(SELECT 1 FROM Users u WHERE u.Email = c.Email AND CAST(u.CreatedAt AS DATE) <= @dateToCustomers)`;
                customersRequest.input('dateToCustomers', sql.Date, dateTo);
            }

            customersQuery += ` ORDER BY c.CustomerID DESC`;

            let customersFromTable = [];
            try {
                const customersResult = await customersRequest.query(customersQuery);
                customersFromTable = customersResult.recordset.map(c => ({
                    CustomerID: c.CustomerID || 0,
                    FullName: c.FullName || '',
                    Email: c.Email || '',
                    PhoneNumber: c.PhoneNumber || '',
                    RoleName: 'Customer',
                    IsActive: c.IsActive !== null ? (c.IsActive === 1 || c.IsActive === true ? 1 : 0) : 1,
                    CreatedAt: c.CreatedAt || new Date(),
                    LastLogin: c.LastLogin || null,
                    TotalOrders: c.TotalOrders || 0,
                    TotalSpent: c.TotalSpent || 0,
                    Address: c.Address || '',
                    EmailVerified: 0
                }));
                console.log('Masterlist Report - Customers from Customers table:', customersFromTable.length);
            } catch (customersErr) {
                console.error('Error fetching customers from Customers table:', customersErr);
            }

            // Separate users and customers from Users table
            const users = result.recordset.filter(u => u.RoleName && u.RoleName !== 'Customer');
            const customersFromUsers = result.recordset.filter(u => u.RoleName && u.RoleName === 'Customer');

            // Combine customers from both sources, but prioritize Users table (deduplicate by Email)
            const customerEmails = new Set(customersFromUsers.map(c => c.Email));
            const additionalCustomers = customersFromTable.filter(c => !customerEmails.has(c.Email));
            const customers = [...customersFromUsers, ...additionalCustomers];

            console.log('Masterlist Report - Users count:', users.length);
            console.log('Masterlist Report - Customers from Users table:', customersFromUsers.length);
            console.log('Masterlist Report - Additional customers from Customers table:', additionalCustomers.length);
            console.log('Masterlist Report - Total customers count:', customers.length);

            // Fetch product categories breakdown for masterlist report
            let categoriesQuery = `
                SELECT 
                    ISNULL(p.Category, 'Uncategorized') AS CategoryName,
                    COUNT(*) AS ProductCount,
                    SUM(CASE WHEN p.IsActive = 1 THEN 1 ELSE 0 END) AS ActiveProducts,
                    SUM(CASE WHEN p.IsActive = 0 THEN 1 ELSE 0 END) AS InactiveProducts,
                    SUM(ISNULL(p.StockQuantity, 0)) AS TotalStock,
                    SUM(ISNULL(p.StockQuantity, 0) * ISNULL(p.Price, 0)) AS CategoryValue
                FROM Products p
                GROUP BY ISNULL(p.Category, 'Uncategorized')
                ORDER BY ProductCount DESC
            `;

            let categoriesBreakdown = [];
            try {
                const categoriesResult = await pool.request().query(categoriesQuery);
                categoriesBreakdown = categoriesResult.recordset;
            } catch (categoriesErr) {
                console.error('Error fetching categories breakdown:', categoriesErr);
            }

            // Fetch masterlist summary for masterlist report
            let masterlistQuery = `
                SELECT 
                    r.RoleName,
                    COUNT(*) AS TotalCount,
                    SUM(CASE WHEN u.IsActive = 1 THEN 1 ELSE 0 END) AS ActiveCount,
                    SUM(CASE WHEN u.IsActive = 0 THEN 1 ELSE 0 END) AS InactiveCount
                FROM Users u
                INNER JOIN Roles r ON u.RoleID = r.RoleID
                GROUP BY r.RoleName
                ORDER BY r.RoleName
            `;

            let masterlistSummary = [];
            try {
                const masterlistResult = await pool.request().query(masterlistQuery);
                masterlistSummary = masterlistResult.recordset;
            } catch (masterlistErr) {
                console.error('Error fetching masterlist summary:', masterlistErr);
            }

            // Calculate stats
            const stats = {
                totalUsers: result.recordset.length,
                totalCustomers: customers.length,
                totalEmployees: users.filter(u => ['TransactionManager', 'InventoryManager', 'UserManager', 'OrderSupport', 'Employee', 'Admin'].includes(u.RoleName)).length,
                activeUsers: result.recordset.filter(u => u.IsActive === 1 || u.IsActive === true).length,
                activeCustomers: customers.filter(u => u.IsActive === 1 || u.IsActive === true).length,
                activeEmployees: users.filter(u => u.IsActive === 1 || u.IsActive === true).length
            };

            res.json({ success: true, users, customers, categoriesBreakdown, masterlistSummary, stats });
        } catch (err) {
            console.error('Error fetching masterlist report:', err);
            res.status(500).json({ success: false, error: err.message, details: err.toString() });
        }
    });

    // Masterlist Report CSV Export
    router.get('/Employee/Admin/Reports/Masterlist/Export', isAuthenticated, async (req, res) => {
        try {
            await pool.connect();
            
            // Import the complete masterlist report export handler
            const { handleMasterlistReportExport } = require('../../utils/masterlistReportExportHandler');
            await handleMasterlistReportExport(pool, sql, req.query, res, { createExcelTitle, createExcelSectionHeader, createExcelHeaderRow, getExcelJS });
        } catch (err) {
            console.error('Error exporting masterlist report:', err);
            res.status(500).send('Error exporting masterlist report');
        }
    });
};
