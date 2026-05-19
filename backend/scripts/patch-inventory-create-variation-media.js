const fs = require('fs');
const p = require('path').join(__dirname, '../views/Employee/Admin/AdminProductInventory.ejs');
let s = fs.readFileSync(p, 'utf8');

s = s.replace(
    /\s*<div class="form-group">\s*<label for="productImage">Product Image:<\/label>[\s\S]*?<\/motion.div>\s*\n\s*<div class="form-group">\s*<label>Dimensions:/,
    '\n                            <div class="form-group">\n                                <label>Dimensions:'
);
// fix if motion.div wasn't there
s = s.replace(
    /\s*<div class="form-group">\s*<label for="productImage">Product Image:<\/label>[\s\S]*?<\/div>\s*\n\s*<motion.div class="form-group">[\s\S]*?<\/motion.div>\s*\n\s*<div class="form-group">\s*<label>Dimensions:/,
    '\n                            <div class="form-group">\n                                <label>Dimensions:'
);
s = s.replace(
    /\s*<motion.div class="form-group">\s*<label for="productImage">[\s\S]*?<\/motion.div>\s*\n\s*<motion.div class="form-group">\s*<label for="productModel3d">[\s\S]*?<\/motion.div>\s*\n\s*<div class="form-group">\s*<label>Dimensions:/,
    '\n                            <div class="form-group">\n                                <label>Dimensions:'
);
// simpler two-step
s = s.replace(
    /<div class="form-group">\s*<label for="productImage">Product Image:<\/label>[\s\S]*?<div id="addInventoryProductImagePreview"[^>]*><\/div>\s*<\/div>\s*<div class="form-group">\s*<label for="productModel3d">3D Model \(GLB \/ GLTF\):<\/label>[\s\S]*?<\/div>\s*/,
    ''
);

const newRowBuilder = `            row.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 70px 90px 1fr 1fr 36px; gap: 8px; align-items: start; margin-bottom: 14px; padding-bottom: 14px; border-bottom: 1px solid #e9ecef;';
            row.innerHTML = \`
                <motion.div>
                    <label style="font-size: 0.85em;">Variation Name</label>
                    <input type="text" class="create-variation-name" required placeholder="e.g. Red" style="width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;">
                </motion.div>
                <motion.div>
                    <label style="font-size: 0.85em;">Color</label>
                    <input type="text" class="create-variation-color" placeholder="e.g. Red" style="width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;">
                </motion.div>
                <motion.div>
                    <label style="font-size: 0.85em;">Quantity</label>
                    <input type="number" class="create-variation-quantity" min="1" value="1" required style="width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;">
                </motion.div>
                <motion.div>
                    <label style="font-size: 0.85em;">Price (₱)</label>
                    <input type="number" class="create-variation-price" step="0.01" min="0" placeholder="0.00" style="width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;">
                </motion.div>
                <motion.div>
                    <label style="font-size: 0.85em;">Thumbnails (up to 4)</label>
                    <input type="file" class="create-variation-thumbnails" accept="image/*" multiple style="width: 100%; font-size: 0.8em;">
                    <small style="color:#888;font-size:0.75em;display:block;margin-top:2px;">First image = main storefront image</small>
                </motion.div>
                <motion.div>
                    <label style="font-size: 0.85em;">3D Model (GLB/GLTF)</label>
                    <input type="file" class="create-variation-model3d" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" style="width: 100%; font-size: 0.8em;">
                </motion.div>
                <button type="button" class="remove-create-variation-btn" title="Remove" style="background: #dc3545; color: white; border: none; border-radius: 4px; height: 34px; cursor: pointer; margin-top: 18px;">×</button>
            \`;`;

s = s.replace(
    /row\.style\.cssText = 'display: grid; grid-template-columns: 1fr 1fr 70px 90px minmax\(120px, 1fr\) 36px;[\s\S]*?cursor: pointer;">×<\/button>\s*`;/,
    newRowBuilder.replace(/motion\.div/g, 'motion.div') // keep as div
);
// fix motion.div typo in script - use div
const newRowBuilderDiv = newRowBuilder.replace(/motion\.motion.div/g, 'div').replace(/<motion\.motion.div>/g, '<div>').replace(/<\/motion\.motion.div>/g, '</div>');
s = s.replace(
    /row\.style\.cssText = 'display: grid; grid-template-columns: 1fr 1fr 70px 90px minmax\(120px, 1fr\) 36px;[\s\S]*?cursor: pointer;">×<\/button>\s*`;/,
    newRowBuilderDiv.replace(/motion\.motion.div/g, 'motion.div').replace(/<motion\.div>/g, '<div>').replace(/<\/motion\.motion.div>/g, '</div>')
);

// simpler replace for row builder - read file and do line-based
const startMarker = "row.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 70px 90px minmax(120px, 1fr) 36px;";
const endMarker = "row.querySelector('.remove-create-variation-btn').addEventListener('click'";
const startIdx = s.indexOf(startMarker);
const endIdx = s.indexOf(endMarker);
if (startIdx >= 0 && endIdx > startIdx) {
    const replacement = `row.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 70px 90px 1fr 1fr 36px; gap: 8px; align-items: start; margin-bottom: 14px; padding-bottom: 14px; border-bottom: 1px solid #e9ecef;';
            row.innerHTML = \`
                <div>
                    <label style="font-size: 0.85em;">Variation Name</label>
                    <input type="text" class="create-variation-name" required placeholder="e.g. Red" style="width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;">
                </div>
                <div>
                    <label style="font-size: 0.85em;">Color</label>
                    <input type="text" class="create-variation-color" placeholder="e.g. Red" style="width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;">
                </div>
                <div>
                    <label style="font-size: 0.85em;">Quantity</label>
                    <input type="number" class="create-variation-quantity" min="1" value="1" required style="width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;">
                </div>
                <div>
                    <label style="font-size: 0.85em;">Price (₱)</label>
                    <input type="number" class="create-variation-price" step="0.01" min="0" placeholder="0.00" style="width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;">
                </div>
                <div>
                    <label style="font-size: 0.85em;">Thumbnails (up to 4)</label>
                    <input type="file" class="create-variation-thumbnails" accept="image/*" multiple style="width: 100%; font-size: 0.8em;">
                    <small style="color:#888;font-size:0.75em;display:block;margin-top:2px;">First image = main storefront image</small>
                </div>
                <div>
                    <label style="font-size: 0.85em;">3D Model (GLB/GLTF)</label>
                    <input type="file" class="create-variation-model3d" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" style="width: 100%; font-size: 0.8em;">
                </div>
                <button type="button" class="remove-create-variation-btn" title="Remove" style="background: #dc3545; color: white; border: none; border-radius: 4px; height: 34px; cursor: pointer; margin-top: 18px;">×</button>
            \`;
            `;
    s = s.slice(0, startIdx) + replacement + s.slice(endIdx);
}

s = s.replace(
    /variations\.push\(\{\s*variationName: name,\s*color: row\.querySelector\('\.create-variation-color'\)[\s\S]*?price: row\.querySelector\('\.create-variation-price'\)\?\.value \|\| ''\s*\}\);/,
    `const thumbInput = row.querySelector('.create-variation-thumbnails');
                const modelInput = row.querySelector('.create-variation-model3d');
                const thumbFiles = thumbInput?.files ? Array.from(thumbInput.files).slice(0, 4) : [];
                variations.push({
                    variationName: name,
                    color: row.querySelector('.create-variation-color')?.value?.trim() || '',
                    quantity,
                    price: row.querySelector('.create-variation-price')?.value || '',
                    thumbCount: thumbFiles.length,
                    hasModel3d: !!(modelInput?.files?.length)
                });`
);

s = s.replace(
    /document\.querySelectorAll\('#createProductVariationsList \.create-product-variation-row'\)\.forEach\(\(row\) => \{\s*const fileInput = row\.querySelector\('\.create-variation-image'\);\s*if \(fileInput\?\.files\?\.\[0\]\) \{\s*formData\.append\('variationImage', fileInput\.files\[0\]\);\s*\}\s*\}\);/,
    `document.querySelectorAll('#createProductVariationsList .create-product-variation-row').forEach((row) => {
                    const thumbInput = row.querySelector('.create-variation-thumbnails');
                    if (thumbInput?.files?.length) {
                        Array.from(thumbInput.files).slice(0, 4).forEach((file) => {
                            formData.append('variationThumbnail', file);
                        });
                    }
                    const modelInput = row.querySelector('.create-variation-model3d');
                    if (modelInput?.files?.[0]) {
                        formData.append('variationModel3d', modelInput.files[0]);
                    }
                });`
);

fs.writeFileSync(p, s);
console.log('patched', !s.includes('productImage'), s.includes('create-variation-thumbnails'));
