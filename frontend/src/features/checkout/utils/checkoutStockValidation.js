import apiClient from '../../../shared/services/api/apiClient';

/** Map cart line to checkout item shape (matches PaymentPage / create-checkout-session). */
export function mapCartLineToCheckoutItem(item) {
  const variationId =
    item.product?.selectedVariation?.id ??
    item.variationId ??
    item.product?.variationId ??
    null;
  const variationName =
    item.product?.selectedVariation?.name ?? item.variationName ?? null;
  const useOriginalProduct = item.product?.useOriginalProduct || false;
  const productIdentifier =
    item.product?.id ||
    item.product?.ProductID ||
    item.id ||
    item.productId;

  return {
    name: item.product?.name || item.name || 'Product',
    quantity: item.quantity,
    price: item.price,
    id: productIdentifier,
    productId: productIdentifier,
    variationId,
    variationName,
    useOriginalProduct
  };
}

export function mapCartLinesToCheckoutItems(cartLines) {
  return (cartLines || []).map(mapCartLineToCheckoutItem);
}

/**
 * Validate sellable stock before redirecting to payment provider.
 * Uses the same backend rules as create-checkout-session (pending orders reserved).
 */
export async function validateCheckoutStock(cartLines) {
  const items = mapCartLinesToCheckoutItems(cartLines);
  if (items.length === 0) {
    return { valid: false, issues: ['No items in cart'] };
  }
  const result = await apiClient.post('/api/checkout/validate-stock', { items });
  const issues = Array.isArray(result?.issues) ? result.issues : [];
  return {
    valid: result?.success === true && issues.length === 0,
    issues
  };
}
