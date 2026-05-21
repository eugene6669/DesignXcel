/** Per-customer keys so PayMongo return URLs do not reuse another account's session. */
export function getCheckoutUserSuffix() {
  try {
    const raw = localStorage.getItem('userData');
    const parsed = raw ? JSON.parse(raw) : null;
    const id = parsed?.email || parsed?.id || parsed?.CustomerID;
    return id ? String(id).toLowerCase() : 'guest';
  } catch {
    return 'guest';
  }
}

export function getScopedCheckoutKey(baseKey) {
  return `${baseKey}:${getCheckoutUserSuffix()}`;
}

export function setLastPaymentProvider(provider) {
  if (!provider) return;
  localStorage.setItem(getScopedCheckoutKey('lastPaymentProvider'), String(provider));
  localStorage.removeItem('lastPaymentProvider');
}

export function getLastPaymentProvider() {
  return (
    localStorage.getItem(getScopedCheckoutKey('lastPaymentProvider')) ||
    localStorage.getItem('lastPaymentProvider') ||
    null
  );
}

export function setLastPaymongoSessionId(sessionId) {
  if (!sessionId) return;
  localStorage.setItem(getScopedCheckoutKey('lastPaymongoSessionId'), String(sessionId));
  localStorage.removeItem('lastPaymongoSessionId');
}

export function getLastPaymongoSessionId() {
  return (
    localStorage.getItem(getScopedCheckoutKey('lastPaymongoSessionId')) ||
    null
  );
}

const PENDING_SUCCESS_SESSION_BASE = 'pendingOrderSuccessCheckoutSessionId';
const PENDING_SUCCESS_PROVIDER_BASE = 'pendingOrderSuccessProvider';

export function setPendingOrderSuccessCheckout(sessionId, provider = 'paymongo') {
  if (!sessionId) return;
  sessionStorage.setItem(getScopedCheckoutKey(PENDING_SUCCESS_SESSION_BASE), String(sessionId));
  sessionStorage.setItem(getScopedCheckoutKey(PENDING_SUCCESS_PROVIDER_BASE), provider);
}

export function getPendingOrderSuccessCheckout() {
  const sessionId = sessionStorage.getItem(getScopedCheckoutKey(PENDING_SUCCESS_SESSION_BASE));
  const provider = sessionStorage.getItem(getScopedCheckoutKey(PENDING_SUCCESS_PROVIDER_BASE));
  if (!sessionId) return { sessionId: null, provider: null };
  return { sessionId, provider };
}

export function clearPendingOrderSuccessCheckout() {
  sessionStorage.removeItem(getScopedCheckoutKey(PENDING_SUCCESS_SESSION_BASE));
  sessionStorage.removeItem(getScopedCheckoutKey(PENDING_SUCCESS_PROVIDER_BASE));
}

export function clearCheckoutPaymentSessionKeys() {
  const suffix = getCheckoutUserSuffix();
  localStorage.removeItem(`lastPaymongoSessionId:${suffix}`);
  localStorage.removeItem('lastPaymongoSessionId');
  localStorage.removeItem('lastPaymentProvider');
  clearPendingOrderSuccessCheckout();
}
