const fs = require('fs');
const path = require('path');

const files = [
  'TransactionManager/TransactionVariations.ejs',
  'InventoryManager/InventoryVariations.ejs',
  'OrderSupport/OrderVariations.ejs',
  'UserManager/UserVariations.ejs',
];

const root = path.join(__dirname, '../views/Employee');
const re = /<div class="sidebar">[\s\S]*?<\/div>\s*<div class="main-content">/;
const repl = `<div class="sidebar">
            <%- include('partials/sidebar', { activePage: 'inventory' }) %>
        </div>
        <div class="main-content">`;

for (const f of files) {
  const p = path.join(root, f);
  let c = fs.readFileSync(p, 'utf8');
  if (!re.test(c)) {
    console.log('no match:', f);
    continue;
  }
  c = c.replace(re, repl);
  fs.writeFileSync(p, c);
  console.log('fixed:', f);
}
