'use strict';

const BOM_STOP_WORDS = new Set(['KIT', 'SET', 'PACK', 'BUNDLE', 'THE', 'A', 'AN', 'AND', 'OR', 'FOR']);

/**
 * 2–3 letter code from material name for SKU (e.g. "Wood Plank Oak" -> WPO)
 * @param {string} materialName
 * @returns {string}
 */
function lettersFromMaterialName(materialName) {
    const words = String(materialName || '')
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 0 && !BOM_STOP_WORDS.has(w));

    if (words.length >= 2) {
        const a = words[0];
        const b = words[1];
        return (a.charAt(0) + b.charAt(0) + (b.charAt(1) || a.charAt(1) || 'X')).substring(0, 3);
    }
    if (words.length === 1) {
        return words[0].substring(0, 3).padEnd(3, 'X');
    }
    return 'MAT';
}

/**
 * Raw material SKU: RM-WPO-00019
 * @param {number} materialId
 * @param {string} [materialName]
 * @returns {string}
 */
function generateRawMaterialSKU(materialId, materialName) {
    const letters = lettersFromMaterialName(materialName);
    const padded = String(materialId).padStart(5, '0');
    return `RM-${letters}-${padded}`;
}

/**
 * Derive short slug from bundle name for BOM code (e.g. "Executive Office Chair Kit" -> CHAIR)
 * @param {string} bundleName
 * @returns {string}
 */
function slugForBomCode(bundleName) {
    const words = String(bundleName || '')
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 0);

    const significant = words.filter((w) => !BOM_STOP_WORDS.has(w));
    const pick = significant.length ? significant[significant.length - 1] : (words[0] || 'BUNDLE');
    return pick.substring(0, 16) || 'BUNDLE';
}

/**
 * BOM bundle code: BOM-CHAIR-001
 * @param {number} bundleId
 * @param {string} bundleName
 * @returns {string}
 */
function generateBomBundleCode(bundleId, bundleName) {
    const slug = slugForBomCode(bundleName);
    const padded = String(bundleId).padStart(3, '0');
    return `BOM-${slug}-${padded}`;
}

module.exports = {
    generateRawMaterialSKU,
    lettersFromMaterialName,
    slugForBomCode,
    generateBomBundleCode
};
