import { getPublicCatalog } from '@/lib/server/commerce/catalog'
import { CommerceError, run } from '@/lib/server/commerce/core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_request, context) {
  return run(async () => {
    const { slug } = await context.params
    const catalog = await getPublicCatalog(slug)
    if (!catalog) throw new CommerceError('Website not found or unavailable.', 404)
    return catalog
  })
}
