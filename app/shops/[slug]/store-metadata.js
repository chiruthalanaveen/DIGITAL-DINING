export function storeMetadata(website, account = false) {
  if (!website) {
    return {
      title: { absolute: 'Store unavailable' },
      robots: { index: false, follow: false },
      openGraph: { title: 'Store unavailable', images: [] },
      twitter: { title: 'Store unavailable', images: [] },
    }
  }

  const branding = website.branding || {}
  const seo = website.settings?.seo || {}
  const title = account ? `My account | ${website.name}` : String(seo.title || website.name).slice(0, 120)
  const description = String(seo.description || branding.description || `Shop products from ${website.name}.`).slice(0, 160)
  const canonical = `/shops/${encodeURIComponent(website.slug)}${account ? '/account' : ''}`
  const image = seo.image_url || branding.banner_url || branding.logo_url
  const icons = branding.logo_url ? [{ url: branding.logo_url }] : []
  return {
    title: { absolute: title },
    description,
    applicationName: website.name,
    alternates: { canonical },
    manifest: null,
    appleWebApp: null,
    icons: { icon: icons, shortcut: icons, apple: icons },
    ...(account ? { robots: { index: false, follow: false } } : {}),
    openGraph: { title, description, siteName: website.name, url: canonical, type: 'website', images: image ? [{ url: image }] : [] },
    twitter: { card: image ? 'summary_large_image' : 'summary', title, description, images: image ? [image] : [] },
  }
}
