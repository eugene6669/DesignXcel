import { WAREHOUSE_LOCATION } from '../constants/warehouseLocation';
import { buildAddressQuery } from './geocodeAddress';

export const DELIVERY_TRACKING_STEPS = [
  { key: 'confirmed', label: 'Confirmed', statuses: ['Pending', 'Processing'] },
  { key: 'shipped', label: 'Shipped', statuses: ['Shipping'] },
  { key: 'transit', label: 'On the way', statuses: ['Delivering', 'Delivery'] },
  { key: 'delivered', label: 'Delivered', statuses: ['Delivered', 'Completed', 'Received', 'Receive', 'To Receive'] },
];

const RETURN_WORKFLOW_STATUSES = new Set([
  'Return',
  'Returned',
  'Refunded',
  'Declined',
  'Processing (Pickup)',
  'Awaiting Inspection',
  'Inspection Complete',
  'Pickup Received',
  'Completed Returned',
]);

export function isPickupOrder(order) {
  if (!order) return true;
  const dt = String(order.DeliveryType || '').toLowerCase();
  const name = String(order.DeliveryTypeName || '').toLowerCase();
  return (
    dt === 'pickup' ||
    name === 'pick up' ||
    name === 'pickup' ||
    name.includes('pick up')
  );
}

export function isDeliveryOrder(order) {
  return !isPickupOrder(order);
}

export function canShowDeliveryTracking(order) {
  if (!order || isPickupOrder(order)) return false;
  const status = String(order.Status || '');
  if (status === 'Cancelled' || RETURN_WORKFLOW_STATUSES.has(status)) return false;
  return true;
}

export function getTrackingStepIndex(status) {
  const s = status || '';
  let idx = DELIVERY_TRACKING_STEPS.findIndex((step) => step.statuses.includes(s));
  if (idx < 0) {
    if (['Delivered', 'Completed', 'Received', 'Receive'].includes(s)) return DELIVERY_TRACKING_STEPS.length - 1;
    return 0;
  }
  return idx;
}

/** 0 = warehouse, 1 = destination */
export function getDeliveryProgress(status) {
  const idx = getTrackingStepIndex(status);
  const progressByStep = [0.05, 0.38, 0.72, 1];
  return progressByStep[Math.min(idx, progressByStep.length - 1)] ?? 0;
}

export function interpolateLatLng(origin, dest, t) {
  const clamped = Math.max(0, Math.min(1, t));
  return [
    origin[0] + (dest[0] - origin[0]) * clamped,
    origin[1] + (dest[1] - origin[1]) * clamped,
  ];
}

function segmentMeters(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function positionAlongRoute(routeCoords, t) {
  if (!routeCoords?.length) return null;
  if (routeCoords.length === 1) return routeCoords[0];

  const clamped = Math.max(0, Math.min(1, t));
  let total = 0;
  const segLens = [];
  for (let i = 1; i < routeCoords.length; i++) {
    const len = segmentMeters(routeCoords[i - 1], routeCoords[i]);
    segLens.push(len);
    total += len;
  }
  if (total <= 0) return routeCoords[0];

  let target = clamped * total;
  for (let i = 0; i < segLens.length; i++) {
    if (target <= segLens[i]) {
      const frac = segLens[i] > 0 ? target / segLens[i] : 0;
      return interpolateLatLng(routeCoords[i], routeCoords[i + 1], frac);
    }
    target -= segLens[i];
  }
  return routeCoords[routeCoords.length - 1];
}

export function formatRouteDistance(meters) {
  if (!meters || meters <= 0) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatRouteDuration(seconds) {
  if (!seconds || seconds <= 0) return '';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `~${mins} min drive`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `~${h}h ${m}m drive` : `~${h}h drive`;
}

export function getWarehouseCoords() {
  return WAREHOUSE_LOCATION.coordinates;
}

export function formatShippingAddressLine(address) {
  return buildAddressQuery(address) || '—';
}

export function getTrackingStatusMessage(order) {
  const status = order?.Status || '';
  const eta = order?.EstimatedDeliveryDateFormatted;
  if (['Delivered', 'Completed', 'Received', 'Receive', 'To Receive'].includes(status)) {
    return 'Your package has been delivered or is ready to receive.';
  }
  if (status === 'Shipping') {
    return eta ? `Shipped — estimated arrival ${eta}` : 'Your order has left our warehouse.';
  }
  if (status === 'Delivering' || status === 'Delivery') {
    return eta ? `Out for delivery — estimated ${eta}` : 'Your order is on the way to you.';
  }
  if (status === 'Processing') {
    return 'We are preparing your order for shipment.';
  }
  if (status === 'Pending') {
    return 'Order confirmed — shipment will begin once processing starts.';
  }
  return 'Tracking your delivery.';
}
