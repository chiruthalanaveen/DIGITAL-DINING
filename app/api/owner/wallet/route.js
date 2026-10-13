import { NextResponse } from 'next/server'
import { requireApprovedOwner } from '@/lib/server/ownerApproval'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function reply(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const restaurantId = String(searchParams.get('restaurantId') || '').trim()
    const access = await requireApprovedOwner(request, restaurantId)
    if (!access.ok) {
      return reply(
        { success: false, code: access.code, message: access.message },
        access.status
      )
    }

    const admin = getAdminSupabase()
    const [walletResult, transactionResult] = await Promise.all([
      admin
        .from('delivery_store_wallets')
        .select(
          'restaurant_id,balance_paise,pending_fee_paise,platform_fee_paise,restaurant_platform_fee_paise,restaurant_fee_charge_customer,delivery_fee_charge_customer,restaurant_customer_fee_checkout_live,delivery_customer_fee_checkout_live,order_block_threshold_paise,min_topup_paise,updated_at'
        )
        .eq('restaurant_id', access.restaurantId)
        .maybeSingle(),
      admin
        .from('delivery_wallet_transactions')
        .select(
          'id,transaction_type,amount_paise,balance_after_paise,description,created_at'
        )
        .eq('restaurant_id', access.restaurantId)
        .order('created_at', { ascending: false })
        .limit(100),
    ])

    if (walletResult.error) throw walletResult.error
    if (transactionResult.error) throw transactionResult.error
    if (!walletResult.data) {
      return reply(
        { success: false, code: 'WALLET_NOT_FOUND', message: 'Wallet is not configured for this business.' },
        404
      )
    }

    const wallet = walletResult.data
    const balancePaise = Number(wallet.balance_paise || 0)
    const pendingFeesPaise = Number(wallet.pending_fee_paise || 0)
    const thresholdPaise = Number(wallet.order_block_threshold_paise || 0)
    const spendablePaise = balancePaise - pendingFeesPaise
    const restaurantChargeCustomer = wallet.restaurant_fee_charge_customer === true
    const deliveryChargeCustomer = wallet.delivery_fee_charge_customer === true
    const restaurantCustomerCheckoutLive = wallet.restaurant_customer_fee_checkout_live === true
    const deliveryCustomerCheckoutLive = wallet.delivery_customer_fee_checkout_live === true

    return reply({
      success: true,
      restaurantId: access.restaurantId,
      restaurantName: access.restaurantName,
      wallet: {
        balancePaise,
        pendingFeesPaise,
        spendablePaise,
        platformFeePaise: Number(wallet.platform_fee_paise || 0),
        restaurantPlatformFeePaise: Number(wallet.restaurant_platform_fee_paise ?? 500),
        restaurantChargeCustomer,
        deliveryChargeCustomer,
        // These flags are server-controlled; the owner cannot activate them.
        restaurantCustomerCheckoutLive,
        deliveryCustomerCheckoutLive,
        restaurantCustomerBillingActive: restaurantChargeCustomer && restaurantCustomerCheckoutLive,
        deliveryCustomerBillingActive: deliveryChargeCustomer && deliveryCustomerCheckoutLive,
        thresholdPaise,
        minimumTopupPaise: Number(wallet.min_topup_paise || 200000),
        lowBalance: spendablePaise <= thresholdPaise,
        updatedAt: wallet.updated_at,
      },
      transactions: (transactionResult.data || []).map((item) => ({
        id: item.id,
        type: item.transaction_type,
        amountPaise: Number(item.amount_paise || 0),
        balanceAfterPaise: Number(item.balance_after_paise || 0),
        description: item.description || '',
        createdAt: item.created_at,
      })),
    })
  } catch (error) {
    console.error('[OWNER WALLET GET]', error)
    return reply(
      { success: false, message: 'Unable to load your wallet. Please try again.' },
      500
    )
  }
}
