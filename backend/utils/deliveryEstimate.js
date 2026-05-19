/**
 * Calculate Estimated Date of Arrival (EDA) for orders
 * Hub location: Quezon City, NCR
 * 
 * @param {string} region - Delivery region (e.g., 'NCR', 'Region IV-A', 'Region III')
 * @param {string} province - Delivery province (optional)
 * @param {string} city - Delivery city
 * @param {Date} orderDate - Date when order was placed or status changed to Shipping
 * @returns {Date} Estimated delivery date
 */
function calculateEstimatedDeliveryDate(region, province, city, orderDate = new Date()) {
    // Ensure orderDate is a Date object
    const startDate = orderDate instanceof Date ? new Date(orderDate) : new Date(orderDate);
    
    // Start counting from the next business day (skip weekends)
    let currentDate = new Date(startDate);
    
    // If order date is on weekend, move to next Monday
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek === 0) { // Sunday
        currentDate.setDate(currentDate.getDate() + 1);
    } else if (dayOfWeek === 6) { // Saturday
        currentDate.setDate(currentDate.getDate() + 2);
    }
    
    // Normalize region and city for comparison
    const normalizedRegion = region ? region.trim().toUpperCase() : '';
    const normalizedCity = city ? city.trim().toUpperCase() : '';
    
    let businessDaysToAdd = 0;
    
    // NCR (National Capital Region) - Metro Manila
    if (normalizedRegion === 'NCR' || normalizedCity.includes('MANILA') || normalizedCity.includes('QUEZON') || 
        normalizedCity.includes('MAKATI') || normalizedCity.includes('PASIG') || normalizedCity.includes('TAGUIG') ||
        normalizedCity.includes('MANDALUYONG') || normalizedCity.includes('PASAY') || normalizedCity.includes('CALOOCAN') ||
        normalizedCity.includes('LAS PIÑAS') || normalizedCity.includes('MALABON') || normalizedCity.includes('MARIKINA') ||
        normalizedCity.includes('MUNTINLUPA') || normalizedCity.includes('NAVOTAS') || normalizedCity.includes('PARAÑAQUE') ||
        normalizedCity.includes('SAN JUAN') || normalizedCity.includes('VALENZUELA')) {
        // NCR: 1-2 business days
        businessDaysToAdd = 2;
    }
    // Region IV-A (CALABARZON) - Nearby provinces
    else if (normalizedRegion === 'REGION IV-A' || normalizedRegion === 'CALABARZON' ||
             (province && (province.toUpperCase().includes('LAGUNA') || province.toUpperCase().includes('CAVITE') || 
                          province.toUpperCase().includes('RIZAL') || province.toUpperCase().includes('BATANGAS') || 
                          province.toUpperCase().includes('QUEZON')))) {
        // Region IV-A: 2-3 business days
        businessDaysToAdd = 3;
    }
    // Region III (Central Luzon)
    else if (normalizedRegion === 'REGION III' || normalizedRegion === 'CENTRAL LUZON' ||
             (province && (province.toUpperCase().includes('BULACAN') || province.toUpperCase().includes('PAMPANGA') || 
                          province.toUpperCase().includes('TARLAC') || province.toUpperCase().includes('NUEVA ECIJA') ||
                          province.toUpperCase().includes('BATAAN') || province.toUpperCase().includes('ZAMBALES') ||
                          province.toUpperCase().includes('AURORA')))) {
        // Region III: 3-4 business days
        businessDaysToAdd = 4;
    }
    // Other regions (Luzon, Visayas, Mindanao)
    else {
        // Other regions: 5-7 business days
        businessDaysToAdd = 6;
    }
    
    // Add business days (skip weekends)
    let daysAdded = 0;
    while (daysAdded < businessDaysToAdd) {
        currentDate.setDate(currentDate.getDate() + 1);
        const day = currentDate.getDay();
        // Skip weekends (Saturday = 6, Sunday = 0)
        if (day !== 0 && day !== 6) {
            daysAdded++;
        }
    }
    
    return currentDate;
}

/**
 * Format estimated delivery date for display
 * @param {Date} estimatedDate - Estimated delivery date
 * @returns {string} Formatted date string (e.g., "Dec 25, 2024")
 */
function formatEstimatedDeliveryDate(estimatedDate) {
    if (!estimatedDate) return 'N/A';
    
    const date = estimatedDate instanceof Date ? estimatedDate : new Date(estimatedDate);
    
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

/**
 * Get estimated delivery date as a formatted string with full date
 * @param {Date} estimatedDate - Estimated delivery date
 * @returns {string} Formatted date string (e.g., "December 25, 2024")
 */
function formatEstimatedDeliveryDateFull(estimatedDate) {
    if (!estimatedDate) return 'N/A';
    
    const date = estimatedDate instanceof Date ? estimatedDate : new Date(estimatedDate);
    
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

module.exports = {
    calculateEstimatedDeliveryDate,
    formatEstimatedDeliveryDate,
    formatEstimatedDeliveryDateFull
};

