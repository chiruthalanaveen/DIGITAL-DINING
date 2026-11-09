import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const json = (body, status = 200) => NextResponse.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
})

// Read-only. Never expose service-role credentials to the browser.
export async function GET(request) {
  const session = await requireAdmin(request)
  if (!session) return json({ success: false, message: 'Admin authentication required.' }, 401)

  try {
    const admin = getAdminSupabase()
    const [stores, wallets] = await Promise.all([
      admin.from('ecommerce_stores')
        .select('id,name,slug,category,approval_status,is_active')
        .order('name', { ascending: true }).limit(500),
      admin.from('ecommerce_store_wallets')
        .select('store_id,balance_paise,pending_fee_paise,platform_fee_paise,min_topup_paise,order_block_threshold_paise,updated_at')
        .limit(500),
    ])
    if (stores.error) throw stores.error
    if (wallets.error) throw wallets.error
    const byStore = new Map((wallets.data || []).map(w => [w.store_id, w]))
    const rows = (stores.data || []).map(store => {
      const wallet = byStore.get(store.id)
      const balance = Number(wallet?.balance_paise ?? 0)
      const pending = Number(wallet?.pending_fee_paise ?? 0)
      return {
        ...store,
        walletExists: Boolean(wallet),
        balancePaise: balance,
        pendingFeePaise: pending,
        spendablePaise: balance - pending,
        platformFeePaise: Number(wallet?.platform_fee_paise ?? 500),
        minTopupPaise: Number(wallet?.min_topup_paise ?? 200000),
        orderBlockThresholdPaise: Number(wallet?.order_block_threshold_paise ?? 50000),
        updatedAt: wallet?.updated_at ?? null,
      }
    })
    return json({ success: true, stores: rows })
  } catch (error) {
    console.error('[ECOMMERCE ADMIN WALLET READ]', error)
    return json({ success: false, message: 'Unable to load e-commerce wallets.' }, 500)
  }
}