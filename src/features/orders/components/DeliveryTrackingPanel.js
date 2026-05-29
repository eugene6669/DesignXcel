import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { WAREHOUSE_LOCATION } from '../../../shared/constants/warehouseLocation';
import { geocodePhilippineAddress } from '../../../shared/utils/geocodeAddress';
import { fetchDrivingRoute } from '../../../shared/utils/fetchDrivingRoute';
import {
  DELIVERY_TRACKING_STEPS,
  getDeliveryProgress,
  getTrackingStepIndex,
  getTrackingStatusMessage,
  interpolateLatLng,
  formatShippingAddressLine,
  isDeliveryOrder,
  positionAlongRoute,
  formatRouteDistance,
  formatRouteDuration,
} from '../../../shared/utils/deliveryTracking';
import './delivery-tracking.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const warehouseIcon = L.divIcon({
  className: 'dt-marker-wrap',
  html: '<div class="dt-marker dt-marker--warehouse" title="Design Excellence">DE</div>',
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36],
});

const destinationIcon = L.divIcon({
  className: 'dt-marker-wrap',
  html: '<div class="dt-marker dt-marker--dest" title="Delivery address">📍</div>',
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36],
});

const courierIcon = L.divIcon({
  className: 'dt-marker-wrap',
  html: '<div class="dt-marker dt-marker--courier" title="Current location">🚚</div>',
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20],
});

function MapFitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points?.length) return;
    const timer = setTimeout(() => {
      try {
        map.invalidateSize();
        if (points.length === 1) {
          map.setView(points[0], 13);
          return;
        }
        map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 14 });
      } catch (e) {
        console.warn('[map] fitBounds:', e);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [map, points]);
  return null;
}

const DeliveryTrackingPanel = ({ order, mapKey }) => {
  const [destination, setDestination] = useState(null);
  const [routeCoords, setRouteCoords] = useState(null);
  const [routeMeta, setRouteMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [geoError, setGeoError] = useState('');

  const origin = WAREHOUSE_LOCATION.coordinates;
  const isPickup = !isDeliveryOrder(order);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setGeoError('');
      setRouteCoords(null);
      setRouteMeta(null);

      if (isPickup) {
        setDestination(origin);
        setLoading(false);
        return;
      }

      const coords = await geocodePhilippineAddress(order.address);
      if (cancelled) return;

      if (!coords) {
        setDestination(null);
        setGeoError('Could not locate address on map. Showing warehouse location.');
        setLoading(false);
        return;
      }

      setDestination(coords);

      const route = await fetchDrivingRoute(origin, coords);
      if (cancelled) return;

      if (route?.coordinates?.length) {
        setRouteCoords(route.coordinates);
        setRouteMeta(route);
      } else {
        setRouteCoords([origin, coords]);
        setGeoError('Driving route unavailable — showing direct path.');
      }
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [order, isPickup, origin]);

  const stepIndex = getTrackingStepIndex(order.Status);
  const progress = getDeliveryProgress(order.Status);
  const isDelivered = ['Delivered', 'Completed', 'Received', 'Receive', 'To Receive'].includes(order.Status);

  const displayRoute = routeCoords?.length ? routeCoords : (destination ? [origin, destination] : [origin]);

  const courierPosition = useMemo(() => {
    if (!destination || isPickup) return origin;
    if (isDelivered) return destination;
    if (displayRoute.length > 1) {
      return positionAlongRoute(displayRoute, progress) || interpolateLatLng(origin, destination, progress);
    }
    return interpolateLatLng(origin, destination, progress);
  }, [origin, destination, progress, isPickup, isDelivered, displayRoute]);

  const mapPoints = useMemo(() => {
    const pts = displayRoute.length ? [...displayRoute] : [origin];
    if (destination && !isPickup && !isDelivered && progress > 0.02 && progress < 0.98) {
      pts.push(courierPosition);
    }
    return pts;
  }, [displayRoute, origin, destination, isPickup, isDelivered, progress, courierPosition]);

  const showCourier = Boolean(
    destination && !isPickup && !isDelivered && order.Status !== 'Cancelled'
  );

  const containerKey = mapKey || `track-${order.OrderID}`;

  return (
    <div className="delivery-tracking-panel">
      <div className="delivery-tracking-header">
        <div>
          <h4 className="delivery-tracking-title">
            {isPickup ? 'Pick up location' : 'Delivery tracking'}
          </h4>
          <p className="delivery-tracking-subtitle">{getTrackingStatusMessage(order)}</p>
        </div>
        {order.ReferenceNumber && (
          <span className="delivery-tracking-ref">Ref: {order.ReferenceNumber}</span>
        )}
      </div>

      {!isPickup && (
        <ol className="delivery-tracking-steps" aria-label="Delivery progress">
          {DELIVERY_TRACKING_STEPS.map((step, idx) => (
            <li
              key={step.key}
              className={`delivery-tracking-step${idx <= stepIndex ? ' is-done' : ''}${idx === stepIndex ? ' is-current' : ''}`}
            >
              <span className="delivery-tracking-step-dot" aria-hidden="true" />
              <span className="delivery-tracking-step-label">{step.label}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="delivery-tracking-map-wrap">
        {loading ? (
          <div className="delivery-tracking-map-loading">Loading route…</div>
        ) : (
          <MapContainer
            key={containerKey}
            center={origin}
            zoom={12}
            scrollWheelZoom={false}
            className="delivery-tracking-map"
            attributionControl
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            <MapFitBounds points={mapPoints} />
            <Marker position={origin} icon={warehouseIcon}>
              <Popup>
                <strong>{WAREHOUSE_LOCATION.name}</strong>
                <br />
                {WAREHOUSE_LOCATION.address}
              </Popup>
            </Marker>
            {destination && !isPickup && (
              <>
                <Polyline
                  positions={displayRoute}
                  pathOptions={{ color: '#F0B21B', weight: 5, opacity: 0.9 }}
                />
                <Marker position={destination} icon={destinationIcon}>
                  <Popup>
                    <strong>Delivery address</strong>
                    <br />
                    {formatShippingAddressLine(order.address)}
                  </Popup>
                </Marker>
                {showCourier && (
                  <Marker position={courierPosition} icon={courierIcon}>
                    <Popup>Estimated package location on route</Popup>
                  </Marker>
                )}
              </>
            )}
          </MapContainer>
        )}
      </div>

      {geoError && <p className="delivery-tracking-note delivery-tracking-note--warn">{geoError}</p>}
      {!isPickup && routeMeta?.distanceMeters > 0 && (
        <p className="delivery-tracking-note">
          <strong>Route:</strong>{' '}
          {formatRouteDistance(routeMeta.distanceMeters)}
          {routeMeta.durationSeconds ? ` · ${formatRouteDuration(routeMeta.durationSeconds)}` : ''}
        </p>
      )}
      {!isPickup && order.address && (
        <p className="delivery-tracking-note">
          <strong>Ship to:</strong> {formatShippingAddressLine(order.address)}
        </p>
      )}
      {order.EstimatedDeliveryDateFormatted && !isPickup && (
        <p className="delivery-tracking-note">
          <strong>Estimated delivery:</strong> {order.EstimatedDeliveryDateFormatted}
        </p>
      )}
    </div>
  );
};

export default DeliveryTrackingPanel;
