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

function getActiveDiscountInfo(product) {
  if (product?.discountInfo?.discountType != null && product?.discountInfo?.discountValue != null) {
    return product.discountInfo;
  }
  const discountType = product?.DiscountType ?? product?.discountType;
  const discountValue = product?.DiscountValue ?? product?.discountValue;
  if ((product?.DiscountID || product?.discountId) && discountType && discountValue != null) {
    return {
      discountType,
      discountValue: Number(discountValue),
      discountedPrice: product?.discountedPrice,
    };
  }
  return null;
}

/** Catalog card: variation min price, parent list for strike-through, discount badge. */
export function getProductCardDisplayPricing(product) {
  const hasVariations = Boolean(product?.hasVariations || product?.requiresVariationSelection);
  const variationMin =
    Number(product?.variationMinPrice ?? product?.catalogListPrice ?? 0) || 0;
  const parentList =
    Number(product?.parentListPrice ?? product?.price ?? product?.Price ?? 0) || 0;
  const discountInfo = getActiveDiscountInfo(product);
  const hasDiscountFields =
    discountInfo?.discountType && discountInfo.discountValue != null && Number(discountInfo.discountValue) > 0;

  const listBase =
    hasVariations && parentList > 0
      ? parentList
      : hasVariations && variationMin > 0
        ? variationMin
        : parentList;

  let { displayPrice, originalPrice, hasDiscount: showDiscount } = resolveDiscountedDisplayPrice(
    listBase,
    hasDiscountFields ? discountInfo : null
  );

  if (hasVariations && variationMin > 0) {
    displayPrice = variationMin;
    if (listBase > variationMin) {
      originalPrice = listBase;
      showDiscount = true;
    }
  }

  const apiSale = Number(product?.discountedPrice ?? discountInfo?.discountedPrice);
  if (apiSale > 0 && listBase > apiSale) {
    displayPrice = hasVariations && variationMin > 0 ? variationMin : apiSale;
    originalPrice = listBase;
    showDiscount = true;
  }

  const showFromPrefix = hasVariations;
  let discountBadgeLabel = null;
  if (showDiscount && discountInfo) {
    if (discountInfo.discountType === 'percentage') {
      discountBadgeLabel = `${Math.round(Number(discountInfo.discountValue))}% off`;
    } else if (discountInfo.discountType === 'fixed') {
      discountBadgeLabel = 'Sale';
    }
  }

  return {
    displayPrice,
    originalPrice:
      showDiscount && originalPrice != null && Number(originalPrice) > Number(displayPrice)
        ? originalPrice
        : null,
    showDiscount,
    showFromPrefix,
    discountBadgeLabel,
  };
}
