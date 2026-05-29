const geocodeCache = new Map();

const PH_CITY_COORDS = {
  'quezon city': [14.676, 121.0437],
  'manila': [14.5995, 120.9842],
  'makati': [14.5547, 121.0244],
  'pasig': [14.5764, 121.0851],
  'taguig': [14.5176, 121.0509],
  'caloocan': [14.6488, 120.9839],
  'paranaque': [14.4793, 121.0198],
  'parañaque': [14.4793, 121.0198],
  'mandaluyong': [14.5794, 121.0359],
  'san juan': [14.6019, 121.0355],
  'marikina': [14.6507, 121.1029],
  'valenzuela': [14.7, 120.9822],
  'las pinas': [14.449, 120.9822],
  'muntinlupa': [14.4081, 121.0415],
  'pasay': [14.5378, 121.0014],
  'cavite': [14.4791, 120.897],
  'laguna': [14.2691, 121.4113],
  'bulacan': [14.7942, 120.8799],
};

function buildAddressQuery(address) {
  if (!address) return '';
  const parts = [
    address.HouseNumber,
    address.Street,
    address.Barangay,
    address.City,
    address.Province,
    address.Region,
    address.PostalCode,
    address.Country || 'Philippines',
  ].filter(Boolean);
  return parts.join(', ').replace(/\s+/g, ' ').trim();
}

function cityFallback(address) {
  const city = String(address?.City || '').toLowerCase().trim();
  if (city && PH_CITY_COORDS[city]) return PH_CITY_COORDS[city];
  for (const [key, coords] of Object.entries(PH_CITY_COORDS)) {
    if (city.includes(key) || key.includes(city)) return coords;
  }
  const province = String(address?.Province || '').toLowerCase().trim();
  if (province && PH_CITY_COORDS[province]) return PH_CITY_COORDS[province];
  return null;
}

export async function geocodePhilippineAddress(address) {
  const fullQuery = buildAddressQuery(address);
  if (!fullQuery) return cityFallback(address);

  if (geocodeCache.has(fullQuery)) {
    return geocodeCache.get(fullQuery);
  }

  const tryQuery = async (q) => {
    const url =
      'https://nominatim.openstreetmap.org/search?' +
      new URLSearchParams({
        format: 'json',
        limit: '1',
        countrycodes: 'ph',
        q,
      });
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DesignXcel-Ecommerce/1.0 (delivery-tracking; contact@designxcel.local)',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.length) return null;
    const lat = parseFloat(data[0].lat);
    const lon = parseFloat(data[0].lon);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
    return [lat, lon];
  };

  try {
    let coords = await tryQuery(fullQuery);
    if (!coords && address?.City) {
      const cityQuery = [address.City, address.Province, 'Philippines'].filter(Boolean).join(', ');
      coords = await tryQuery(cityQuery);
    }
    if (!coords) {
      coords = cityFallback(address);
    }
    geocodeCache.set(fullQuery, coords);
    return coords;
  } catch (err) {
    console.warn('[geocode] failed:', err);
    const fallback = cityFallback(address);
    geocodeCache.set(fullQuery, fallback);
    return fallback;
  }
}

export { buildAddressQuery };
