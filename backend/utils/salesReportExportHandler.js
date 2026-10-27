/**
 * Sales Report Export Handler
 * Handles sales report Excel/CSV export
 */

const { handleSalesReportData } = require('./salesReportDataHandler');
const { buildSalesReportExportSummaryRows } = require('./salesReportMetrics');

async function handleSalesReportExport(pool, sql, queryParams, res) {
    // Get report data
    const reportData = await handleSalesReportData(pool, sql, queryParams);
    
    if (!reportData.success) {
        throw new Error('Failed to fetch sales report data');
    }

    const { orders, stats } = reportData;

    // Build CSV
    const summaryRows = buildSalesReportExportSummaryRows(stats);
    
    let csvContent = 'Sales Report\n\n';
    csvContent += 'Summary\n';
    csvContent += 'Metric,Value\n';
    
    summaryRows.forEach(row => {
        const value = row.currency ? `₱${parseFloat(row.value || 0).toFixed(2)}` : (row.value || 0);
        csvContent += `"${row.label}",${value}\n`;
    });
    
    csvContent += '\n\nOrders\n';
    csvContent += 'Reference,Date,Customer,Status,Payment Method,Amount\n';
    
    orders.forEach(order => {
        const date = new Date(order.OrderDate).toLocaleDateString();
        const amount = parseFloat(order.TotalAmount || 0).toFixed(2);
        csvContent += `"${order.ReferenceNumber}","${date}","${order.CustomerName}","${order.Status}","${order.PaymentMethod}",₱${amount}\n`;
    });

    // Set headers and send
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=sales-report-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csvContent);
}

module.exports = {
    handleSalesReportExport
};
