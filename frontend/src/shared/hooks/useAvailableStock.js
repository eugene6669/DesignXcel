import { useState, useEffect } from 'react';
import {
  fetchAvailableStock,
  fetchAvailableStockBatch,
  getCachedAvailableStock,
  subscribeStockRefresh
} from '../services/availableStockService';

/**
 * Live sellable qty for product cards (uses batch cache when possible).
 */
export function useAvailableStock(productId, fallback = null) {
  const [qty, setQty] = useState(() => {
    const cached = productId ? getCachedAvailableStock(productId) : null;
    return cached != null ? cached : fallback;
  });

  useEffect(() => {
    if (!productId) {
      setQty(fallback);
      return undefined;
    }

    let cancelled = false;

    const refresh = async () => {
      const cached = getCachedAvailableStock(productId);
      if (cached != null) {
        if (!cancelled) setQty(cached);
        return;
      }
      const { sellable } = await fetchAvailableStock(productId);
      if (!cancelled && sellable != null) setQty(sellable);
    };

    refresh();
    const unsub = subscribeStockRefresh(refresh);
    const interval = setInterval(refresh, 12000);

    return () => {
      cancelled = true;
      unsub();
      clearInterval(interval);
    };
  }, [productId, fallback]);

  return qty;
}

/**
 * Prime batch cache for a product list page (call once after products load).
 */
export function usePrimeAvailableStockBatch(productIds) {
  const idsKey = (productIds || []).filter(Boolean).join(',');
  useEffect(() => {
    const ids = idsKey ? idsKey.split(',') : [];
    if (ids.length === 0) return undefined;
    fetchAvailableStockBatch(ids);
    const unsub = subscribeStockRefresh(() => fetchAvailableStockBatch(ids));
    return unsub;
  }, [idsKey]);
}
