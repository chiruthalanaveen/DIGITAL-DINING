import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const TENANT_FEATURES = {
  // Restaurant
  RESTAURANT: 'restaurant_enabled',
  QR_MENU: 'qr_menu_enabled',
  DINE_IN: 'dine_in_enabled',
  TAKEAWAY: 'takeaway_enabled',
  PAY_AT_COUNTER: 'pay_at_counter_enabled',
  RESTAURANT_RAZORPAY: 'restaurant_razorpay_enabled',
  OFFERS: 'offers_enabled',
  HIGHLY_REORDERED: 'highly_reordered_enabled',
  KDS: 'kds_enabled',
  WAITER_PORTAL: 'waiter_portal_enabled',
  MANAGER_PORTAL: 'manager_portal_enabled',
  STAFF_MANAGEMENT: 'staff_management_enabled',
  GST: 'gst_enabled',
  DIGITAL_INVOICE: 'digital_invoice_enabled',
  RESTAURANT_NOTIFICATIONS: 'restaurant_notifications_enabled',

  // Delivery
  DELIVERY: 'delivery_enabled',
  DELIVERY_ORDERING: 'delivery_customer_ordering_enabled',
  COD: 'cod_enabled',
  DELIVERY_RAZORPAY: 'delivery_razorpay_enabled',
  DELIVERY_FEE: 'delivery_fee_enabled',
  MINIMUM_ORDER: 'minimum_order_enabled',
  HANDLING_CHARGE: 'handling_charge_enabled',
  SURGE_PRICING: 'surge_pricing_enabled',
  DELIVERY_RADIUS: 'delivery_radius_enabled',
  CUSTOMER_LIVE_LOCATION: 'customer_live_location_enabled',
  AUTO_DRIVER_ASSIGNMENT: 'auto_driver_assignment_enabled',
  MANUAL_DRIVER_ASSIGNMENT: 'manual_driver_assignment_enabled',
  DELIVERY_TRACKING: 'delivery_tracking_enabled',
  DRIVER_NUMBER: 'driver_number_enabled',
  MANAGER_DELIVERY: 'manager_delivery_management_enabled',
  OWNER_DELIVERY: 'owner_delivery_management_enabled',
  BARCODE_SCANNING: 'barcode_scanning_enabled',
  INVENTORY: 'inventory_enabled',
  PACKING: 'packing_enabled',
  COD_RECONCILIATION: 'cod_reconciliation_enabled',
  LIVE_SUPPORT: 'live_support_enabled',
  RETURN_REPLACEMENT: 'return_replacement_enabled',
  RETURN_PICKUP: 'return_pickup_enabled',
  BILL_GENERATION: 'bill_generation_enabled',
  DELIVERY_NOTIFICATIONS: 'delivery_notifications_enabled',
}

const RESTAURANT_FEATURES = new Set([
  TENANT_FEATURES.RESTAURANT,
  TENANT_FEATURES.QR_MENU,
  TENANT_FEATURES.DINE_IN,
  TENANT_FEATURES.TAKEAWAY,
  TENANT_FEATURES.PAY_AT_COUNTER,
  TENANT_FEATURES.RESTAURANT_RAZORPAY,
  TENANT_FEATURES.OFFERS,
  TENANT_FEATURES.HIGHLY_REORDERED,
  TENANT_FEATURES.KDS,
  TENANT_FEATURES.WAITER_PORTAL,
  TENANT_FEATURES.MANAGER_PORTAL,
  TENANT_FEATURES.STAFF_MANAGEMENT,
  TENANT_FEATURES.GST,
  TENANT_FEATURES.DIGITAL_INVOICE,
  TENANT_FEATURES.RESTAURANT_NOTIFICATIONS,
])

const DELIVERY_FEATURES = new Set([
  TENANT_FEATURES.DELIVERY,
  TENANT_FEATURES.DELIVERY_ORDERING,
  TENANT_FEATURES.COD,
  TENANT_FEATURES.DELIVERY_RAZORPAY,
  TENANT_FEATURES.DELIVERY_FEE,
  TENANT_FEATURES.MINIMUM_ORDER,
  TENANT_FEATURES.HANDLING_CHARGE,
  TENANT_FEATURES.SURGE_PRICING,
  TENANT_FEATURES.DELIVERY_RADIUS,
  TENANT_FEATURES.CUSTOMER_LIVE_LOCATION,
  TENANT_FEATURES.AUTO_DRIVER_ASSIGNMENT,
  TENANT_FEATURES.MANUAL_DRIVER_ASSIGNMENT,
  TENANT_FEATURES.DELIVERY_TRACKING,
  TENANT_FEATURES.DRIVER_NUMBER,
  TENANT_FEATURES.MANAGER_DELIVERY,
  TENANT_FEATURES.OWNER_DELIVERY,
  TENANT_FEATURES.BARCODE_SCANNING,
  TENANT_FEATURES.INVENTORY,
  TENANT_FEATURES.PACKING,
  TENANT_FEATURES.COD_RECONCILIATION,
  TENANT_FEATURES.LIVE_SUPPORT,
  TENANT_FEATURES.RETURN_REPLACEMENT,
  TENANT_FEATURES.RETURN_PICKUP,
  TENANT_FEATURES.BILL_GENERATION,
  TENANT_FEATURES.DELIVERY_NOTIFICATIONS,
])

function cleanId(value) {
  return String(value || '').trim()
}

function featureExists(feature) {
  return Object.values(TENANT_FEATURES).includes(feature)
}

function moduleMasterFor(feature) {
  if (
    RESTAURANT_FEATURES.has(feature) &&
    feature !== TENANT_FEATURES.RESTAURANT
  ) {
    return TENANT_FEATURES.RESTAURANT
  }

  if (
    DELIVERY_FEATURES.has(feature) &&
    feature !== TENANT_FEATURES.DELIVERY
  ) {
    return TENANT_FEATURES.DELIVERY
  }

  return null
}

/**
 * Reads all Super Admin feature controls for one tenant.
 *
 * IMPORTANT:
 * Missing row = enabled.
 *
 * This keeps existing restaurants working even if they do not yet have
 * a tenant_feature_controls record.
 */
export async function getTenantFeatures(restaurantId) {
  const id = cleanId(restaurantId)

  if (!id) {
    return {
      success: false,
      features: null,
      error: 'Restaurant ID is required.',
    }
  }

  const admin = getAdminSupabase()

  const { data, error } = await admin
    .from('tenant_feature_controls')
    .select('*')
    .eq('restaurant_id', id)
    .maybeSingle()

  if (error) {
    console.error(
      'Unable to read tenant feature controls:',
      error
    )

    return {
      success: false,
      features: null,
      error: error.message,
    }
  }

  /*
   * Existing tenant with no feature-control row:
   * keep backward compatibility by treating features as enabled.
   */
  return {
    success: true,
    features: data || null,
    error: null,
  }
}

/**
 * Returns whether a specific feature is enabled.
 *
 * Child features also respect their module master switch:
 *
 * restaurant_enabled = false
 *      ↓
 * qr_menu_enabled cannot be used even if it is true.
 *
 * delivery_enabled = false
 *      ↓
 * cod_enabled cannot be used even if it is true.
 */
export async function isTenantFeatureEnabled(
  restaurantId,
  feature
) {
  if (!featureExists(feature)) {
    console.error(
      `Unknown tenant feature requested: ${feature}`
    )

    return false
  }

  const result =
    await getTenantFeatures(restaurantId)

  if (!result.success) {
    /*
     * Fail closed when the feature table cannot be read.
     * This prevents an API/database problem from bypassing
     * Super Admin restrictions.
     */
    return false
  }

  const features = result.features

  /*
   * No row yet = preserve existing tenant behavior.
   */
  if (!features) {
    return true
  }

  const masterFeature =
    moduleMasterFor(feature)

  if (
    masterFeature &&
    features[masterFeature] === false
  ) {
    return false
  }

  return features[feature] !== false
}

/**
 * Convenient result for API routes.
 */
export async function requireTenantFeature(
  restaurantId,
  feature
) {
  const enabled =
    await isTenantFeatureEnabled(
      restaurantId,
      feature
    )

  if (enabled) {
    return {
      allowed: true,
      status: 200,
      code: null,
      message: null,
    }
  }

  return {
    allowed: false,
    status: 403,
    code: 'FEATURE_DISABLED',
    message:
      'This feature has been disabled for this account. Please contact the administrator.',
  }
}