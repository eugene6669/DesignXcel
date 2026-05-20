from pathlib import Path

src = Path(r'c:\Users\user\Downloads\DesignXcel\backend\views\Employee\Admin\AdminProducts.ejs').read_text(encoding='utf-8')
out = src
out = out.replace('Products - Design Excellence', 'Product Returns - Design Excellence')
out = out.replace('page-products-listing', 'page-product-returns')
out = out.replace('<h2>Products</h2>', '<h2>Product Returns</h2>')
out = out.replace(
    'All products and variations. Manage returns and stock status on <a href="/Employee/Admin/ProductReturns">Product Returns</a>.',
    'Products and variations with returned, damaged, repaired, or disposed stock. Edit status here.'
)
out = out.replace('action="/Employee/Admin/Products"', 'action="/Employee/Admin/ProductReturns"')
out = out.replace("return '/Employee/Admin/Products?'", "return '/Employee/Admin/ProductReturns?'")
out = out.replace("activePage: 'products'", "activePage: 'product-returns'")
out = out.replace("listBaseUrl: '/Employee/Admin/Products'", "listBaseUrl: '/Employee/Admin/ProductReturns'")
out = out.replace('showReturnColumns: false', 'showReturnColumns: true')
out = out.replace('showActions: true', 'showActions: true')  # noop
out = out.replace('showActions: false', 'showActions: true')
out = out.replace('productsListingPanel', 'productReturnsPanel')
out = out.replace('.page-products-listing ', '.page-product-returns ')
if 'edit-variation-status-modal' not in out:
    out = out.replace(
        '<script src="/js/Employee/Admin/product-inventory.js',
        "<%- include('partials/edit-variation-status-modal') %>\n    <script src=\"/js/Employee/Admin/product-inventory.js"
    )
Path(r'c:\Users\user\Downloads\DesignXcel\backend\views\Employee\Admin\AdminProductReturns.ejs').write_text(out, encoding='utf-8')
print('done')
