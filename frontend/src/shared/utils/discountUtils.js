/**
 * Apply product discount to a line-item or display base price (matches backend ProductDiscounts rules).
 */
export function computeDiscountedPrice(basePrice, discountType, discountValue) {
  const price = Number(basePrice) || 0;
  const value = Number(discountValue) || 0;
  if (!discountType || value <= 0 || price <= 0) {
    return { discountedPrice: price, discountAmount: 0 };
  }
  if (discountType === 'percentage') {
    const amount = price * (value / 100);
    return {
      discountedPrice: Math.max(0, price - amount),
      discountAmount: amount,
    };
  }
  if (discountType === 'fixed') {
    const amount = Math.min(value, price);
    return {
      discountedPrice: Math.max(0, price - value),
      discountAmount: amount,
    };
  }
  return { discountedPrice: price, discountAmount: 0 };
}

/**
 * Resolve storefront display prices from base price + optional discountInfo.
 */
export function resolveDiscountedDisplayPrice(basePrice, discountInfo) {
  const price = Number(basePrice) || 0;
  if (!discountInfo?.discountType || discountInfo.discountValue == null) {
    return { displayPrice: price, originalPrice: null, hasDiscount: false };
  }
  const { discountedPrice } = computeDiscountedPrice(
    price,
    discountInfo.discountType,
    discountInfo.discountValue
  );
  if (discountedPrice < price) {
    return { displayPrice: discountedPrice, originalPrice: price, hasDiscount: true };
  }
  return { displayPrice: price, originalPrice: null, hasDiscount: false };
}
