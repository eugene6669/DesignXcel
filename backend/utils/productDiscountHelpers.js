'use strict';

/**
 * Compute discounted price from base price and ProductDiscounts row fields.
 */
function computeDiscountedPrice(basePrice, discountType, discountValue) {
    const price = Number(basePrice) || 0;
    const value = Number(discountValue) || 0;
    if (!discountType || value <= 0 || price <= 0) {
        return { discountedPrice: price, discountAmount: 0 };
    }
    if (discountType === 'percentage') {
        const amount = price * (value / 100);
        return {
            discountedPrice: Math.max(0, price - amount),
            discountAmount: amount
        };
    }
    if (discountType === 'fixed') {
        const amount = Math.min(value, price);
        return {
            discountedPrice: Math.max(0, price - value),
            discountAmount: amount
        };
    }
    return { discountedPrice: price, discountAmount: 0 };
}

function extractDiscountFields(product) {
    const discountId = product.DiscountID ?? product.discountId ?? product.discountInfo?.discountId;
    const discountType = product.DiscountType ?? product.discountType ?? product.discountInfo?.discountType;
    const discountValue = product.DiscountValue ?? product.discountValue ?? product.discountInfo?.discountValue;
    const startDate = product.discountStartDate ?? product.discountInfo?.startDate ?? product.discountInfo?.discountStartDate;
    const endDate = product.discountEndDate ?? product.discountInfo?.endDate ?? product.discountInfo?.discountEndDate;
    return { discountId, discountType, discountValue, startDate, endDate };
}

/**
 * Rebuild hasDiscount + discountInfo for a storefront product using the given list/catalog price.
 */
function applyDiscountToProductRecord(product, basePrice) {
    if (!product) return product;
    const price = Number(basePrice ?? product.price ?? 0) || 0;
    const { discountId, discountType, discountValue, startDate, endDate } = extractDiscountFields(product);
    const hasActiveDiscount = !!(discountId && discountType && discountValue != null && Number(discountValue) > 0);

    if (!hasActiveDiscount) {
        return {
            ...product,
            price,
            hasDiscount: false,
            discountInfo: null
        };
    }

    const { discountedPrice, discountAmount } = computeDiscountedPrice(price, discountType, discountValue);
    const hasDiscount = discountedPrice < price;

    return {
        ...product,
        price,
        hasDiscount,
        discountInfo: {
            discountId,
            discountType,
            discountValue: Number(discountValue),
            startDate,
            endDate,
            discountedPrice,
            discountAmount
        }
    };
}

module.exports = {
    computeDiscountedPrice,
    extractDiscountFields,
    applyDiscountToProductRecord
};
