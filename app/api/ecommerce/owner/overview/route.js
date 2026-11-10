// Destination: app/api/ecommerce/owner/overview/route.js
import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const reply = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(request) {
  const authorization = request.headers.get('authorization') || ''
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization)
  if (!match) return reply({ success: false, message: 'Sign in to your owner account.' }, 401)
  try {
    const admin = getAdminSupabase()
    // Verify the token against Supabase Auth, not an untrusted client-supplied user ID.
    const { data: auth, error: authError } = await admin.auth.getUser(match[1])
    if (authError || !auth?.user?.id) return reply({ success: false, message: 'Your session has expired. Sign in again.' }, 401)
    const userId = auth.user.id
    const { data: memberships, error: membershipError } = await admin.from('ecommerce_store_members')
      .select('store_id,role').eq('user_id', userId).eq('role', 'owner').limit(100)
    if (membershipError) throw membershipError
    const storeIds = (memberships || []).map(m => m.store_id)
    if (!storeIds.length) return reply({ success: true, stores: [], selected: null, overview: null })
    const { data: stores, error: storesError } = await admin.from('ecommerce_stores')
      .select('id,name,slug,category,theme,approval_status,is_active,currency,payment_mode,fulfillment_mode')
      .in('id', storeIds).order('name')
    if (storesError) throw storesError
    const requestedId = new URL(request.url).searchParams.get('storeId')
    if (requestedId && !uuid.test(requestedId)) return reply({ success: false, message: 'Invalid website ID.' }, 400)
    if (requestedId && !(stores || []).some(s => s.id === requestedId)) return reply({ success: false, message: 'Website access denied.' }, 403)
    const selected = (stores || []).find(s => s.id === requestedId) || stores?.[0] || null
    if (!selected) return reply({ success: true, stores: [], selected: null, overview: null })
    const id = selected.id
    const [wallet, products, variants, orders, transactions] = await Promise.all([
      admin.from('ecommerce_store_wallets').select('balance_paise,pending_fee_paise,platform_fee_paise,min_topup_paise,order_block_threshold_paise').eq('store_id', id).maybeSingle(),
      admin.from('ecommerce_products').select('id,name,status,created_at').eq('store_id', id).order('created_at', { ascending: false }).limit(100),
      admin.from('ecommerce_product_variants').select('id,product_id,stock_quantity,price_paise,is_active').eq('store_id', id).limit(1000),
      admin.from('ecommerce_orders').select('id,order_status,payment_status,payment_mode,total_paise,created_at').eq('store_id', id).order('created_at', { ascending: false }).limit(100),
      admin.from('ecommerce_wallet_transactions').select('id,transaction_type,amount_paise,created_at,description').eq('store_id', id).order('created_at', { ascending: false }).limit(15),
    ])
    for (const result of [wallet, products, variants, orders, transactions]) if (result.error) throw result.error
    const w = wallet.data
    const productRows = products.data || []
    const variantRows = variants.data || []
    const orderRows = orders.data || []
    const completed = orderRows.filter(o => o.order_status === 'delivered' && ['paid','partially_paid'].includes(o.payment_status))
    return reply({
      success: true,
      stores,
      selected,
      overview: {
        wallet: w ? { ...w, spendable_paise: Math.max(0, Number(w.balance_paise) - Number(w.pending_fee_paise)) } : null,
        products: productRows,
        variants: variantRows,
        orders: orderRows,
        transactions: transactions.data || [],
        metrics: {
          productCountShown: productRows.length,
          activeProductsShown: productRows.filter(p => p.status === 'active').length,
          lowStockVariantsShown: variantRows.filter(v => v.is_active && v.stock_quantity <= 5).length,
          ordersShown: orderRows.length,
          awaitingFulfillmentShown: orderRows.filter(o => ['confirmed','packing','shipped'].includes(o.order_status)).length,
          deliveredRevenuePaiseShown: completed.reduce((sum, o) => sum + Number(o.total_paise || 0), 0),
        },
        limits: { products: 100, variants: 1000, orders: 100, transactions: 15 },
      },
    })
  } catch (error) {
    console.error('[ECOMMERCE OWNER OVERVIEW]', error)
    return reply({ success: false, message: 'Unable to load your website dashboard.' }, 500)
  }
}