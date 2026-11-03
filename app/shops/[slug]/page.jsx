import { cache } from 'react'
import { notFound } from 'next/navigation'
import Storefront from '@/app/components/commerce/Storefront'
import { getPublicCatalog } from '@/lib/server/commerce/catalog'
import { buildStorefrontJsonLd, serializeStorefrontJsonLd } from '@/lib/commerce/storefront-seo'
import { storeMetadata } from './store-metadata'

export const dynamic = 'force-dynamic'
const catalogFor = cache(getPublicCatalog)

export async function generateMetadata({ params }) {
  const { slug } = await params
  const catalog = await catalogFor(slug)
  return storeMetadata(catalog?.website)
}

export default async function ShopPage({ params }) {
  const { slug } = await params
  const catalog = await catalogFor(slug)
  if (!catalog) notFound()
  const structuredData = buildStorefrontJsonLd(catalog)
  return <>{structuredData && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStorefrontJsonLd(structuredData) }} />}<Storefront key={catalog.website.id} initialCatalog={catalog} /></>
}
