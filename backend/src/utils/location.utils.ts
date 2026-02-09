/**
 * Location utility functions for calculating distances between coordinates
 */

/**
 * Calculate the distance between two coordinates using the Haversine formula
 * @param lat1 Latitude of first point
 * @param lon1 Longitude of first point
 * @param lat2 Latitude of second point
 * @param lon2 Longitude of second point
 * @returns Distance in meters
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c; // Distance in meters
  return Math.round(distance * 100) / 100; // Round to 2 decimal places
}

/**
 * Check if a location is within the allowed radius
 * @param employeeLat Employee's latitude
 * @param employeeLon Employee's longitude
 * @param officeLat Office latitude
 * @param officeLon Office longitude
 * @param radiusMeters Allowed radius in meters (default 200)
 * @returns Object with isWithinRadius and distance
 */
export function checkProximity(
  employeeLat: number,
  employeeLon: number,
  officeLat: number,
  officeLon: number,
  radiusMeters: number = 200
): { isWithinRadius: boolean; distance: number } {
  const distance = calculateDistance(employeeLat, employeeLon, officeLat, officeLon);
  const isWithinRadius = distance <= radiusMeters;

  return {
    isWithinRadius,
    distance,
  };
}

/**
 * Validate coordinates
 * @param lat Latitude
 * @param lon Longitude
 * @returns True if coordinates are valid
 */
export function isValidCoordinates(lat: number, lon: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    !isNaN(lat) &&
    !isNaN(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}
