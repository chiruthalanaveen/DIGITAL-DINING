// Browser position is only a signal. The server independently checks all
// constraints; device GPS can still be spoofed and is not indoor proof.
export async function getFreshDineInProof() {
  if (typeof window === 'undefined' || !window.isSecureContext || !navigator.geolocation) {
    throw new Error('Live location requires HTTPS and device location access. Ask staff for assistance.')
  }
  const position = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true, maximumAge: 0, timeout: 15000,
    })
  }).catch(error => {
    if (error?.code === 1) throw new Error('Location permission denied. Enable GPS or ask staff for assistance.')
    if (error?.code === 3) throw new Error('GPS timed out. Move closer to a window or ask staff for assistance.')
    throw new Error('Unable to verify location. Please retry or ask staff for assistance.')
  })
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    locationAccuracy: position.coords.accuracy,
    locationTimestamp: position.timestamp,
  }
}
