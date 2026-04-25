/**
 * Generate a unique reference number for orders
 * Format: ORD + YYYYMMDD + padded OrderID (e.g., ORD20241201001)
 * 
 * @param {Date} orderDate - The date of the order
 * @param {number} orderId - The OrderID from the database
 * @returns {string} The generated reference number
 */
function generateReferenceNumber(orderDate, orderId) {
    // Format date as YYYYMMDD
    const year = orderDate.getFullYear();
    const month = String(orderDate.getMonth() + 1).padStart(2, '0');
    const day = String(orderDate.getDate()).padStart(2, '0');
    const dateString = `${year}${month}${day}`;
    
    // Pad OrderID to 3 digits
    const paddedOrderId = String(orderId).padStart(3, '0');
    
    // Generate reference number
    const referenceNumber = `ORD${dateString}${paddedOrderId}`;
    
    return referenceNumber;
}

module.exports = { generateReferenceNumber };

