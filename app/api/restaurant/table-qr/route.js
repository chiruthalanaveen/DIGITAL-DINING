import { getOrderingCapabilities, issueTableToken, OrderingError, failOrdering } from '@/lib/server/restaurantOrdering'
import { authorizeRestaurantActor } from '@/lib/server/restaurantOwnerAccess'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const restaurantId = String(body.restaurantId || '').trim()
    const table = String(body.table || '').trim()
    if (!table || table.length > 50) throw new OrderingError('INVALID_TABLE', 'Choose a registered table.', 400)
    const actor = await authorizeRestaurantActor(request, restaurantId, ['owner', 'manager'])
    const c = await getOrderingCapabilities(actor.admin, restaurantId)
    if (!c.dineInEnabled || c.policy.signed_table_qr_required !== true) {
      throw new OrderingError('TABLE_QR_DISABLED', 'Signed table QR ordering is not enabled for this restaurant.', 403)
    }
    const { data: row, error } = await actor.admin.from('restaurant_ordering_tables')
      .select('table_label,enabled').eq('restaurant_id', restaurantId).eq('table_label', table).maybeSingle()
    if (error) throw error
    if (row?.enabled !== true) throw new OrderingError('TABLE_UNAVAILABLE', 'Table not registered or disabled.', 403)
    const token = issueTableToken(restaurantId, table)
    const base = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin
    const url = new URL(`/menu/${encodeURIComponent(restaurantId)}`, base)
    url.searchParams.set('table', table)
    url.searchParams.set('tableToken', token)
    return Response.json({ success: true, url: url.toString(), table, expiresInSeconds: 600 },
      { headers: { 'Cache-Control': 'no-store, private' } })
  } catch (error) { return failOrdering(error) }
}
