import { notFound } from 'next/navigation'
import { cache } from 'react'
import StoreWishlist from '@/app/components/commerce/StoreWishlist'
import { getPublicCatalog } from '@/lib/server/commerce/catalog'
import { storeMetadata } from '../store-metadata'

export const dynamic = 'force-dynamic'
const catalogFor = cache(getPublicCatalog)

export async function generateMetadata({ params }) {
  const { slug } = await params
  const catalog = await catalogFor(slug)
  return storeMetadata(catalog?.website, 'wishlist')
}

export default async function StoreWishlistPage({ params }) {
  const { slug } = await params
  const catalog = await catalogFor(slug)
  if (!catalog) notFound()
  return <StoreWishlist key={catalog.website.id} initialCatalog={catalog} />
}
