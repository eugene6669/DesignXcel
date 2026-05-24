'use strict';

const fs = require('fs');
const path = require('path');
const { isAzureBlobConfigured, getBlobPublicUrl, deleteBlobFromAzure, blobPathFromAssetUrl } = require('./azureBlobStorage');

const UPLOADS_ROOT = path.join(__dirname, '..', 'public', 'uploads');

/** @type {Record<string, string>} */
const INVENTORY_STORAGE_PATHS = {
    parentMain: 'Inventory/Main/Product Parent',
    variationMain: 'Inventory/Main/Product Variations',
    parentThumb: 'Inventory/thumbnails/Product Parent',
    variationThumb: 'Inventory/thumbnails/Product Variations',
    model: 'Inventory/Model'
};

/** @type {Record<string, string>} */
const PRODUCT_LISTING_STORAGE_PATHS = {
    parentMain: 'ProductListing/Main/Product Parent',
    variationMain: 'ProductListing/Main/Product Variations',
    parentThumb: 'ProductListing/thumbnails/Product Parent',
    variationThumb: 'ProductListing/thumbnails/Product Variation',
    model: 'ProductListing/Model'
};

/** All known relative prefixes (for legacy file resolution / delete). */
const ALL_PRODUCT_ASSET_PREFIXES = [
    ...Object.values(INVENTORY_STORAGE_PATHS),
    ...Object.values(PRODUCT_LISTING_STORAGE_PATHS),
    'products/images',
    'products/thumbnails',
    'products/models',
    'products/inventory',
    'products/3dmodels',
    'products',
    'variations'
];

/**
 * When true: new product files go to Azure Blob; API rewrites /uploads/... to public blob URLs.
 */
function isAzureProductAssetMode() {
    if (!isAzureBlobConfigured()) return false;
    const local = process.env.USE_LOCAL_PRODUCT_ASSETS === 'true' || process.env.USE_LOCAL_PRODUCT_ASSETS === '1';
    if (local) return false;
    const forceAzure = process.env.USE_AZURE_BLOB_FOR_PRODUCTS === 'true' || process.env.USE_AZURE_BLOB_FOR_PRODUCTS === '1';
    if (forceAzure) return true;
    return process.env.NODE_ENV === 'production';
}

function encodeUploadPathForHtml(pathStr) {
    if (!pathStr || typeof pathStr !== 'string') return pathStr;
    const trimmed = pathStr.trim();
    if (!trimmed || /^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:')) {
        return trimmed;
    }
    return trimmed.split('/').map((seg, i) => {
        if (!seg || i === 0) return seg;
        try {
            return encodeURIComponent(decodeURIComponent(seg));
        } catch (_) {
            return encodeURIComponent(seg);
        }
    }).join('/');
}

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
 * inventory = Product Inventory page; productListing = Admin Products (CMS catalog).
 */
function getUploadContext(req) {
    const p = String(req?.originalUrl || req?.url || '').toLowerCase();

    if (p.includes('/inventory-product-variations')) {
        const catalogOnly = req?.body?.catalogOnly === '1' || req?.body?.catalogOnly === true;
        return catalogOnly ? 'productListing' : 'inventory';
    }

    if (
        p.includes('/productinventory') ||
        p.includes('/inventory-products') ||
        p.includes('/inventoryproducts') ||
        p.includes('/inventoryvariations') ||
        p.includes('/addinventory') ||
        p.includes('update-inventory-quantity')
    ) {
        return 'inventory';
    }

    if (
        p.includes('/employee/admin/products') ||
        p.includes('/employee/admin/variations') ||
        p.includes('/transactionproducts') ||
        p.includes('/transactionvariations') ||
        p.includes('/userproducts') ||
        p.includes('/uservariations') ||
        p.includes('/orderproducts') ||
        p.includes('/ordervariations')
    ) {
        return 'productListing';
    }

    return 'inventory';
}

function getStoragePathsForContext(context) {
    return context === 'productListing' ? PRODUCT_LISTING_STORAGE_PATHS : INVENTORY_STORAGE_PATHS;
}

/**
 * Relative path under uploads/ (no leading slash), e.g. Inventory/Main/Product Parent
 */
function getProductRelativeStoragePath(fieldname, req) {
    const field = String(fieldname || '');
    const paths = getStoragePathsForContext(getUploadContext(req));

    if (field === 'variationMainImage' || field === 'variationImage') {
        return paths.variationMain;
    }
    if (field === 'variationThumbnail' || field === 'variationThumbnails') {
        return paths.variationThumb;
    }
    if (
        field.startsWith('thumbnail') ||
        field === 'thumbnails' ||
        field === 'productThumbnail'
    ) {
        return paths.parentThumb;
    }
    if (field === 'model3d' || field === 'variationModel3d') {
        return paths.model;
    }
    if (
        field === 'productMainImage' ||
        field === 'productImage' ||
        field === 'inventoryImage' ||
        field === 'image'
    ) {
        return paths.parentMain;
    }
    return paths.parentMain;
}

function getProductAzureBlobPath(fieldname, finalName, req) {
    const rel = getProductRelativeStoragePath(fieldname, req);
    return `${rel}/${finalName}`;
}

function getProductMulterAbsoluteDir(fieldname, req) {
    const rel = getProductRelativeStoragePath(fieldname, req);
    return path.join(UPLOADS_ROOT, ...rel.split('/'));
}

function productUploadDiskPath(relativeUrl) {
    const publicRoot = path.join(__dirname, '..', 'public');
    return path.join(publicRoot, String(relativeUrl).replace(/^\//, '').replace(/\//g, path.sep));
}

function publicUrlFromMulterFile(file) {
    if (!file) return null;
    if (file.azureUrl) return file.azureUrl;

    if (file.destination === 'azure-blob' && file.path) {
        const blobPath = String(file.path).replace(/\\/g, '/');
        return getBlobPublicUrl(blobPath) || `/uploads/${blobPath}`;
    }

    if (file.destination && file.filename) {
        const abs = path.join(file.destination, file.filename);
        const rel = path.relative(UPLOADS_ROOT, abs).replace(/\\/g, '/');
        if (rel && !rel.startsWith('..')) {
            return `/uploads/${rel}`;
        }
    }
    return null;
}

function publicUrlFromMulterVariationFile(file) {
    return publicUrlFromMulterFile(file);
}

function publicUrlFromMulterProductFile(file) {
    return publicUrlFromMulterFile(file);
}

function fixLegacyFlatProductUploadPath(u) {
    if (!u || typeof u !== 'string') return u;
    if (/^\/uploads\/products\/[^/]+\.(jpe?g|png|gif|webp|svg|glb|gltf)$/i.test(u)) {
        return u.replace(/^\/uploads\/products\//, `/uploads/${INVENTORY_STORAGE_PATHS.parentMain}/`);
    }
    return u;
}

function buildProductAssetUrlCandidates(u) {
    if (!u || typeof u !== 'string') return [];
    const candidates = [sanitizeRelativeUploadPath(u)];
    const filename = u.split('/').pop();
    if (!filename) return candidates;

    const add = (candidate) => {
        const normalized = sanitizeRelativeUploadPath(candidate);
        if (normalized && candidates.indexOf(normalized) === -1) {
            candidates.push(normalized);
        }
    };

    for (const prefix of ALL_PRODUCT_ASSET_PREFIXES) {
        add(`/uploads/${prefix}/${filename}`);
    }

    return candidates;
}

function uploadUrlToBlobCandidates(url) {
    if (!url) return [];
    const relative = sanitizeRelativeUploadPath(String(url).trim());
    const fromAzure = blobPathFromAssetUrl(url);
    const seen = new Set();
    const out = [];

    const add = (blobPath) => {
        if (blobPath && !seen.has(blobPath)) {
            seen.add(blobPath);
            out.push(blobPath);
        }
    };

    if (fromAzure) add(fromAzure);
    for (const candidate of buildProductAssetUrlCandidates(relative || url)) {
        add(candidate.replace(/^\/uploads\//, ''));
    }
    if (relative && relative.startsWith('/uploads/')) {
        add(relative.replace(/^\/uploads\//, ''));
    }
    return out;
}

async function deleteProductAssetFile(imageUrl) {
    if (!imageUrl) return;

    try {
        const blobCandidates = uploadUrlToBlobCandidates(imageUrl);
        if (isAzureBlobConfigured()) {
            for (const blobPath of blobCandidates) {
                const deleted = await deleteBlobFromAzure(blobPath);
                if (deleted) {
                    console.log(`Deleted Azure blob: ${blobPath}`);
                    return;
                }
            }
        }

        if (!isAzureProductAssetMode()) {
            const relative = sanitizeRelativeUploadPath(String(imageUrl).trim());
            for (const candidate of buildProductAssetUrlCandidates(relative || imageUrl)) {
                const filePath = productUploadDiskPath(candidate);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                    console.log(`Deleted local file: ${filePath}`);
                    return;
                }
            }
        }
    } catch (error) {
        console.error(`Error deleting product asset ${imageUrl}:`, error);
    }
}

function resolveExistingLocalProductAssetPath(u) {
    if (!u || typeof u !== 'string') return u;
    if (u.startsWith('http://') || u.startsWith('https://') || isAzureProductAssetMode()) {
        return u;
    }
    for (const candidate of buildProductAssetUrlCandidates(u)) {
        try {
            if (fs.existsSync(productUploadDiskPath(candidate))) {
                return candidate;
            }
        } catch (_) {
            /* ignore */
        }
    }
    return u;
}

function normalizeProductAssetUrl(url) {
    if (url == null || url === '') return url;
    let u = sanitizeRelativeUploadPath(String(url).trim());
    if (!u) return url;

    if (u.startsWith('http://') || u.startsWith('https://')) {
        return u;
    }

    if (!isAzureProductAssetMode()) {
        return resolveExistingLocalProductAssetPath(u);
    }

    u = fixLegacyFlatProductUploadPath(u);
    const blobPath = u.replace(/^\/uploads\//, '');
    const azureUrl = getBlobPublicUrl(blobPath);
    return azureUrl || u;
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

    const rawThumbs = next.thumbnails ?? next.ThumbnailURLs ?? next.thumbnailURLs;
    if (rawThumbs != null && String(rawThumbs).trim() !== '') {
        next.thumbnails = normalizeThumbnailList(rawThumbs);
    } else {
        next.thumbnails = [];
    }
    delete next.ThumbnailURLs;
    delete next.thumbnailURLs;

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
    publicUrlFromMulterVariationFile,
    sanitizeRelativeUploadPath,
    encodeUploadPathForHtml,
    fixLegacyFlatProductUploadPath,
    getUploadContext,
    getProductRelativeStoragePath,
    getProductAzureBlobPath,
    getProductMulterAbsoluteDir,
    deleteProductAssetFile,
    buildProductAssetUrlCandidates,
    resolveExistingLocalProductAssetPath,
    INVENTORY_STORAGE_PATHS,
    PRODUCT_LISTING_STORAGE_PATHS
};
