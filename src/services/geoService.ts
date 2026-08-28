export interface GeoCheckResult {
  insideZone: boolean;
  zone: {
    id: string;
    name: string;
    type: 'SAFE' | 'CAUTION' | 'HIGH_RISK';
    risk: number;
    distanceMeters: number;
  } | null;
}

export function calculateHaversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function evaluateGeoFence(
  lat: number,
  lng: number,
  fences: Array<{ id: string; name: string; latitude: number; longitude: number; radiusMeters: number; zoneType: string; baseRisk: number }>
): GeoCheckResult {
  for (const fence of fences) {
    const dist = calculateHaversineMeters(lat, lng, fence.latitude, fence.longitude);
    if (dist <= fence.radiusMeters) {
      return {
        insideZone: true,
        zone: {
          id: fence.id,
          name: fence.name,
          type: fence.zoneType as 'SAFE' | 'CAUTION' | 'HIGH_RISK',
          risk: fence.baseRisk,
          distanceMeters: Math.round(dist)
        }
      };
    }
  }
  return { insideZone: false, zone: null };
}