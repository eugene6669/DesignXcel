'use strict';

/**
 * Legacy transparent encryption hooks — encryption was removed; data is stored in plain text.
 * These helpers are identity pass-throughs so existing routes keep working.
 */

function processCustomerForDisplay(customer) {
    return customer ? { ...customer } : customer;
}

function processUserForDisplay(user) {
    return user ? { ...user } : user;
}

function processAddressForStorage(address) {
    return address ? { ...address } : address;
}

module.exports = {
    processCustomerForDisplay,
    processUserForDisplay,
    processAddressForStorage
};
