/**
 * Generate a unique transaction ID for orders
 * Format: TXN + YYYYMMDDHHMMSS + random 6 digits (e.g., TXN20241113143052123456)
 * 
 * @param {Date} orderDate - The date of the order (optional, defaults to current date)
 * @returns {string} The generated transaction ID
 */
function generateTransactionId(orderDate = null) {
    // Use provided date or current date
    const date = orderDate || new Date();
    
    // Format date as YYYYMMDDHHMMSS
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    const dateTimeString = `${year}${month}${day}${hours}${minutes}${seconds}`;
    
    // Generate random 6-digit number
    const randomDigits = String(Math.floor(100000 + Math.random() * 900000));
    
    // Generate transaction ID
    const transactionId = `TXN${dateTimeString}${randomDigits}`;
    
    return transactionId;
}

module.exports = { generateTransactionId };

