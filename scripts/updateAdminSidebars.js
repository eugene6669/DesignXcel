const fs = require('fs');
const path = require('path');

const files = [
  { file: 'AdminCMS.ejs', key: 'cms' },
  { file: 'AdminCompletedOrders.ejs', key: 'orders-completed' },
  { file: 'AdminLogs.ejs', key: 'logs' },
  { file: 'AdminManager.ejs', key: 'dashboard' },
  { file: 'AdminManageUsers.ejs', key: 'manage-users' },
  { file: 'AdminMaterials.ejs', key: 'raw-materials' },
  { file: 'AdminOrdersDelivery.ejs', key: 'orders-delivery' },
  { file: 'AdminOrdersPending.ejs', key: 'orders-pending' },
  { file: 'AdminOrdersProcessing.ejs', key: 'orders-processing' },
  { file: 'AdminOrdersReceive.ejs', key: 'orders-receive' },
  { file: 'AdminOrdersShipping.ejs', key: 'orders-shipping' },
  { file: 'AdminRates.ejs', key: 'delivery-rates' },
  { file: 'AdminReviews.ejs', key: 'reviews' },
  { file: 'AdminSalesReport.ejs', key: 'sales-report' },
  { file: 'AdminVariations.ejs', key: 'variations' },
  { file: 'AdminWalkIn.ejs', key: 'walk-in' },
  { file: 'AdminProducts.ejs', key: 'products' },
  { file: 'AdminAlerts.ejs', key: 'alerts' },
  { file: 'AdminArchived.ejs', key: 'archived' },
  { file: 'AdminBulkOrders.ejs', key: 'bulk-orders' },
  { file: 'AdminCancelledOrders.ejs', key: 'orders-cancelled' },
  { file: 'AdminChatSupport.ejs', key: 'chat-support' }
];

const baseDir = path.join(__dirname, '..', 'backend', 'views', 'Employee', 'Admin');
const includeMarkup = (activeKey) => `
        <div class="sidebar">
            <%- include('partials/sidebar', { activePage: '${activeKey}' }) %>
        </div>
        <div class="main-content">`.trimStart();

files.forEach(({ file, key }) => {
  const target = path.join(baseDir, file);
  if (!fs.existsSync(target)) {
    console.warn(`Skipping missing file: ${file}`);
    return;
  }

  const original = fs.readFileSync(target, 'utf8');
  if (original.includes("partials/sidebar")) {
    console.log(`Already updated: ${file}`);
    return;
  }

  const pattern = /<div class="sidebar">[\s\S]*?<div class="main-content">/;
  const replacement = includeMarkup(key);

  if (!pattern.test(original)) {
    console.warn(`Pattern not found in ${file}, skipping.`);
    return;
  }

  const updated = original.replace(pattern, replacement);
  fs.writeFileSync(target, updated, 'utf8');
  console.log(`Updated sidebar in ${file}`);
});


