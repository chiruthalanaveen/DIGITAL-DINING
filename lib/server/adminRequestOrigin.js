export function isSameOriginAdminRequest(request) {
  const origin = request.headers.get('origin')
  const fetchSite = request.headers.get('sec-fetch-site')

  if (!origin || (fetchSite && fetchSite !== 'same-origin')) {
    return false
  }

  try {
    const target = new URL(request.url)
    const host = request.headers.get('host')

    const expectedOrigin = host
      ? new URL(`${target.protocol}//${host}`).origin
      : target.origin

    return origin === expectedOrigin
  } catch {
    return false
  }
}