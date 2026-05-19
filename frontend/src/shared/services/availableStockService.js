/**
 * Shared sellable-stock cache + batch API (pending checkout reservations included).
 */

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const CACHE_TTL_MS = 8000;
const STOCK_REFRESH_EVENT = 'designxcel:stock-refresh';

const cache = new Map();

function cacheKey(productId) {
  return String(productId || '').trim();
}

function readCache(productId) {
  const entry = cache.get(cacheKey(productId));
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(cacheKey(productId));
    return null;
  }
  return entry.value;
}

function writeCache(productId, value) {
  if (productId == null || value == null) return;
  cache.set(cacheKey(productId), { at: Date.now(), value });
}

export function invalidateAvailableStockCache() {
  cache.clear();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(STOCK_REFRESH_EVENT));
  }
}

export function subscribeStockRefresh(listener) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(STOCK_REFRESH_EVENT, listener);
  const onVis = () => {
    if (!document.hidden) listener();
  };
  window.addEventListener('visibilitychange', onVis);
  window.addEventListener('pageshow', listener);
  return () => {
    window.removeEventListener(STOCK_REFRESH_EVENT, listener);
    window.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('pageshow', listener);
  };
}

export function getCachedAvailableStock(productId) {
  return readCache(productId);
}

function pickSellableFromRow(data) {
  if (!data || !data.success) return null;
  return data.availableStock != null ? Number(data.availableStock) : null;
}

export async function fetchAvailableStockBatch(productIds) {
  const unique = [...new Set((productIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (unique.length === 0) return {};

  const missing = unique.filter((id) => readCache(id) == null);
  if (missing.length === 0) {
    const out = {};
    unique.forEach((id) => {
      out[id] = readCache(id);
    });
    return out;
  }

  try {
    const res = await fetch(`${API_BASE}/api/products/available-stock/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productIds: missing })
    });
    const data = await res.json();
    if (data.success && data.stocks) {
      Object.entries(data.stocks).forEach(([id, row]) => {
        const sellable = pickSellableFromRow(row);
        if (sellable != null) writeCache(id, sellable);
      });
    }
  } catch (err) {
    console.error('Batch available stock failed:', err);
  }

  const result = {};
  unique.forEach((id) => {
    result[id] = readCache(id);
  });
  return result;
}

export async function fetchAvailableStock(productId, { variationId } = {}) {
  const key = cacheKey(productId);
  if (!variationId) {
    const cached = readCache(key);
    if (cached != null) return cached;
  }

  try {
    const qs = variationId ? `?variationId=${encodeURIComponent(variationId)}` : '';
    const res = await fetch(`${API_BASE}/api/products/${encodeURIComponent(productId)}/available-stock${qs}`);
    const data = await res.json();
    const sellable = pickSellableFromRow(data);
    if (sellable != null && !variationId) writeCache(key, sellable);
    return { sellable, data };
  } catch (err) {
    console.error('Available stock fetch failed:', err);
    return { sellable: null, data: null };
  }
}

export async function fetchVariationStockMap(productId) {
  try {
    const res = await fetch(
      `${API_BASE}/api/products/${encodeURIComponent(productId)}/available-stock/variations`
    );
    return await res.json();
  } catch (err) {
    console.error('Variation stock map failed:', err);
    return { success: false, byVariationId: {} };
  }
}

export { STOCK_REFRESH_EVENT };
