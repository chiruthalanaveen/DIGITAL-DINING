import { notFound } from 'next/navigation'
import { cache } from 'react'
import StoreAccount from '@/app/components/commerce/StoreAccount'
import { getPublicCatalog } from '@/lib/server/commerce/catalog'
import { storeMetadata } from '../store-metadata'

export const dynamic = 'force-dynamic'
const catalogFor = cache(getPublicCatalog)

export async function generateMetadata({ params }) {
  const { slug } = await params
  const catalog = await catalogFor(slug)
  return storeMetadata(catalog?.website, true)
}

export default async function StoreAccountPage({ params }) {
  const { slug } = await params
  const catalog = await catalogFor(slug)
  if (!catalog) notFound()
  return <StoreAccount key={catalog.website.id} website={catalog.website} />
}
