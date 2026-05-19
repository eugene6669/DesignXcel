const fs = require('fs');
const p = require('path').join(__dirname, '../views/Employee/Admin/AdminProductInventory.ejs');
let s = fs.readFileSync(p, 'utf8');

const mediaHelper = `
        function appendVariationMediaToFormData(formData, rowOrForm) {
            const main = rowOrForm.querySelector?.('.variation-main-image') || rowOrForm.querySelector?.('#variationMainImage') || rowOrForm.querySelector?.('#editVariationStatusMainImage');
            const thumbs = rowOrForm.querySelector?.('.variation-thumbnails') || rowOrForm.querySelector?.('#variationThumbnails') || rowOrForm.querySelector?.('#editVariationStatusThumbnails');
            const model = rowOrForm.querySelector?.('.variation-model3d') || rowOrForm.querySelector?.('#variationModel3d') || rowOrForm.querySelector?.('#editVariationStatusModel3d');
            if (main?.files?.[0]) formData.append('variationMainImage', main.files[0]);
            if (thumbs?.files?.length) {
                Array.from(thumbs.files).slice(0, 4).forEach((file) => formData.append('variationThumbnail', file));
            }
            if (model?.files?.[0]) formData.append('variationModel3d', model.files[0]);
        }

        function renderVariationMediaPreviews(container, data) {
            if (!container) return;
            let html = '';
            if (data.mainImage) {
                html += '<p style="margin:4px 0;font-weight:600;">Main image</p><img src="' + data.mainImage + '" style="max-width:120px;max-height:120px;border-radius:4px;border:1px solid #ddd;margin-bottom:8px;">';
            }
            if (data.thumbnails && data.thumbnails.length) {
                html += '<p style="margin:4px 0;font-weight:600;">Thumbnails</p><motion.div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">';
                data.thumbnails.forEach((url) => {
                    html += '<img src="' + url + '" style="width:56px;height:56px;object-fit:cover;border-radius:4px;border:1px solid #ddd;">';
                });
                html += '</motion.div>';
            }
            if (data.model3d) {
                html += '<p style="margin:4px 0;font-size:0.85em;color:#666;">3D model: ' + data.model3d + '</p>';
            }
            container.innerHTML = html || '<em style="color:#888;">No media uploaded yet</em>';
        }

        function parseThumbnailUrls(raw) {
            if (!raw) return [];
            try {
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                return Array.isArray(parsed) ? parsed : [];
            } catch (e) {
                return String(raw).includes(',') ? raw.split(',').map((x) => x.trim()).filter(Boolean) : (raw ? [raw] : []);
            }
        }
`;

if (!s.includes('appendVariationMediaToFormData')) {
    s = s.replace('        function buildCreateProductVariationRow() {', mediaHelper + '\n        function buildCreateProductVariationRow() {');
}

// Fix create variation row
const createRowStart = s.indexOf("row.style.cssText = 'display: grid; grid-template-columns: 1fr 1fr 70px 90px 1fr 1fr 36px;");
if (createRowStart > 0) {
    const createRowEnd = s.indexOf("row.querySelector('.remove-create-variation-btn').addEventListener", createRowStart);
    const newRow = `row.style.cssText = 'display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; align-items: start; margin-bottom: 14px; padding: 12px; border: 1px solid #e9ecef; border-radius: 6px; background: #fff;';
            row.innerHTML = \`
                <div style="grid-column: span 2;">
                    <label style="font-size: 0.85em;">Variation Name</label>
                    <input type="text" class="create-variation-name" required placeholder="e.g. Red" style="width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;">
                </div>
                <motion.div>
                    <label style="font-size: 0.85em;">Color</label>
                    <input type="text" class="create-variation-color" placeholder="e.g. Red" style="width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;">
                </motion.div>
                <motion.div>
                    <label style="font-size: 0.85em;">Quantity</label>
                    <input type="number" class="create-variation-quantity" min="1" value="1" required style="width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;">
                </motion.div>
                <motion.div>
                    <label style="font-size: 0.85em;">Price (₱) <span style="color:#dc3545;">*</span></label>
                    <input type="number" class="create-variation-price" step="0.01" min="0" required placeholder="0.00" style="width: 100%; padding: 6px; border: 1px solid #ced4da; border-radius: 4px;">
                </motion.div>
                <div style="grid-column: span 2;">
                    <label style="font-size: 0.85em;">Main Image</label>
                    <input type="file" class="create-variation-main-image variation-main-image" accept="image/*" style="width: 100%; font-size: 0.8em;">
                </div>
                <div style="grid-column: span 2;">
                    <label style="font-size: 0.85em;">Thumbnails (up to 4)</label>
                    <input type="file" class="create-variation-thumbnails variation-thumbnails" accept="image/*" multiple style="width: 100%; font-size: 0.8em;">
                </div>
                <div style="grid-column: span 3;">
                    <label style="font-size: 0.85em;">3D Model (GLB/GLTF)</label>
                    <input type="file" class="create-variation-model3d variation-model3d" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" style="width: 100%; font-size: 0.8em;">
                </div>
                <div style="display:flex;align-items:end;justify-content:flex-end;">
                    <button type="button" class="remove-create-variation-btn" title="Remove" style="background: #dc3545; color: white; border: none; border-radius: 4px; height: 34px; width: 34px; cursor: pointer;">×</button>
                </div>
            \`;
            `.replace(/motion\.motion.div/g, 'div').replace(/<motion\.div>/g, '<motion.div>').replace(/<\/motion\.motion.div>/g, '</motion.div>');
    // fix motion.div typos in newRow
    const fixedRow = newRow.replace(/<motion\.div>/g, '<div>').replace(/<\/motion\.motion.div>/g, '</div>').replace(/motion\.motion.div/g, 'div');
    s = s.slice(0, createRowStart) + fixedRow + s.slice(createRowEnd);
}

// collectCreateProductVariations - add hasMainImage
s = s.replace(
    /const thumbInput = row\.querySelector\('\.create-variation-thumbnails'\);/,
    `const mainInput = row.querySelector('.create-variation-main-image');
                const thumbInput = row.querySelector('.create-variation-thumbnails');`
);
s = s.replace(
    /thumbCount: thumbFiles\.length,\s*hasModel3d: !!\(modelInput\?\.files\?\.length\)/,
    `thumbCount: thumbFiles.length,
                    hasMainImage: !!(mainInput?.files?.length),
                    hasModel3d: !!(modelInput?.files?.length)`
);

// create form submit - append main image
s = s.replace(
    /document\.querySelectorAll\('#createProductVariationsList \.create-product-variation-row'\)\.forEach\(\(row\) => \{[\s\S]*?formData\.append\('variationModel3d', modelInput\.files\[0\]\);\s*\}\s*\}\);/,
    `document.querySelectorAll('#createProductVariationsList .create-product-variation-row').forEach((row) => {
                    appendVariationMediaToFormData(formData, row);
                });`
);

// displayVariations - remove edit/delete buttons
s = s.replace(
    /\s*<div style="display: flex; gap: 5px;">\s*<button onclick="editVariation\([\s\S]*?<\/button>\s*<\/motion.div>\s*<\/motion.div>/,
    '</div></motion.div>'
);
s = s.replace(
    /\s*<div style="display: flex; gap: 5px;">\s*<button onclick="editVariation\([\s\S]*?<\/button>\s*<\/div>\s*<\/div>/,
    '</div></div>'
);

// add variation form HTML
s = s.replace(
    /<div style="margin-bottom: 10px;">\s*<label>Variation Image:<\/label>[\s\S]*?<\/div>\s*<button type="submit" style="background: #28a745;/,
    `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
                        <div>
                            <label for="variationMainImage">Main Image:</label>
                            <input type="file" id="variationMainImage" class="variation-main-image" name="variationMainImage" accept="image/*">
                        </div>
                        <div>
                            <label for="variationThumbnails">Thumbnails (up to 4):</label>
                            <input type="file" id="variationThumbnails" class="variation-thumbnails" name="variationThumbnails" accept="image/*" multiple>
                        </div>
                        <div style="grid-column: span 2;">
                            <label for="variationModel3d">3D Model (GLB/GLTF):</label>
                            <input type="file" id="variationModel3d" class="variation-model3d" name="variationModel3d" accept=".glb,.gltf,model/gltf-binary,model/gltf+json">
                        </motion.div>
                    </div>
                    <button type="submit" style="background: #28a745;`
).replace(/<\/motion\.motion.div>\s*<\/div>/g, '</div></div>').replace(/<motion\.div style="grid-column: span 2;">/g, '<div style="grid-column: span 2;">');

// add variation form submit
s = s.replace(
    /const formData = new FormData\(this\);\s*\n\s*\/\/ For ProductInventory page/,
    `const formData = new FormData(this);
                    appendVariationMediaToFormData(formData, this);
                    
                    // For ProductInventory page`
);

// edit variation status modal - add media section before recipe panel
s = s.replace(
    /<motion.div id="editVariationRecipePanel"/,
    `<div class="form-group" style="padding: 12px; background: #f8f9fa; border-radius: 6px; border: 1px solid #dee2e6; margin-bottom: 12px;">
                    <strong>Variation Media</strong>
                    <div id="editVariationStatusMediaPreview" style="margin: 8px 0;"></motion.div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px;">
                        <div>
                            <label for="editVariationStatusMainImage">Main Image</label>
                            <input type="file" id="editVariationStatusMainImage" accept="image/*">
                        </div>
                        <div>
                            <label for="editVariationStatusThumbnails">Thumbnails (up to 4)</label>
                            <input type="file" id="editVariationStatusThumbnails" accept="image/*" multiple>
                        </div>
                        <div style="grid-column: span 2;">
                            <label for="editVariationStatusModel3d">3D Model (GLB/GLTF)</label>
                            <input type="file" id="editVariationStatusModel3d" accept=".glb,.gltf,model/gltf-binary,model/gltf+json">
                        </div>
                    </div>
                </div>

                <div id="editVariationRecipePanel"`
).replace(/<\/motion\.motion.div>\s*<div style="display: grid/g, '<div style="display: grid')
 .replace(/<motion.div id="editVariationStatusMediaPreview" style="margin: 8px 0;"><\/motion.div>/g, '<div id="editVariationStatusMediaPreview" style="margin: 8px 0;"></div>');

// editVariationStatus - preview media
s = s.replace(
    /\/\/ Show current variation image if exists\s*const variationImagePreview = document\.getElementById\('editVariationStatusImagePreview'\);[\s\S]*?variationImagePreview\.innerHTML = '';\s*\}/,
    `const mediaPreview = document.getElementById('editVariationStatusMediaPreview');
                renderVariationMediaPreviews(mediaPreview, {
                    mainImage: variationData.VariationImageURL || null,
                    thumbnails: parseThumbnailUrls(variationData.ThumbnailURLs),
                    model3d: variationData.Model3D || null
                });`
);

// handleVariationStatusSubmit - append media, allow media-only save
s = s.replace(
    /formData\.append\('notes', notes \|\| ''\);\s*\n\s*console\.log\('Final quantities/,
    `formData.append('notes', notes || '');
                appendVariationMediaToFormData(formData, document.getElementById('editVariationStatusForm'));
                
                const hasMediaUpload = !!(document.getElementById('editVariationStatusMainImage')?.files?.length ||
                    document.getElementById('editVariationStatusThumbnails')?.files?.length ||
                    document.getElementById('editVariationStatusModel3d')?.files?.length);
                
                console.log('Final quantities`
);
s = s.replace(
    /if \(!quantitiesChanged && !selectedStatus\) \{\s*showCustomPopup\('No changes detected/,
    `if (!quantitiesChanged && !selectedStatus && !hasMediaUpload) {
                    showCustomPopup('No changes detected`
);

// Remove edit variation modal block
s = s.replace(/<!-- Edit Variation Modal -->[\s\S]*?<!-- Edit Variation Status Modal -->/, '<!-- Edit Variation Status Modal -->');

// Remove delete variation modal
s = s.replace(/<!-- Delete Variation Confirmation Modal -->[\s\S]*?<\/div>\s*<\/div>\s*\n\s*<\/body>/, '\n</body>');

// Fix motion.div in renderVariationMediaPreviews if inserted
s = s.replace(/<motion\.div style="display:flex/g, '<motion.div style="display:flex').replace(/<motion\.motion.div/g, '<motion.div');

fs.writeFileSync(p, s);
console.log('patched', {
    hasMainImage: s.includes('create-variation-main-image'),
    noEditVariationModal: !s.includes('id="editVariationModal"'),
    hasStatusMedia: s.includes('editVariationStatusMainImage')
});
