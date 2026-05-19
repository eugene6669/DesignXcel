const commonPasswords = [
    'password', 'password123', 'admin', 'admin123',
    '12345678', 'qwertyuiop', 'designxcel', 'designxcel123',
    'welcome', 'welcome123', 'p@ssword', '123456', '1234567',
    '87654321', '00000000'
];

/**
 * Checks if a password is in the common passwords blacklist.
 * @param {string} password - The password to check.
 * @returns {boolean} - True if the password is common, false otherwise.
 */
const isCommonPassword = (password) => {
    if (!password) return false;
    return commonPasswords.includes(password.toLowerCase());
};

module.exports = {
    commonPasswords,
    isCommonPassword
};
