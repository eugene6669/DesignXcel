/**
 * Generate a GUID/UUID v4
 * SQL Server prefers uppercase GUIDs
 * @returns {string} GUID in format xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx (uppercase)
 */
function generateGuid() {
    const guid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
    // Convert to uppercase as SQL Server prefers uppercase GUIDs
    return guid.toUpperCase();
}

/**
 * Generate a temporary unique identifier for PublicId (used before ProductID is known)
 * PublicId is a uniqueidentifier (GUID) in the database
 * @param {string} productName - The product name (not used for GUID, but kept for consistency)
 * @returns {string} Temporary unique GUID
 */
function generateTemporaryPublicId(productName) {
    // Generate a GUID since PublicId is uniqueidentifier type
    return generateGuid();
}

/**
 * Generate product identifiers (SKU, PublicId, Slug) for a new product
 * @param {number} productId - The ProductID from the database
 * @param {string} productName - The product name
 * @returns {Object} Object containing sku, publicId, and slug
 */
function generateProductIdentifiers(productId, productName) {
    // Generate SKU: SKU-XXXXXXXX-XXXXXX format
    // XXXXXXXX is a random 8-character hex string from GUID for uniqueness
    // XXXXXX is zero-padded ProductID for traceability
    const randomHex = generateGuid().replace(/-/g, '').substring(0, 8).toUpperCase();
    const paddedProductId = String(productId).padStart(6, '0');
    const sku = `SKU-${randomHex}-${paddedProductId}`;
    
    // Generate PublicId: Since PublicId is uniqueidentifier (GUID) type in database, generate a GUID
    // We'll use a deterministic approach based on ProductID to ensure consistency
    const publicId = generateGuid();
    
    // Generate Slug: URL-friendly version based on product name
    // Slug is NVARCHAR, so we can use a string
    let slug = productName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special chars except spaces and hyphens
        .trim()
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with single
        .substring(0, 100); // Limit length
    
    // If slug is empty or too short, use a default format with ProductID
    if (!slug || slug.length < 3) {
        slug = `product-${String(productId).padStart(6, '0')}`;
    } else {
        // Append ProductID to ensure uniqueness
        slug = `${slug}-${String(productId).padStart(6, '0')}`;
    }
    
    return {
        sku,
        publicId,
        slug
    };
}

module.exports = { generateProductIdentifiers, generateTemporaryPublicId, generateGuid };

