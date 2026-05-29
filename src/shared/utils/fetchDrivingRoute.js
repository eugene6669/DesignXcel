const routeCache = new Map();

/**
 * Fetch driving route geometry via OSRM (OpenStreetMap).
 * @param {[number, number]} origin [lat, lng]
 * @param {[number, number]} destination [lat, lng]
 * @returns {Promise<{ coordinates: [number, number][], distanceMeters: number, durationSeconds: number }|null>}
 */
export async function fetchDrivingRoute(origin, destination) {
  if (!origin?.length || !destination?.length) return null;

  const cacheKey = `${origin[0].toFixed(5)},${origin[1].toFixed(5)}|${destination[0].toFixed(5)},${destination[1].toFixed(5)}`;
  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey);
  }

  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${origin[1]},${origin[0]};${destination[1]},${destination[0]}` +
    '?overview=full&geometries=geojson';

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    const route = data?.routes?.[0];
    const geom = route?.geometry?.coordinates;
    if (!geom?.length) return null;

    const coordinates = geom.map((pair) => [pair[1], pair[0]]);
    const result = {
      coordinates,
      distanceMeters: route.distance || 0,
      durationSeconds: route.duration || 0,
    };
    routeCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.warn('[fetchDrivingRoute]', err);
    return null;
  }
}
