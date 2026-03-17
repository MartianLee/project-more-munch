const EARTH_RADIUS_M = 6371000;
const WALKING_SPEED_M_PER_MIN = 80;

export function haversineDistance(
  lat1: number, lon1: number, lat2: number, lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_M * c);
}

export function walkingMinutes(distanceMeters: number): number {
  return Math.ceil(distanceMeters / WALKING_SPEED_M_PER_MIN);
}

export function formatDistance(distanceMeters: number): string {
  return `도보 ${walkingMinutes(distanceMeters)}분`;
}
