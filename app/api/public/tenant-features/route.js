import { NextResponse } from 'next/server'
import {
  TENANT_FEATURES,
  isTenantFeatureEnabled
} from '@/lib/server/tenantFeatures'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)

    const restaurantId = String(
      searchParams.get('restaurantId') || ''
    ).trim()

    if (!restaurantId) {
      return NextResponse.json(
        {
          success: false,
          message: 'Restaurant ID is required.'
        },
        { status: 400 }
      )
    }

    const [
      restaurantEnabled,
      qrMenuEnabled,
      dineInEnabled,
      takeawayEnabled,
      payAtCounterEnabled,
      restaurantRazorpayEnabled,
      offersEnabled,
      highlyReorderedEnabled,
      gstEnabled,
      digitalInvoiceEnabled,
      restaurantNotificationsEnabled
    ] = await Promise.all([
      isTenantFeatureEnabled(
        restaurantId,
        TENANT_FEATURES.RESTAURANT
      ),

      isTenantFeatureEnabled(
        restaurantId,
        TENANT_FEATURES.QR_MENU
      ),

      isTenantFeatureEnabled(
        restaurantId,
        TENANT_FEATURES.DINE_IN
      ),

      isTenantFeatureEnabled(
        restaurantId,
        TENANT_FEATURES.TAKEAWAY
      ),

      isTenantFeatureEnabled(
        restaurantId,
        TENANT_FEATURES.PAY_AT_COUNTER
      ),

      isTenantFeatureEnabled(
        restaurantId,
        TENANT_FEATURES.RESTAURANT_RAZORPAY
      ),

      isTenantFeatureEnabled(
        restaurantId,
        TENANT_FEATURES.OFFERS
      ),

      isTenantFeatureEnabled(
        restaurantId,
        TENANT_FEATURES.HIGHLY_REORDERED
      ),

      isTenantFeatureEnabled(
        restaurantId,
        TENANT_FEATURES.GST
      ),

      isTenantFeatureEnabled(
        restaurantId,
        TENANT_FEATURES.DIGITAL_INVOICE
      ),

      isTenantFeatureEnabled(
        restaurantId,
        TENANT_FEATURES.RESTAURANT_NOTIFICATIONS
      )
    ])

    const allowed =
      restaurantEnabled &&
      qrMenuEnabled

    return NextResponse.json(
      {
        success: true,

        restaurant_enabled: restaurantEnabled,
        qr_menu_enabled: qrMenuEnabled,

        dine_in_enabled: dineInEnabled,
        takeaway_enabled: takeawayEnabled,

        pay_at_counter_enabled:
          payAtCounterEnabled,

        restaurant_razorpay_enabled:
          restaurantRazorpayEnabled,

        offers_enabled: offersEnabled,

        highly_reordered_enabled:
          highlyReorderedEnabled,

        gst_enabled: gstEnabled,

        digital_invoice_enabled:
          digitalInvoiceEnabled,

        restaurant_notifications_enabled:
          restaurantNotificationsEnabled,

        allowed,

        message: allowed
          ? null
          : 'Online ordering is temporarily unavailable for this restaurant.'
      },
      {
        status: 200,
        headers: {
          'Cache-Control':
            'no-store, no-cache, must-revalidate, max-age=0'
        }
      }
    )
  } catch (error) {
    console.error(
      '[TENANT FEATURES] Public feature check failed:',
      error
    )

    return NextResponse.json(
      {
        success: false,
        message:
          'Unable to verify restaurant feature access.'
      },
      { status: 500 }
    )
  }
}