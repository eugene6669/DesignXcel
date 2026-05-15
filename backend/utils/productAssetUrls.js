'use strict';

const { isAzureBlobConfigured, getBlobPublicUrl } = require('./azureBlobStorage');

/**
 * When true: new product files go to Azure Blob; API rewrites /uploads/... to public blob URLs.
 * When false: files go to backend/public/uploads (disk); API keeps /uploads/... for the Express static route.
 *
 * Rules:
 * - Azure not configured → always local disk.
 * - USE_LOCAL_PRODUCT_ASSETS=true → force local disk + /uploads URLs (even if Azure env vars exist).
 * - USE_AZURE_BLOB_FOR_PRODUCTS=true → force Azure when configured (e.g. staging tests).
 * - Else NODE_ENV === 'production' → Azure when configured.
 */
function isAzureProductAssetMode() {
    if (!isAzureBlobConfigured()) return false;
    const local = process.env.USE_LOCAL_PRODUCT_ASSETS === 'true' || process.env.USE_LOCAL_PRODUCT_ASSETS === '1';
    if (local) return false;
    const forceAzure = process.env.USE_AZURE_BLOB_FOR_PRODUCTS === 'true' || process.env.USE_AZURE_BLOB_FOR_PRODUCTS === '1';
    if (forceAzure) return true;
    return process.env.NODE_ENV === 'production';
}

/**
 * Strip accidental "public" prefix and normalize slashes.
 */
function sanitizeRelativeUploadPath(url) {
    if (!url || typeof url !== 'string') return url;
    let u = url.trim();
    if (!u) return u;
    u = u.replace(/\\/g, '/');
    if (u.toLowerCase().startsWith('public/uploads/')) {
        u = `/uploads/${u.slice('public/uploads/'.length)}`;
    } else if (u.toLowerCase().startsWith('/public/uploads/')) {
        u = `/uploads/${u.slice('/public/uploads/'.length)}`;
    } else if (!u.startsWith('/') && u.toLowerCase().startsWith('uploads/')) {
        u = `/${u}`;
    }
    return u;
}

/**
 * Legacy bug: some rows store /uploads/products/<file>.jpg while files live under products/images/.
 */
function fixLegacyFlatProductUploadPath(u) {
    if (!u || typeof u !== 'string') return u;
    if (/^\/uploads\/products\/[^/]+\.(jpe?g|png|gif|webp|svg)$/i.test(u)) {
        return u.replace(/^\/uploads\/products\//, '/uploads/products/images/');
    }
    return u;
}

/**
 * Public URL for a multer file (disk or Azure custom storage).
 * @param {import('multer').File} file
 */
function publicUrlFromMulterProductFile(file) {
    if (!file) return null;
    if (file.destination === 'azure-blob' && file.path) {
        return getBlobPublicUrl(String(file.path).replace(/\\/g, '/')) || null;
    }
    const field = file.fieldname || '';
    let sub = 'images';
    if (field.startsWith('thumbnail') || field === 'thumbnails') sub = 'thumbnails';
    else if (field === 'model3d') sub = 'models';
    else if (field === 'inventoryImage' || field === 'productImage') sub = 'inventory';
    else if (field === 'image') sub = 'images';
    return `/uploads/products/${sub}/${file.filename}`;
}

/**
 * Normalize a single stored image/model URL for API consumers (catalog, detail, etc.).
 */
function normalizeProductAssetUrl(url) {
    if (url == null || url === '') return url;
    let u = sanitizeRelativeUploadPath(String(url).trim());
    if (!u) return url;

    if (u.startsWith('http://') || u.startsWith('https://')) {
        return u;
    }

    u = fixLegacyFlatProductUploadPath(u);

    if (u.startsWith('/uploads/') && isAzureProductAssetMode()) {
        const blobPath = u.replace(/^\/uploads\//, '');
        const azureUrl = getBlobPublicUrl(blobPath);
        if (azureUrl) return azureUrl;
    }

    return u;
}

function normalizeThumbnailList(raw) {
    if (raw == null || raw === '') return [];
    if (Array.isArray(raw)) {
        return raw.map((t) => normalizeProductAssetUrl(t)).filter(Boolean);
    }
    const str = String(raw).trim();
    if (!str) return [];
    let arr = [];
    try {
        const parsed = JSON.parse(str);
        arr = Array.isArray(parsed) ? parsed : typeof parsed === 'string' && parsed ? [parsed] : [];
    } catch {
        arr = str.includes(',') ? str.split(',').map((s) => s.trim()).filter(Boolean) : [str];
    }
    return arr.map((t) => normalizeProductAssetUrl(t)).filter(Boolean);
}

/**
 * Apply URL normalization to product-shaped objects from SQL (images, thumbnails, model3d).
 */
function mapProductRecordAssetUrls(product) {
    if (!product) return product;
    const next = { ...product };

    const mainImg = next.images ?? next.ImageURL;
    if (typeof mainImg === 'string') {
        next.images = mainImg ? [normalizeProductAssetUrl(mainImg)] : [];
    } else if (Array.isArray(mainImg)) {
        next.images = mainImg.map((x) => normalizeProductAssetUrl(x)).filter(Boolean);
    } else if (mainImg) {
        next.images = [normalizeProductAssetUrl(mainImg)];
    } else {
        next.images = [];
    }

    if (next.thumbnails != null) {
        next.thumbnails = normalizeThumbnailList(next.thumbnails);
    } else {
        next.thumbnails = [];
    }

    const rawModel =
        next.model3d ??
        next.Model3DURL ??
        next.Model3D ??
        next.model3DURL ??
        next.model_3d;
    if (rawModel != null && String(rawModel).trim() !== '') {
        const normalized = normalizeProductAssetUrl(String(rawModel).trim());
        next.model3d = normalized;
        next.model3DURL = normalized;
        next.Model3D = normalized;
    }

    return next;
}

module.exports = {
    isAzureProductAssetMode,
    normalizeProductAssetUrl,
    normalizeThumbnailList,
    mapProductRecordAssetUrls,
    publicUrlFromMulterProductFile,
    sanitizeRelativeUploadPath,
    fixLegacyFlatProductUploadPath
};
