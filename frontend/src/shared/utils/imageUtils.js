/**
 * Image URL Utility
 * Handles construction of full image URLs for backend uploads
 */

// Get the backend API URL from environment variables
const getBackendUrl = () => {
    return process.env.REACT_APP_API_URL || 'http://localhost:5000';
  };
  
  /**
   * Construct full image URL from relative path
   * @param {string} imagePath - Relative or absolute image path
   * @returns {string} - Full image URL
   */
  /**
   * Encode each path segment so filenames with spaces work in browsers.
   */
  const encodeUploadPath = (pathStr) => {
    if (!pathStr || !pathStr.startsWith('/')) return pathStr;
    return pathStr.split('/').map((seg, i) => {
      if (!seg || i === 0) return seg;
      try {
        return encodeURIComponent(decodeURIComponent(seg));
      } catch (e) {
        return encodeURIComponent(seg);
      }
    }).join('/');
  };

  export const getImageUrl = (imagePath) => {
    if (!imagePath) return '';
    
    const trimmed = String(imagePath).trim();
    if (!trimmed) return '';

    // Protocol-relative absolute URL (e.g. //cdn.example.com/...)
    if (trimmed.startsWith('//')) {
      return `https:${trimmed}`;
    }

    // If already a full URL, return as is
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    
    // If relative path starting with /, prepend backend URL
    if (trimmed.startsWith('/')) {
      return `${getBackendUrl()}${encodeUploadPath(trimmed)}`;
    }
    
    // If relative path without /, assume it's in uploads folder
    return `${getBackendUrl()}/uploads/${encodeURIComponent(trimmed)}`;
  };

  // Normalize and repair legacy 3D model path formats
  const normalizeModelPath = (rawPath) => {
    if (!rawPath) return '';

    let value = String(rawPath).trim();
    if (!value) return '';

    // Handle quoted/JSON-encoded strings
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1).trim();
    }
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === 'string') value = parsed.trim();
    } catch (e) {
      // Keep original value when not JSON
    }

    // Normalize slashes from Windows-style paths
    value = value.replace(/\\/g, '/');

    // Legacy typo path: /uploads/products/3dmodels/* -> canonical model folders
    value = value.replace('/uploads/products/3dmodels/', '/uploads/Inventory/Model/');
    value = value.replace('/uploads/products/models/', '/uploads/Inventory/Model/');

    // Relative model path should resolve from inventory model folder first
    if (!value.startsWith('/') && !value.startsWith('http://') && !value.startsWith('https://')) {
      if (value.includes('.glb') || value.includes('.gltf')) {
        value = `/uploads/Inventory/Model/${value}`;
      }
    }

    return value;
  };
  
  /**
   * Get image URL with fallback
   * @param {string} imagePath - Image path
   * @param {string} fallback - Fallback image path
   * @returns {string} - Image URL or fallback
   */
  export const getImageUrlWithFallback = (imagePath, fallback = '/logo192.png') => {
    if (!imagePath) return fallback;
    return getImageUrl(imagePath);
  };
  
  /**
   * Handle multiple images (for product galleries)
   * @param {Array} images - Array of image paths
   * @returns {Array} - Array of full image URLs
   */
  export const getImageUrls = (images) => {
    if (!Array.isArray(images)) return [];
    return images.map(img => getImageUrl(img)).filter(url => url);
  };
  
  /**
   * Get primary image from product data
   * @param {Object} product - Product object
   * @returns {string} - Primary image URL
   */
  export const getPrimaryImageUrl = (product) => {
    if (!product) return '/logo192.png';

    // Catalog & cards: use main product image (ImageURL / images); thumbnails are optional extras / gallery only.
    const imageFields = [
      product.ImageURL,
      product.image,
      product.images?.[0],
      product.Images?.[0]
    ];

    for (const field of imageFields) {
      if (field) {
        return getImageUrl(field);
      }
    }

    if (Array.isArray(product.thumbnails) && product.thumbnails.length > 0 && product.thumbnails[0]) {
      return getImageUrl(product.thumbnails[0]);
    }

    return '/logo192.png';
  };

  /**
   * Get 3D model URL from product data
   * @param {Object} product - Product object
   * @returns {string} - 3D model URL
   */
  export const getModel3dUrl = (product) => {
    if (!product) return null;
    
  const variationModel = product.selectedVariation?.model3d
    || product.selectedVariation?.model3D
    || (Array.isArray(product.variations)
      ? product.variations.find((v) => v?.model3d || v?.model3D)?.model3d
        || product.variations.find((v) => v?.model3d || v?.model3D)?.model3D
      : null);

    // Try different 3D model fields
    const modelFields = [
      variationModel,
      product.model3d,
      product.model3DURL,
      product.Model3DURL,
      product.Model3D,
      product.model3D,
      product.model_3d
    ];
    
    for (const field of modelFields) {
      if (field) {
        const normalizedPath = normalizeModelPath(field);
        // Check if the field contains a valid model path
        if (normalizedPath.includes('.glb') || normalizedPath.includes('.gltf')) {
          return getImageUrl(normalizedPath);
        }
      }
    }
    
    return null;
  };

  /**
   * Check if 3D model URL is accessible
   * @param {string} modelUrl - 3D model URL to check
   * @returns {Promise<boolean>} - Whether the model is accessible
   */
  export const checkModel3dAccessibility = async (modelUrl) => {
    if (!modelUrl) return false;
    
    try {
      const response = await fetch(modelUrl, { method: 'HEAD' });
      return response.ok;
    } catch (error) {
      console.warn('3D model accessibility check failed:', error);
      return false;
    }
  };