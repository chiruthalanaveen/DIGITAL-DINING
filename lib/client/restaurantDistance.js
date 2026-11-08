// UX-only approximation. The server owns final eligibility decisions.
export function distanceMeters(lat1, lon1, lat2, lon2) {
  const rad = v => v * Math.PI / 180
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2
  return 6371008.8 * 2 * Math.asin(Math.min(1, Math.sqrt(a)))
}
