'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  useRouter,
} from 'next/navigation'

import AdminWalletControls from '@/app/components/AdminWalletControls'
import AdminRestaurantFeeEditor from '@/app/components/AdminRestaurantFeeEditor'
import AdminDeliverySignupSettings from '@/app/components/AdminDeliverySignupSettings'
import AdminPrivacyDeletionReviews from '@/app/components/AdminPrivacyDeletionReviews'
import AdminMaintenanceSettings from '@/app/components/AdminMaintenanceSettings'
import AdminClientWebsites from '@/app/components/commerce/AdminClientWebsites'

const NAV = [
  ['overview', 'Overview'],
  ['custom-plans', 'Custom Plans'],
  ['registrations', 'Registrations'],
  ['privacy-deletions', 'Account Deletions'],
  ['wallet-controls', 'Wallet Controls'],
  ['delivery-signup', 'Delivery Signup'],
  ['tenants', 'Tenants & Access'],
  ['operations', 'Operations'],
  ['delivery-orders', 'Delivery Orders'],
  ['people', 'Users & Staff'],
  ['inventory', 'Inventory'],
  ['live-support', 'Live Support'],
  ['support', 'Help Centre'],
  ['reviews', 'Reviews'],
  ['payments', 'Payments'],
  ['system', 'System'],
  ['client-websites', 'E-Commerce Website Management'],
  ['audit', 'Audit Log'],
]

// UI navigation groups and icons: presentation only. Existing module keys remain untouched.
const NAV_GROUPS = [
  { title: 'Workspace', items: ['overview', 'registrations', 'wallet-controls', 'tenants'] },
  { title: 'Commerce', items: ['operations', 'delivery-orders', 'payments', 'inventory'] },
  { title: 'Growth & Onboarding', items: ['custom-plans', 'delivery-signup', 'people'] },
  { title: 'Customer Experience', items: ['live-support', 'support', 'reviews'] },
  { title: 'Administration', items: ['client-websites', 'privacy-deletions', 'system', 'audit'] },
]

const NAV_ICONS = {
  overview: 'dashboard', 'custom-plans': 'sparkles', registrations: 'user-check', 'privacy-deletions': 'shield',
  'wallet-controls': 'wallet', 'delivery-signup': 'truck', tenants: 'building',
  operations: 'activity', 'delivery-orders': 'package', people: 'users',
  inventory: 'layers', 'live-support': 'messages', support: 'life-ring',
  reviews: 'star', payments: 'credit', system: 'settings', 'client-websites': 'building', audit: 'shield',
}

const NAV_DESCRIPTIONS = {
  overview: 'All business activity at a glance',
  'custom-plans': 'Review incoming business enquiries',
  registrations: 'Approve new business registrations',
  'privacy-deletions': 'Review account deletion requests and audit decisions',
  'wallet-controls': 'Platform wallet and recharge management',
  'delivery-signup': 'DD MART onboarding and settings',
  tenants: 'Manage restaurants, access and platform fees',
  operations: 'Cross-platform operations and activity',
  'delivery-orders': 'Delivery order history and reports',
  people: 'Owners, staff and delivery teams',
  inventory: 'Stock and availability monitoring',
  'live-support': 'Active customer support conversations',
  support: 'Help Centre ticket management',
  reviews: 'Customer feedback and moderation',
  payments: 'Payment configurations and controls',
  system: 'Platform settings and diagnostics',
  'client-websites': 'Independent storefronts, owner applications and website configuration',
  audit: 'Administrative change history',
}

function AdminUIIcon({ name = 'dashboard', size = 18, className = '' }) {
  const common = { strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  const shapes = {
    dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></>,
    sparkles: <><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/><path d="m19 17 .6 1.4L21 19l-1.4.6L19 21l-.6-1.4L17 19l1.4-.6L19 17Z"/></>,
    'user-check': <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/></>,
    wallet: <><rect x="3" y="6" width="18" height="15" rx="2"/><path d="M3 10V5a2 2 0 0 1 2-2h13"/><path d="M16 14h5v4h-5a2 2 0 0 1 0-4Z"/></>,
    truck: <><path d="M3 6h12v12H3z"/><path d="M15 10h4l3 4v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>,
    building: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 21v-5h6v5M8 7h1m6 0h1M8 11h1m6 0h1"/></>,
    activity: <><path d="M3 12h4l3-7 4 14 3-7h4"/></>,
    package: <><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="M3 7v10l9 5 9-5V7M12 12v10"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6m1 4a5 5 0 0 1 3 5"/></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/></>,
    messages: <><path d="M20 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-3.7-.8L3 21l1.8-4.8A8.5 8.5 0 1 1 20 11.5Z"/><path d="M8 11h8m-8 4h5"/></>,
    'life-ring': <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="m5.6 5.6 3.6 3.6m5.6 5.6 3.6 3.6m0-12.8-3.6 3.6m-5.6 5.6-3.6 3.6"/></>,
    star: <><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.9L12 3Z"/></>,
    credit: <><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M2.5 10h19M6 15h4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4.9a7 7 0 0 0-1.7-1L14.5 3h-4l-.3 2.9a7 7 0 0 0-1.7 1L6.1 6 4 9.5 6 11a8 8 0 0 0 0 2l-2 1.5L6.1 18l2.4-.9a7 7 0 0 0 1.7 1l.3 2.9h4l.3-2.9a7 7 0 0 0 1.7-1l2.4.9 2-3.5L18.9 13a7 7 0 0 0 .1-1Z"/></>,
    shield: <><path d="m12 2 8 4v6c0 5-3.4 8-8 10-4.6-2-8-5-8-10V6l8-4Z"/><path d="m9 12 2 2 4-4"/></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
    chevron: <><path d="m9 18 6-6-6-6"/></>,
    search: <><circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9a7 7 0 0 1 12-3l2.5 1M4 17l2.5 1A7 7 0 0 0 18.5 15"/></>,
    logout: <><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M14 16l4-4-4-4M9 12h9"/></>,
    close: <><path d="M5 5 19 19M19 5 5 19"/></>,
    arrow: <><path d="M4 12h15m-6-6 6 6-6 6"/></>,
    globe: <><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></>,
    command: <><path d="M9 7V5a3 3 0 1 0-3 3h2v8H6a3 3 0 1 0 3 3v-2h6v2a3 3 0 1 0 3-3h-2V8h2a3 3 0 1 0-3-3v2H9Z"/></>,
    chart: <><path d="M4 20V12M10 20V4M16 20v-9M22 20v-6"/></>,
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" {...common}
      className={className} aria-hidden="true" focusable="false">
      {shapes[name] || shapes.dashboard}
    </svg>
  )
}

const PLAN_OPTIONS = [
  [
    'restaurant_pro',
    'Restaurant',
  ],
  [
    'delivery',
    'Delivery',
  ],
  [
    'restaurant_resort_pro',
    'Restaurant + Resort',
  ],
  [
    'restaurant_delivery',
    'Restaurant + Delivery',
  ],
  [
    'restaurant_resort_delivery',
    'Restaurant + Resort + Delivery',
  ],
]

const STATUS_OPTIONS = [
  'active',
  'trial',
  'trialing',
  'pending',
  'inactive',
  'expired',
  'suspended',
  'cancelled',
]

const BILLING_OPTIONS = [
  '1month',
  '6months',
  '12months',
]

const DEFAULT_TENANT_FEATURES = {
  restaurant_enabled: true,
  qr_menu_enabled: true,
  dine_in_enabled: true,
  takeaway_enabled: true,
  pay_at_counter_enabled: true,
  restaurant_razorpay_enabled: true,
  offers_enabled: true,
  highly_reordered_enabled: true,
  kds_enabled: true,
  waiter_portal_enabled: true,
  manager_portal_enabled: true,
  staff_management_enabled: true,
  gst_enabled: true,
  digital_invoice_enabled: true,
  restaurant_notifications_enabled: true,

  delivery_enabled: true,
  delivery_customer_ordering_enabled: true,
  cod_enabled: true,
  delivery_razorpay_enabled: true,
  delivery_fee_enabled: true,
  minimum_order_enabled: true,
  handling_charge_enabled: true,
  surge_pricing_enabled: true,
  delivery_radius_enabled: true,
  customer_live_location_enabled: true,
  auto_driver_assignment_enabled: true,
  manual_driver_assignment_enabled: true,
  delivery_tracking_enabled: true,
  driver_number_enabled: true,
  manager_delivery_management_enabled: true,
  owner_delivery_management_enabled: true,
  barcode_scanning_enabled: true,
  inventory_enabled: true,
  packing_enabled: true,
  cod_reconciliation_enabled: true,
  live_support_enabled: true,
  return_replacement_enabled: true,
  return_pickup_enabled: true,
  bill_generation_enabled: true,
  delivery_notifications_enabled: true,
}

const RESTAURANT_FEATURE_OPTIONS = [
  ['restaurant_enabled', 'Restaurant Access', 'Master switch for the complete restaurant module.', true],
  ['qr_menu_enabled', 'QR Menu', 'Allow customers to open and use the restaurant QR menu.'],
  ['dine_in_enabled', 'Dine-In', 'Allow dine-in ordering.'],
  ['takeaway_enabled', 'Takeaway / Parcel', 'Allow takeaway and parcel ordering.'],
  ['pay_at_counter_enabled', 'Pay at Counter', 'Allow Pay at Counter as a payment option.'],
  ['restaurant_razorpay_enabled', 'Razorpay', 'Allow online Razorpay payments for restaurant orders.'],
  ['offers_enabled', 'Offers of the Day', 'Allow restaurant offers and offer ordering.'],
  ['highly_reordered_enabled', 'Highly Reordered', 'Allow the Highly Reordered menu section.'],
  ['kds_enabled', 'KDS / Kitchen', 'Allow Kitchen Display System access.'],
  ['waiter_portal_enabled', 'Waiter Portal', 'Allow waiter portal access.'],
  ['manager_portal_enabled', 'Manager Portal', 'Allow restaurant manager portal access.'],
  ['staff_management_enabled', 'Staff Management', 'Allow restaurant staff management.'],
  ['gst_enabled', 'GST', 'Allow GST calculation and GST settings.'],
  ['digital_invoice_enabled', 'Digital Invoice', 'Allow digital invoice generation.'],
  ['restaurant_notifications_enabled', 'Order Notifications', 'Allow restaurant order notifications.'],
]

const DELIVERY_FEATURE_OPTIONS = [
  ['delivery_enabled', 'Delivery Access', 'Master switch for the complete delivery module.', true],
  ['delivery_customer_ordering_enabled', 'Customer Delivery Ordering', 'Allow customers to place delivery orders.'],
  ['cod_enabled', 'Cash on Delivery', 'Allow COD for delivery orders.'],
  ['delivery_razorpay_enabled', 'Razorpay', 'Allow Razorpay for delivery orders.'],
  ['delivery_fee_enabled', 'Delivery Fee', 'Allow delivery fee calculation.'],
  ['minimum_order_enabled', 'Minimum Order Rule', 'Allow minimum-order based delivery rules.'],
  ['handling_charge_enabled', 'Handling Charge', 'Allow handling charges.'],
  ['surge_pricing_enabled', 'Surge Pricing', 'Allow owner/manager surge pricing controls.'],
  ['delivery_radius_enabled', 'Delivery Radius', 'Allow delivery-radius validation.'],
  ['customer_live_location_enabled', 'Customer Live Location', 'Allow customer location capture for delivery.'],
  ['auto_driver_assignment_enabled', 'Auto Delivery-Boy Assignment', 'Allow automatic delivery-boy assignment.'],
  ['manual_driver_assignment_enabled', 'Manual Delivery-Boy Assignment', 'Allow manual delivery-boy assignment.'],
  ['delivery_tracking_enabled', 'Delivery Tracking', 'Allow delivery order tracking.'],
  ['driver_number_enabled', 'Show Delivery-Boy Number', 'Allow customers to see the assigned delivery-boy number.'],
  ['manager_delivery_management_enabled', 'Manager Delivery Management', 'Allow manager delivery management tools.'],
  ['owner_delivery_management_enabled', 'Owner Delivery Management', 'Allow owner delivery management tools.'],
  ['barcode_scanning_enabled', 'Barcode Scanning', 'Allow barcode-based product scanning.'],
  ['inventory_enabled', 'Inventory / Opening Stock', 'Allow inventory and opening-stock management.'],
  ['packing_enabled', 'Packing', 'Allow packing workflow and packer features.'],
  ['cod_reconciliation_enabled', 'COD Reconciliation', 'Allow COD reconciliation tools.'],
  ['live_support_enabled', 'Live Support Chat', 'Allow customer-to-manager live support.'],
  ['return_replacement_enabled', 'Return / Replacement Management', 'Allow return and replacement handling.'],
  ['return_pickup_enabled', 'Return Pickup', 'Allow return-pickup assignment and workflow.'],
  ['bill_generation_enabled', 'Bill Generation', 'Allow owner/manager bill generation.'],
  ['delivery_notifications_enabled', 'Delivery Notifications', 'Allow delivery notifications.'],
]

function money(value) {
  return `₹${Number(
    value || 0
  ).toLocaleString(
    'en-IN',
    {
      maximumFractionDigits:
        2,
    }
  )}`
}

function formatDate(
  value
) {
  if (!value) {
    return '—'
  }

  const date =
    new Date(value)

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '—'
  }

  return date.toLocaleString(
    'en-IN',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }
  )
}

function shortDate(
  value
) {
  if (!value) {
    return ''
  }

  const date =
    new Date(value)

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return ''
  }

  return date
    .toISOString()
    .slice(
      0,
      10
    )
}

function label(
  value
) {
  return String(
    value || ''
  )
    .replaceAll(
      '_',
      ' '
    )
    .replace(
      /\b\w/g,
      (char) =>
        char.toUpperCase()
    )
}

function Metric({ label: metricLabel, value, hint = '' }) {
  const normalized = String(metricLabel || '').toLowerCase()
  const icon = /wallet|revenue|amount|payment|fee|value|price/.test(normalized)
    ? 'credit'
    : /delivery|orders|shipment/.test(normalized)
      ? 'package'
      : /tenant|restaurant|resort|store/.test(normalized)
        ? 'building'
        : /user|staff|driver|packer|people/.test(normalized)
          ? 'users'
          : /support|help/.test(normalized)
            ? 'messages'
            : /rating|review/.test(normalized)
              ? 'star'
              : /stock|inventory/.test(normalized)
                ? 'layers'
                : 'chart'

  return (
    <article className="dd-metric relative min-w-0 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold leading-4 tracking-wide text-neutral-400">
          {metricLabel}
        </p>
        <span className="dd-metric-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/5 bg-white/[0.035] text-red-300">
          <AdminUIIcon name={icon} size={18} />
        </span>
      </div>
      <p className="mt-4 break-words text-[clamp(1.4rem,2.2vw,1.9rem)] font-black tracking-tight text-white">
        {value}
      </p>
      {hint ? (
        <p className="mt-2 text-[10px] leading-4 text-neutral-500">{hint}</p>
      ) : (
        <span aria-hidden="true" className="mt-2 block h-1 w-8 rounded-full bg-gradient-to-r from-red-500/80 to-orange-400/30" />
      )}
    </article>
  )
}

function Empty({
  children,
}) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/50 px-5 py-10 text-center text-xs text-neutral-500">
      {children}
    </div>
  )
}

function StatusPill({
  value,
}) {
  const normalized =
    String(
      value || ''
    ).toLowerCase()

  const positive =
    [
      'active',
      'trial',
      'trialing',
      'open',
      'paid',
      'delivered',
      'working',
      'completed',
    ].includes(
      normalized
    )

  const warning =
    [
      'pending',
      'received',
      'confirmed',
      'preparing',
      'packed',
      'out_for_delivery',
      'assigned',
      'picked_up',
    ].includes(
      normalized
    )

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${
        positive
          ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
          : warning
            ? 'border-amber-500/25 bg-amber-500/10 text-amber-400'
            : 'border-red-500/25 bg-red-500/10 text-red-400'
      }`}
    >
      {label(
        value ||
          'unknown'
      )}
    </span>
  )
}

function CustomPlanRequestCard({
  request,
  action,
  actionLoading,
}) {
  const [
    status,
    setStatus,
  ] = useState(
    request?.status ||
      'new'
  )

  const [
    quotedMonthlyPrice,
    setQuotedMonthlyPrice,
  ] = useState(
    request?.quoted_monthly_price ??
      ''
  )

  const [
    adminNotes,
    setAdminNotes,
  ] = useState(
    request?.admin_notes ||
      ''
  )

  const requirements = [
    {
      key: 'Restaurant',
      selected:
        request?.restaurant_selected,
      items:
        request?.restaurant_requirements,
    },
    {
      key: 'Delivery',
      selected:
        request?.delivery_selected,
      items:
        request?.delivery_requirements,
    },
    {
      key: 'Resort',
      selected:
        request?.resort_selected,
      items:
        request?.resort_requirements,
    },
  ].filter(
    (module) =>
      module.selected ||
      (
        Array.isArray(
          module.items
        ) &&
        module.items.length > 0
      )
  )

  const save =
    async () => {
      await action({
        action:
          'update_custom_plan_request',
        requestId:
          request.id,
        status,
        quotedMonthlyPrice:
          quotedMonthlyPrice === ''
            ? null
            : quotedMonthlyPrice,
        adminNotes,
      })
    }

  return (
    <article className="rounded-3xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-black text-white">
              {request.customer_name ||
                'Customer'}
            </h2>

            <StatusPill
              value={
                request.status ||
                'new'
              }
            />
          </div>

          <p className="mt-1 text-[10px] text-neutral-500">
            Submitted{' '}
            {formatDate(
              request.created_at
            )}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {request.contact_number && (
              <a
                href={`tel:${request.contact_number}`}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-[9px] font-black text-white"
              >
                Call {request.contact_number}
              </a>
            )}

            {request.email && (
              <a
                href={`mailto:${request.email}`}
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-[9px] font-black text-neutral-300"
              >
                Email
              </a>
            )}
          </div>
        </div>

        <div className="grid min-w-0 gap-1 text-[10px] text-neutral-400 xl:text-right">
          <p>
            <span className="font-black text-neutral-600">
              Business:
            </span>{' '}
            {request.business_name ||
              '—'}
          </p>

          <p>
            <span className="font-black text-neutral-600">
              City:
            </span>{' '}
            {request.business_city ||
              '—'}
          </p>

          <p className="font-mono text-[9px] text-neutral-600">
            {request.id}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-3">
        {requirements.map(
          (module) => (
            <div
              key={module.key}
              className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
            >
              <p className="text-[9px] font-black uppercase tracking-wider text-red-400">
                {module.key}
              </p>

              <div className="mt-3 space-y-2">
                {Array.isArray(
                  module.items
                ) &&
                module.items.length ? (
                  module.items.map(
                    (
                      item,
                      index
                    ) => (
                      <div
                        key={
                          item?.id ||
                          `${module.key}-${index}`
                        }
                        className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-[10px] font-bold leading-5 text-neutral-300"
                      >
                        ✓{' '}
                        {item?.title ||
                          item?.id ||
                          'Requirement'}
                      </div>
                    )
                  )
                ) : (
                  <p className="text-[10px] text-neutral-600">
                    Module selected.
                  </p>
                )}
              </div>
            </div>
          )
        )}
      </div>

      {request.additional_requirements && (
        <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
          <p className="text-[9px] font-black uppercase tracking-wider text-neutral-600">
            Additional Requirements
          </p>

          <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-neutral-300">
            {request.additional_requirements}
          </p>
        </div>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-[220px_220px_minmax(0,1fr)]">
        <label className="block">
          <span className="text-[9px] font-black uppercase tracking-wider text-neutral-600">
            Status
          </span>

          <select
            value={status}
            onChange={(
              event
            ) =>
              setStatus(
                event.target.value
              )
            }
            className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs font-bold text-white outline-none focus:border-red-500"
          >
            {[
              'new',
              'reviewing',
              'contacted',
              'quoted',
              'accepted',
              'rejected',
            ].map(
              (option) => (
                <option
                  key={option}
                  value={option}
                >
                  {label(option)}
                </option>
              )
            )}
          </select>
        </label>

        <label className="block">
          <span className="text-[9px] font-black uppercase tracking-wider text-neutral-600">
            Monthly Quote ₹
          </span>

          <input
            type="number"
            min="0"
            step="1"
            value={
              quotedMonthlyPrice
            }
            onChange={(
              event
            ) =>
              setQuotedMonthlyPrice(
                event.target.value
              )
            }
            placeholder="Enter amount"
            className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs font-bold text-white outline-none focus:border-red-500"
          />
        </label>

        <label className="block">
          <span className="text-[9px] font-black uppercase tracking-wider text-neutral-600">
            Admin / Manager Notes
          </span>

          <textarea
            value={adminNotes}
            onChange={(
              event
            ) =>
              setAdminNotes(
                event.target.value
              )
            }
            rows={3}
            placeholder="Discussion, quotation notes, follow-up details..."
            className="mt-2 w-full resize-y rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs leading-5 text-white outline-none focus:border-red-500"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-neutral-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-neutral-600">
          <span>
            Contacted:{' '}
            {formatDate(
              request.contacted_at
            )}
          </span>

          <span>
            Quoted:{' '}
            {formatDate(
              request.quoted_at
            )}
          </span>

          <span>
            Accepted:{' '}
            {formatDate(
              request.accepted_at
            )}
          </span>
        </div>

        <button
          type="button"
          disabled={
            actionLoading
          }
          onClick={save}
          className="rounded-xl bg-red-600 px-5 py-3 text-[10px] font-black text-white disabled:opacity-50"
        >
          {actionLoading
            ? 'Saving...'
            : 'Save Request'}
        </button>
      </div>
    </article>
  )
}



// Dedicated, server-paginated order report. Does not change any existing admin
// pages or actions, and never accesses privileged Supabase tables in the browser.
function DeliveryOrdersReport() {
  const router = useRouter()
  const emptyFilters = () => ({
    search: '', storeId: '', status: '', paymentStatus: '', paymentMethod: '',
    fromDate: '', toDate: '',
  })
  const [draft, setDraft] = useState(emptyFilters)
  const [applied, setApplied] = useState(emptyFilters)
  const [page, setPage] = useState(1)
  const [reload, setReload] = useState(0)
  const [report, setReport] = useState(null)
  const [busy, setBusy] = useState(true)
  const [reportError, setReportError] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 20000)
    let mounted = true

    async function loadOrders() {
      setBusy(true)
      setReportError('')
      try {
        const query = new URLSearchParams({
          page: String(page),
          pageSize: '25',
        })
        for (const [key, value] of Object.entries(applied)) {
          if (value) query.set(key, value)
        }
        const response = await fetch(`/api/admin/delivery-orders?${query}`, {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
        })
        const result = await response.json().catch(() => ({}))
        if (response.status === 401) {
          router.replace('/admin')
          return
        }
        if (!response.ok || result.success !== true) {
          throw new Error(result.message || 'Unable to load delivery orders.')
        }
        if (mounted) {
          setReport(result)
          setExpandedId(null)
        }
      } catch (error) {
        if (mounted) {
          setReportError(error.name === 'AbortError'
            ? 'The order request timed out. Press Refresh to try again.'
            : error.message || 'Unable to load delivery orders.')
        }
      } finally {
        window.clearTimeout(timeout)
        if (mounted) setBusy(false)
      }
    }

    loadOrders()
    return () => {
      mounted = false
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [applied, page, reload, router])

  const rows = Array.isArray(report?.orders) ? report.orders : []
  const stores = Array.isArray(report?.stores) ? report.stores : []
  const totalCount = Number(report?.totalCount || 0)
  const totalPages = Number(report?.totalPages || 0)
  const pageOrderValue = rows.reduce((sum, row) => sum + (Number(row.total_amount) || 0), 0)
  const deliveredOnPage = rows.filter((row) => row.order_status === 'delivered').length
  const pageStores = new Set(rows.map((row) => row.restaurant_id)).size
  const breakdown = useMemo(() => {
    const byStore = new Map()
    for (const order of rows) {
      const id = String(order.restaurant_id || '')
      const entry = byStore.get(id) || { id, name: order.store_name || 'Unknown store', count: 0, value: 0 }
      entry.count += 1
      entry.value += Number(order.total_amount) || 0
      byStore.set(id, entry)
    }
    return [...byStore.values()].sort((a, b) => b.count - a.count)
  }, [report])

  const fieldClass = 'w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs font-semibold text-white outline-none focus:border-red-500'

  function updateField(key, value) {
    setDraft((previous) => ({ ...previous, [key]: value }))
  }

  function applyFilters(event) {
    event.preventDefault()
    if (draft.fromDate && draft.toDate && draft.fromDate > draft.toDate) {
      setReportError('The start date cannot be later than the end date.')
      return
    }
    setReportError('')
    setPage(1)
    setApplied({ ...draft })
  }

  function clearFilters() {
    setDraft(emptyFilters())
    setApplied(emptyFilters())
    setPage(1)
    setReportError('')
    setReload((value) => value + 1)
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">Multi-store operations</p>
          <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">All Delivery Orders</h1>
          <p className="mt-2 text-xs leading-6 text-neutral-500">
            Secure store-wise records with server-side filtering and pagination through the full order history.
          </p>
        </div>
        <button type="button" onClick={() => setReload((value) => value + 1)}
          disabled={busy}
          className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-xs font-black text-neutral-200 disabled:opacity-50">
          {busy ? 'Loading...' : 'Refresh Orders'}
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Matching Orders (All Pages)" value={totalCount.toLocaleString('en-IN')} />
        <Metric label="Orders on This Page" value={rows.length} />
        <Metric label="Delivered on This Page" value={deliveredOnPage} />
        <Metric label="Order Value (This Page)" value={money(pageOrderValue)} hint="All statuses; not paid revenue" />
      </div>

      <form onSubmit={applyFilters} className="mt-5 rounded-3xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-black text-white">Search and Filter</h2>
          <button type="button" onClick={clearFilters} className="text-[10px] font-black text-red-400 hover:text-red-300">
            Clear All Filters
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="block xl:col-span-2">
            <span className="mb-1.5 block text-[10px] font-bold text-neutral-500">Order code, customer name or mobile</span>
            <input value={draft.search} onChange={(event) => updateField('search', event.target.value)}
              placeholder="Find an order..." maxLength={80} className={fieldClass} />
          </label>
          <label className="block xl:col-span-2">
            <span className="mb-1.5 block text-[10px] font-bold text-neutral-500">Delivery store</span>
            <select value={draft.storeId} onChange={(event) => updateField('storeId', event.target.value)} className={fieldClass}>
              <option value="">All stores</option>
              {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-bold text-neutral-500">Order status</span>
            <select value={draft.status} onChange={(event) => updateField('status', event.target.value)} className={fieldClass}>
              <option value="">All statuses</option>
              {['received', 'confirmed', 'preparing', 'packed', 'out_for_delivery', 'delivered', 'cancelled'].map((item) => (
                <option key={item} value={item}>{label(item)}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-bold text-neutral-500">Payment status</span>
            <select value={draft.paymentStatus} onChange={(event) => updateField('paymentStatus', event.target.value)} className={fieldClass}>
              <option value="">All statuses</option>
              {['pending', 'paid', 'failed', 'refunded', 'unpaid'].map((item) => (
                <option key={item} value={item}>{label(item)}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-bold text-neutral-500">Payment method</span>
            <select value={draft.paymentMethod} onChange={(event) => updateField('paymentMethod', event.target.value)} className={fieldClass}>
              <option value="">All methods</option>
              <option value="cod">Cash on Delivery</option>
              <option value="razorpay">Razorpay</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-bold text-neutral-500">From date (IST)</span>
            <input type="date" value={draft.fromDate} max={draft.toDate || undefined}
              onChange={(event) => updateField('fromDate', event.target.value)} className={fieldClass} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-bold text-neutral-500">To date (IST)</span>
            <input type="date" value={draft.toDate} min={draft.fromDate || undefined}
              onChange={(event) => updateField('toDate', event.target.value)} className={fieldClass} />
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <button type="submit" disabled={busy} className="rounded-xl bg-red-600 px-6 py-3 text-xs font-black text-white disabled:opacity-50">
            Apply Filters
          </button>
        </div>
      </form>

      {reportError && (
        <div role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs font-bold text-red-200">
          {reportError}
        </div>
      )}

      <div className="mt-5 overflow-x-auto rounded-3xl border border-neutral-800 bg-neutral-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-4 py-4">
          <h2 className="text-sm font-black text-white">Store-Wise Delivery Orders</h2>
          <span className="text-[10px] font-bold text-neutral-500">
            Page {page} of {Math.max(totalPages, 1)} · {pageStores} stores on this page
          </span>
        </div>
        {busy && !report ? (
          <div className="p-6 text-xs text-neutral-400">Loading delivery order history...</div>
        ) : rows.length ? (
          <table className="w-full min-w-[1120px] text-left">
            <thead className="border-b border-neutral-800 bg-neutral-950 text-[9px] uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="p-4">Order ID</th><th className="p-4">Store</th>
                <th className="p-4">Customer</th><th className="p-4">Order Status</th>
                <th className="p-4">Payment</th><th className="p-4">Date</th>
                <th className="p-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800 text-xs">
              {rows.map((order) => (
                <tr key={order.id} className="hover:bg-neutral-800/30">
                  <td className="p-4">
                    <button type="button" onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
                      className="break-all text-left font-mono text-[10px] font-bold text-red-300 underline underline-offset-4">
                      {order.order_code || order.id}
                    </button>
                    {expandedId === order.id && (
                      <p className="mt-2 break-all font-mono text-[9px] text-neutral-500">Internal ID: {order.id}</p>
                    )}
                  </td>
                  <td className="p-4">
                    <p className="font-black text-white">{order.store_name || 'Unknown store'}</p>
                    <p className="mt-1 break-all font-mono text-[9px] text-neutral-500">{order.restaurant_id}</p>
                  </td>
                  <td className="p-4">
                    <p className="text-neutral-200">{order.customer_name || '—'}</p>
                    <p className="mt-1 text-[10px] text-neutral-500">{order.customer_mobile || '—'}</p>
                  </td>
                  <td className="p-4"><StatusPill value={order.order_status} /></td>
                  <td className="p-4">
                    <StatusPill value={order.payment_status} />
                    <p className="mt-1 text-[10px] text-neutral-500">{label(order.payment_method || 'unknown')}</p>
                  </td>
                  <td className="whitespace-nowrap p-4 text-[10px] text-neutral-400">{formatDate(order.created_at)}</td>
                  <td className="p-4 text-right font-black text-white">{money(order.total_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-6"><Empty>{busy ? 'Loading...' : 'No delivery orders match these filters.'}</Empty></div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-[10px] text-neutral-500">
          Showing {totalCount ? (page - 1) * 25 + 1 : 0}–{Math.min(page * 25, totalCount)} of {totalCount} matching orders
        </p>
        <div className="flex gap-2">
          <button type="button" disabled={busy || page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}
            className="rounded-xl border border-neutral-700 px-4 py-2 text-xs font-black disabled:opacity-30">Previous</button>
          <button type="button" disabled={busy || page >= totalPages} onClick={() => setPage((value) => value + 1)}
            className="rounded-xl border border-neutral-700 px-4 py-2 text-xs font-black disabled:opacity-30">Next</button>
        </div>
      </div>

      <div className="mt-5 rounded-3xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
        <h2 className="text-sm font-black text-white">Store Summary — Current Page</h2>
        <p className="mt-2 text-[10px] leading-5 text-neutral-500">
          Exact matching-order count above covers all pages. The values below cover only the {rows.length} orders on this page.
          Order value is not settled revenue and may include unpaid or cancelled orders.
        </p>
        {breakdown.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {breakdown.map((store) => (
              <div key={store.id} className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <p className="truncate text-xs font-black text-white">{store.name}</p>
                <p className="mt-2 text-[10px] text-neutral-400">Orders: {store.count}</p>
                <p className="mt-1 text-[10px] font-black text-neutral-200">Order value: {money(store.value)}</p>
              </div>
            ))}
          </div>
        ) : <div className="mt-3"><Empty>No orders to summarize.</Empty></div>}
      </div>
    </div>
  )
}

// Super Admin only. Uses the authenticated server API, never a client service key.
function AdminRegistrationApprovals() {
  const [statusFilter, setStatusFilter] = useState('pending')
  const [registrations, setRegistrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')
  const [notes, setNotes] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async (filter) => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(
        `/api/admin/registrations?status=${encodeURIComponent(filter)}`,
        { cache: 'no-store' }
      )
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result.success !== true) {
        throw new Error(result.message || 'Unable to load registrations.')
      }
      setRegistrations(Array.isArray(result.registrations) ? result.registrations : [])
    } catch (err) {
      setError(err?.message || 'Unable to load registrations.')
      setRegistrations([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(statusFilter)
  }, [load, statusFilter])

  const decide = async (row, action) => {
    if (savingId || row.approval_status !== 'pending') return
    const approving = action === 'approve'
    const name = row.name || row.restaurant_code || 'this business'
    const note = String(notes[row.id] || '').trim()

    if (!approving && !note) {
      setError('Enter a reason before rejecting a registration.')
      return
    }
    if (!window.confirm(
      `${approving ? 'Approve' : 'Reject'} ${name}?\n\n${approving ? 'This changes its approval status. Owner access will be enforced separately.' : 'The applicant will remain ineligible for portal access.'}`
    )) return

    setSavingId(row.id)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/admin/registrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: row.id,
          action,
          note,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result.success !== true) {
        throw new Error(result.message || 'Unable to update registration.')
      }
      setNotice(result.message || 'Registration updated.')
      await load(statusFilter)
    } catch (err) {
      setError(err?.message || 'Unable to update registration.')
    } finally {
      setSavingId('')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
            Super Admin / Business Accounts
          </p>
          <h1 className="mt-1 text-2xl font-black text-white">Registration Approvals</h1>
          <p className="mt-2 text-xs leading-5 text-neutral-400">
            Review new owner registrations before enabling their business accounts.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(statusFilter)}
          disabled={loading || Boolean(savingId)}
          className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-xs font-bold text-white hover:border-neutral-500 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh Registrations'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Registration status filter">
        {[
          ['pending', 'Pending'],
          ['approved', 'Approved'],
          ['rejected', 'Rejected'],
          ['all', 'All'],
        ].map(([value, label]) => (
          <button
            type="button"
            key={value}
            onClick={() => { setNotice(''); setError(''); setStatusFilter(value) }}
            className={`rounded-xl px-4 py-2.5 text-xs font-bold transition ${
              statusFilter === value
                ? 'bg-red-600 text-white'
                : 'border border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-white'
            }`}
            aria-pressed={statusFilter === value}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs font-bold text-red-300">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs font-bold text-emerald-300">
          {notice}
        </div>
      )}

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 text-xs text-neutral-300">
        Showing {registrations.length} {statusFilter === 'all' ? '' : statusFilter} registration(s)
        {registrations.length === 200 && <span className="ml-2 text-amber-300">(First 200 only)</span>}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-sm text-neutral-400">
          Loading registrations...
        </div>
      ) : registrations.length === 0 ? (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-8 text-center">
          <p className="text-lg font-bold text-white">No registrations found</p>
          <p className="mt-2 text-xs text-neutral-500">
            {statusFilter === 'pending'
              ? 'New businesses will appear here after an owner completes registration.'
              : 'Try another registration status filter.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {registrations.map((row) => (
            <article key={row.id} className="min-w-0 rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-words text-base font-black text-white">
                    {row.name || 'Unnamed business'}
                  </h2>
                  <p className="mt-1 text-xs text-neutral-400">
                    {row.business_type || 'Business'} · {row.restaurant_code || 'No store code'}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase ${
                  row.approval_status === 'approved'
                    ? 'bg-emerald-500/10 text-emerald-300'
                    : row.approval_status === 'rejected'
                      ? 'bg-red-500/10 text-red-300'
                      : 'bg-amber-500/10 text-amber-300'
                }`}>
                  {row.approval_status || 'pending'}
                </span>
              </div>

              <div className="mt-4 space-y-2 text-xs text-neutral-400">
                <p>Email: <span className="break-all text-neutral-200">{row.email || 'Not provided'}</span></p>
                <p>Phone: <span className="text-neutral-200">{row.phone || 'Not provided'}</span></p>
                <p>Registered: <span className="text-neutral-200">{row.created_at ? new Date(row.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Unknown'}</span></p>
                {row.approved_by && <p>Approved by: <span className="text-neutral-200">{row.approved_by}</span></p>}
                {row.approval_note && <p>Admin note: <span className="text-neutral-200">{row.approval_note}</span></p>}
              </div>

              {row.approval_status === 'pending' && (
                <div className="mt-5 space-y-3 border-t border-neutral-800 pt-4">
                  <label className="block text-[11px] font-bold text-neutral-300" htmlFor={`approval-note-${row.id}`}>
                    Admin note (required for rejection)
                  </label>
                  <textarea
                    id={`approval-note-${row.id}`}
                    value={notes[row.id] || ''}
                    onChange={(event) => setNotes((prev) => ({
                      ...prev,
                      [row.id]: event.target.value.slice(0, 1000),
                    }))}
                    rows={2}
                    placeholder="Optional approval note or reason for rejection"
                    className="w-full rounded-xl border border-neutral-700 bg-neutral-950 p-3 text-xs text-white outline-none focus:border-red-500"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => decide(row, 'approve')}
                      disabled={Boolean(savingId) || loading}
                      className="rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {savingId === row.id ? 'Processing...' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(row, 'reject')}
                      disabled={Boolean(savingId) || loading}
                      className="rounded-xl bg-red-600 px-4 py-3 text-xs font-black text-white hover:bg-red-500 disabled:opacity-50"
                    >
                      {savingId === row.id ? 'Processing...' : 'Reject'}
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AdminControlCenter() {
  const router =
    useRouter()

  const [
    section,
    setSection,
  ] =
    useState('overview')

  const [navigationOpen, setNavigationOpen] = useState(false)
  const [navigationCompact, setNavigationCompact] = useState(false)
  const [navigationQuery, setNavigationQuery] = useState('')
  const [commandOpen, setCommandOpen] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')

  // Only the interface changes here; selecting a section never mutates tenant data.
  const switchSection = (key) => {
    if (!NAV.some(([navKey]) => navKey === key)) return
    setSection(key)
    setNavigationOpen(false)
    setCommandOpen(false)
    setCommandQuery('')
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useEffect(() => {
    const keyHandler = (event) => {
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen((current) => !current)
        return
      }
      if (event.key === 'Escape') {
        setCommandOpen(false)
        setNavigationOpen(false)
      }
    }
    document.addEventListener('keydown', keyHandler)
    return () => document.removeEventListener('keydown', keyHandler)
  }, [])

  const filteredNavGroups = NAV_GROUPS.map((group) => ({
    ...group,
    links: group.items
      .map((key) => {
        const match = NAV.find(([navKey]) => navKey === key)
        return match ? { key, text: match[1] } : null
      })
      .filter(Boolean)
      .filter(({ key, text }) =>
        `${text} ${NAV_DESCRIPTIONS[key] || ''}`.toLowerCase().includes(navigationQuery.trim().toLowerCase())
      ),
  })).filter((group) => group.links.length > 0)

  const commandMatches = NAV.filter(([key, text]) =>
    `${text} ${NAV_DESCRIPTIONS[key] || ''}`.toLowerCase().includes(commandQuery.trim().toLowerCase())
  )

  const activeLabel = NAV.find(([key]) => key === section)?.[1] || 'Overview'

  const [
    data,
    setData,
  ] =
    useState(null)

  const syncMaintenanceStatus = useCallback(({ enabled }) => {
    setData((current) => current ? {
      ...current,
      platform: {
        ...current.platform,
        websiteStatus: enabled ? 'Not Working' : 'Working',
      },
    } : current)
  }, [])

  const [
    loading,
    setLoading,
  ] =
    useState(true)

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false)

  const [
    timedOut,
    setTimedOut,
  ] =
    useState(false)

  const [
    error,
    setError,
  ] =
    useState('')

  const [
    search,
    setSearch,
  ] =
    useState('')

  const [
    tenantEditor,
    setTenantEditor,
  ] =
    useState(null)

  const [
    actionLoading,
    setActionLoading,
  ] =
    useState(false)

  const [otpEnabled, setOtpEnabled] = useState(true)
  const [otpSettingsLoading, setOtpSettingsLoading] = useState(false)
  const [otpSettingsSaving, setOtpSettingsSaving] = useState(false)
  const [otpSettingsError, setOtpSettingsError] = useState('')
  const [otpSettingsNotice, setOtpSettingsNotice] = useState('')

  const loadOtpSettings = useCallback(async () => {
    setOtpSettingsLoading(true)
    setOtpSettingsError('')
    try {
      const response = await fetch('/api/admin/customer-auth-settings', {
        cache: 'no-store',
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result.success !== true || typeof result.otpEnabled !== 'boolean') {
        throw new Error(result.message || 'Unable to load customer OTP settings.')
      }
      setOtpEnabled(result.otpEnabled)
    } catch (err) {
      setOtpSettingsError(err.message || 'Unable to load customer OTP settings.')
    } finally {
      setOtpSettingsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (section === 'system') loadOtpSettings()
  }, [section, loadOtpSettings])

  const saveOtpSettings = async () => {
    if (otpSettingsSaving || otpSettingsLoading) return
    setOtpSettingsSaving(true)
    setOtpSettingsError('')
    setOtpSettingsNotice('')
    try {
      const response = await fetch('/api/admin/customer-auth-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otpEnabled }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result.success !== true || typeof result.otpEnabled !== 'boolean') {
        throw new Error(result.message || 'Unable to save customer OTP settings.')
      }
      setOtpEnabled(result.otpEnabled)
      setOtpSettingsNotice('Customer login OTP setting saved successfully.')
    } catch (err) {
      setOtpSettingsError(err.message || 'Unable to save customer OTP settings.')
    } finally {
      setOtpSettingsSaving(false)
    }
  }

  const [
    liveSupportSessions,
    setLiveSupportSessions,
  ] =
    useState([])

  const [
    selectedLiveSupport,
    setSelectedLiveSupport,
  ] =
    useState(null)

  const [
    liveSupportMessages,
    setLiveSupportMessages,
  ] =
    useState([])

  const [
    liveSupportLoading,
    setLiveSupportLoading,
  ] =
    useState(false)

  const [
    liveSupportActionLoading,
    setLiveSupportActionLoading,
  ] =
    useState(false)

  const [
    liveSupportError,
    setLiveSupportError,
  ] =
    useState('')

  const [
    liveSupportReply,
    setLiveSupportReply,
  ] =
    useState('')

  const [
    liveSupportCounts,
    setLiveSupportCounts,
  ] =
    useState({
      pending: 0,
      connected: 0,
      total: 0,
    })

  const loadData =
    useCallback(
      async (
        quiet = false
      ) => {
        if (quiet) {
          setRefreshing(true)
        } else {
          setLoading(true)
        }

        setTimedOut(false)
        setError('')

        const controller =
          new AbortController()

        const timeoutId =
          window.setTimeout(
            () => {
              setTimedOut(true)
              controller.abort()
            },
            15000
          )

        try {
          const response =
            await fetch(
              '/api/admin/control-center',
              {
                cache:
                  'no-store',
                signal:
                  controller.signal,
              }
            )

          const payload =
            await response
              .json()
              .catch(
                () => ({})
              )

          if (
            response.status ===
            401
          ) {
            router.replace(
              '/admin'
            )
            return
          }

          if (
            !response.ok ||
            !payload?.success
          ) {
            throw new Error(
              payload?.message ||
                'Unable to load Admin Control Center.'
            )
          }

          setData(
            payload
          )
        } catch (loadError) {
          const aborted =
            loadError?.name ===
            'AbortError'

          setError(
            aborted
              ? 'Admin data request took longer than 15 seconds. The page stopped waiting instead of staying on an infinite loader. Check the terminal for /api/admin/control-center and press Retry.'
              : loadError?.message ||
                  'Unable to load Admin Control Center.'
          )
        } finally {
          window.clearTimeout(
            timeoutId
          )

          setLoading(false)
          setRefreshing(false)
        }
      },
      [router]
    )

  useEffect(() => {
    loadData()
  }, [loadData])

  const action =
    async (
      payload,
      refreshAfter = true,
      allowSequentialSave = false
    ) => {
      if (actionLoading && !allowSequentialSave) {
        return null
      }

      setActionLoading(
        true
      )
      setError('')

      try {
        const response =
          await fetch(
            '/api/admin/control-center',
            {
              method:
                'POST',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body:
                JSON.stringify(
                  payload
                ),
            }
          )

        const result =
          await response
            .json()
            .catch(
              () => ({})
            )

        if (
          response.status ===
          401
        ) {
          router.replace(
            '/admin'
          )
          return null
        }

        if (
          !response.ok ||
          !result?.success
        ) {
          throw new Error(
            result?.message ||
              'Admin action failed.'
          )
        }

        if (refreshAfter) {
          await loadData(
            true
          )
        }

        return result
      } catch (actionError) {
        setError(
          actionError?.message ||
            'Admin action failed.'
        )

        return null
      } finally {
        setActionLoading(
          false
        )
      }
    }

  const logout =
    async () => {
      try {
        await fetch(
          '/api/admin/logout',
          {
            method:
              'POST',
          }
        )
      } finally {
        router.replace(
          '/admin'
        )
      }
    }

  const loadLiveSupport =
    useCallback(
      async (
        sessionId = '',
        quiet = false
      ) => {
        if (!quiet) {
          setLiveSupportLoading(
            true
          )
        }

        try {
          const query =
            sessionId
              ? `?sessionId=${encodeURIComponent(
                  sessionId
                )}`
              : ''

          const response =
            await fetch(
              `/api/admin/live-support${query}`,
              {
                cache:
                  'no-store',
              }
            )

          const payload =
            await response
              .json()
              .catch(
                () => ({})
              )

          if (
            response.status ===
            401
          ) {
            window.location.replace(
              '/admin'
            )
            return
          }

          if (
            !response.ok ||
            !payload?.success
          ) {
            throw new Error(
              payload?.message ||
                'Unable to load Live Support.'
            )
          }

          const sessions =
            Array.isArray(
              payload?.sessions
            )
              ? payload.sessions
              : []

          setLiveSupportSessions(
            sessions
          )

          setLiveSupportCounts(
            payload?.counts || {
              pending: 0,
              connected: 0,
              total:
                sessions.length,
            }
          )

          if (sessionId) {
            setSelectedLiveSupport(
              payload
                ?.selectedSession ||
                sessions.find(
                  (row) =>
                    String(
                      row.id
                    ) ===
                    String(
                      sessionId
                    )
                ) ||
                null
            )

            setLiveSupportMessages(
              Array.isArray(
                payload?.messages
              )
                ? payload.messages
                : []
            )
          } else {
            setSelectedLiveSupport(
              (current) => {
                if (!current) {
                  return null
                }

                return (
                  sessions.find(
                    (row) =>
                      String(
                        row.id
                      ) ===
                      String(
                        current.id
                      )
                  ) ||
                  current
                )
              }
            )
          }

          setLiveSupportError(
            ''
          )
        } catch (supportError) {
          setLiveSupportError(
            supportError?.message ||
              'Unable to load Live Support.'
          )
        } finally {
          if (!quiet) {
            setLiveSupportLoading(
              false
            )
          }
        }
      },
      []
    )

  const runLiveSupportAction =
    async ({
      action:
        supportAction,
      sessionId,
      message = '',
    }) => {
      if (
        liveSupportActionLoading
      ) {
        return false
      }

      setLiveSupportActionLoading(
        true
      )
      setLiveSupportError(
        ''
      )

      try {
        const response =
          await fetch(
            '/api/admin/live-support',
            {
              method:
                'POST',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body:
                JSON.stringify({
                  action:
                    supportAction,
                  sessionId,
                  restaurantId:
                    selectedLiveSupport?.restaurant_id ||
                    '',
                  message,
                }),
            }
          )

        const payload =
          await response
            .json()
            .catch(
              () => ({})
            )

        if (
          response.status ===
          401
        ) {
          window.location.replace(
            '/admin'
          )
          return false
        }

        if (
          !response.ok ||
          !payload?.success
        ) {
          throw new Error(
            payload?.message ||
              'Live Support action failed.'
          )
        }

        await loadLiveSupport(
          sessionId,
          true
        )

        return true
      } catch (supportError) {
        setLiveSupportError(
          supportError?.message ||
            'Live Support action failed.'
        )

        return false
      } finally {
        setLiveSupportActionLoading(
          false
        )
      }
    }

  const openLiveSupport =
    async (session) => {
      if (!session?.id) {
        return
      }

      setSelectedLiveSupport(
        session
      )

      setLiveSupportMessages(
        []
      )

      await loadLiveSupport(
        session.id
      )
    }

  const acceptLiveSupport =
    async () => {
      if (
        !selectedLiveSupport?.id
      ) {
        return
      }

      await runLiveSupportAction({
        action:
          'accept',
        sessionId:
          selectedLiveSupport.id,
      })
    }

  const closeLiveSupport =
    async () => {
      if (
        !selectedLiveSupport?.id
      ) {
        return
      }

      const confirmed =
        window.confirm(
          `Close Live Support for ${
            selectedLiveSupport.restaurant_name ||
            'this restaurant'
          }?`
        )

      if (!confirmed) {
        return
      }

      await runLiveSupportAction({
        action:
          'close',
        sessionId:
          selectedLiveSupport.id,
      })
    }

  const sendLiveSupportReply =
    async (event) => {
      event.preventDefault()

      const message =
        liveSupportReply
          .trim()

      if (
        !message ||
        !selectedLiveSupport?.id
      ) {
        return
      }

      const sent =
        await runLiveSupportAction({
          action:
            'send',
          sessionId:
            selectedLiveSupport.id,
          message,
        })

      if (sent) {
        setLiveSupportReply(
          ''
        )
      }
    }

  useEffect(() => {
    if (
      section !==
      'live-support'
    ) {
      return undefined
    }

    let active = true

    const refresh =
      async () => {
        if (!active) {
          return
        }

        await loadLiveSupport(
          selectedLiveSupport?.id ||
            '',
          true
        )
      }

    loadLiveSupport(
      selectedLiveSupport?.id ||
        '',
      false
    )

    const timer =
      window.setInterval(
        refresh,
        2500
      )

    return () => {
      active = false
      window.clearInterval(
        timer
      )
    }
  }, [
    section,
    selectedLiveSupport?.id,
    loadLiveSupport,
  ])

  const tenants =
    useMemo(
      () => {
        const rows =
          Array.isArray(
            data?.tenants
          )
            ? data.tenants
            : []

        const term =
          search
            .trim()
            .toLowerCase()

        if (!term) {
          return rows
        }

        return rows.filter(
          (row) =>
            [
              row.name,
              row.email,
              row.phone,
              row.restaurant_code,
              row.plan_code,
              row.subscription_status,
            ]
              .join(' ')
              .toLowerCase()
              .includes(
                term
              )
        )
      },
      [
        data?.tenants,
        search,
      ]
    )

  const summary =
    data?.summary || {}

  const customPlanRequests =
    Array.isArray(
      data?.customPlanRequests
    )
      ? data.customPlanRequests
      : []

  const openTenantEditor =
    (
      tenant
    ) => {
      setTenantEditor({
        ...tenant,
        planCode:
          tenant.plan_code ||
          'restaurant_pro',
        subscriptionStatus:
          tenant.subscription_status ||
          'active',
        billingCycle:
          tenant.billing_cycle ||
          '1month',
        subscriptionExpiresAt:
          shortDate(
            tenant.subscription_expires_at
          ),
        features: {
          ...DEFAULT_TENANT_FEATURES,
          ...(tenant.features || {}),
        },
      })
    }

  const saveTenant =
    async () => {
      if (!tenantEditor) {
        return
      }

      const accessResult =
        await action(
          {
            action:
              'update_tenant_access',
            restaurantId:
              tenantEditor.id,
            planCode:
              tenantEditor.planCode,
            subscriptionStatus:
              tenantEditor.subscriptionStatus,
            billingCycle:
              tenantEditor.billingCycle,
            subscriptionExpiresAt:
              tenantEditor.subscriptionExpiresAt
                ? `${tenantEditor.subscriptionExpiresAt}T23:59:59+05:30`
                : null,
          },
          false
        )

      if (!accessResult) {
        return
      }

      const featureResult =
        await action(
          {
            action:
              'update_tenant_features',
            restaurantId:
              tenantEditor.id,
            features: {
              ...DEFAULT_TENANT_FEATURES,
              ...(tenantEditor.features || {}),
            },
          },
          false,
          true // Run the second step even if React has not re-rendered loading state.
        )

      if (!featureResult) {
        await loadData(true)
        return
      }

      await loadData(true)

      setTenantEditor(
        null
      )
    }

  const recentOrders =
    Array.isArray(
      data?.orders
    )
      ? data.orders
      : []

  const supportThreads =
    Array.isArray(
      data?.supportThreads
    )
      ? data.supportThreads
      : []

  const reviews =
    Array.isArray(
      data?.reviews
    )
      ? data.reviews
      : []

  if (loading) {
    return (
      <main className="min-h-[100dvh] bg-neutral-950 p-6 text-white">
        <div className="mx-auto flex min-h-[70dvh] max-w-lg items-center justify-center">
          <div className="w-full rounded-3xl border border-neutral-800 bg-neutral-900 p-6 text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-neutral-800 border-t-red-500" />

            <p className="mt-4 text-sm font-black text-white">
              Loading Admin Control Center...
            </p>

            <p className="mt-2 text-[10px] leading-5 text-neutral-500">
              Maximum wait: 15 seconds.
            </p>
          </div>
        </div>
      </main>
    )
  }

  if (
    !data &&
    error
  ) {
    return (
      <main className="min-h-[100dvh] bg-neutral-950 p-6 text-white">
        <div className="mx-auto flex min-h-[70dvh] max-w-xl items-center justify-center">
          <section className="w-full rounded-3xl border border-red-500/25 bg-neutral-900 p-6">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-red-400">
              Admin ERP Load Error
            </p>

            <h1 className="mt-2 text-xl font-black text-white">
              Control Center could not load
            </h1>

            <p className="mt-3 text-xs leading-6 text-neutral-400">
              {error}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  loadData()
                }
                className="rounded-xl bg-red-600 px-4 py-3 text-xs font-black text-white"
              >
                Retry
              </button>

              <button
                type="button"
                onClick={
                  logout
                }
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-xs font-black text-neutral-300"
              >
                Back to Login
              </button>
            </div>

            <p className="mt-4 font-mono text-[9px] text-neutral-600">
              API: /api/admin/control-center
            </p>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="dd-admin-ui min-h-[100dvh] bg-[#090b10] text-neutral-100">
      <style>{`
        .dd-admin-ui { background: radial-gradient(ellipse 900px 500px at 80% -250px, rgba(239,68,68,.075), transparent), #090b10; }
        .dd-admin-ui .bg-neutral-900 { background-color: #12161f; }
        .dd-admin-ui .bg-neutral-950 { background-color: #0a0d13; }
        .dd-admin-ui .border-neutral-800 { border-color: #252a35; }
        .dd-admin-ui .border-neutral-700 { border-color: #353a46; }
        .dd-admin-ui .dd-metric { background: linear-gradient(140deg,#171c26 0%,#10141b 100%); transition: border-color .18s ease,transform .18s ease,box-shadow .18s ease; }
        .dd-admin-ui .dd-metric:hover { border-color: rgba(248,113,113,.35); transform: translateY(-2px); box-shadow: 0 12px 28px rgba(0,0,0,.15); }
        .dd-admin-ui .dd-metric-icon { background: rgba(239,68,68,.08); }
        .dd-admin-ui .dd-sidebar-scroll::-webkit-scrollbar { width: 5px; }
        .dd-admin-ui .dd-sidebar-scroll::-webkit-scrollbar-thumb { background: #363d48; border-radius: 10px; }
        .dd-admin-ui input:focus-visible, .dd-admin-ui select:focus-visible, .dd-admin-ui textarea:focus-visible,
        .dd-admin-ui button:focus-visible { outline: 2px solid rgba(251,146,60,.85); outline-offset: 2px; }
        .dd-admin-ui .dd-nav-button { transition: background .16s ease, color .16s ease, transform .16s ease; }
        .dd-admin-ui .dd-nav-button:hover { transform: translateX(2px); }
        .dd-admin-ui .dd-hero { background: radial-gradient(circle at 88% 0%,rgba(251,146,60,.14),transparent 36%),linear-gradient(115deg,#22202b 0%,#191d29 47%,#111924 100%); }
        :root[data-theme='light'] .dd-admin-ui { background: var(--bg); }
        :root[data-theme='light'] .dd-admin-ui > header,
        :root[data-theme='light'] .dd-admin-ui aside { background: var(--card); }
        :root[data-theme='light'] .dd-admin-ui header button { background: var(--surface); }
        :root[data-theme='light'] .dd-admin-ui .dd-hero,
        :root[data-theme='light'] .dd-admin-ui .dd-metric { background: linear-gradient(135deg, #fff, #f3f6fb); }
        :root[data-theme='light'] .dd-admin-ui .dd-nav-button[aria-current='page'] { color: #b91c1c; }
        @media (prefers-reduced-motion: reduce) { .dd-admin-ui .dd-metric, .dd-admin-ui .dd-nav-button { transition: none; } .dd-admin-ui .dd-metric:hover,.dd-admin-ui .dd-nav-button:hover { transform: none; } }
      `}</style>

      <header className="sticky top-0 z-40 border-b border-neutral-800 bg-[#10131a]/95 shadow-[0_8px_30px_rgba(0,0,0,.15)] backdrop-blur-xl">
        <div className="flex h-[76px] w-full items-center gap-3 px-4 lg:px-6">
          <button type="button" aria-label="Open navigation" onClick={() => setNavigationOpen(true)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-800 text-neutral-300 lg:hidden">
            <AdminUIIcon name="menu" size={20}/>
          </button>

          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 via-red-600 to-orange-600 shadow-[0_7px_22px_rgba(220,38,38,.2)]">
            <span className="text-xl font-black tracking-tighter text-white">D<span className="text-orange-200">.</span></span>
          </div>
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-[13px] font-black tracking-tight text-white">DIGITAL DINE</p>
            <p className="text-[9px] font-bold uppercase tracking-[0.19em] text-neutral-500">Admin Workspace</p>
          </div>

          <div className="mx-2 hidden h-7 w-px bg-neutral-800 md:block" />
          <div className="hidden min-w-0 items-center gap-2 text-xs md:flex">
            <span className="text-neutral-500">Workspace</span>
            <AdminUIIcon name="chevron" size={13} className="text-neutral-600" />
            <span className="truncate font-bold text-neutral-200">{activeLabel}</span>
          </div>

          <div className="flex-1" />
          <button type="button" onClick={() => { setCommandQuery(''); setCommandOpen(true) }}
            aria-label="Quick navigation and search" title="Search pages (Ctrl + K)"
            className="flex h-10 items-center gap-2 rounded-xl border border-neutral-800 bg-[#191e28] px-3 text-neutral-400 transition hover:border-neutral-600 hover:text-white sm:min-w-[174px]">
            <AdminUIIcon name="search" size={16}/>
            <span className="hidden text-[11px] font-semibold sm:inline">Search workspace</span>
            <kbd className="ml-auto hidden rounded border border-neutral-700 px-1.5 py-0.5 text-[9px] text-neutral-500 lg:inline">⌘ K</kbd>
          </button>
          <button type="button" onClick={() => loadData(true)} disabled={refreshing} title="Refresh dashboard"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-800 bg-[#191e28] text-neutral-300 transition hover:text-white disabled:opacity-50">
            <AdminUIIcon name="refresh" size={18} className={refreshing ? 'animate-spin' : ''}/>
          </button>
          <div className="hidden items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2.5 lg:flex" title="Authenticated admin session">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-[10px] font-bold text-emerald-300">ADMIN</span>
          </div>
          <button type="button" onClick={logout} title="Sign out of Admin ERP"
            className="flex h-10 items-center gap-2 rounded-xl border border-neutral-800 px-3 text-neutral-300 transition hover:border-red-500/40 hover:text-red-300">
            <AdminUIIcon name="logout" size={17}/>
            <span className="hidden text-[11px] font-bold xl:inline">Sign out</span>
          </button>
        </div>
      </header>

      {navigationOpen && (
        <button type="button" aria-label="Close navigation" onClick={() => setNavigationOpen(false)}
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden" />
      )}

      <div className={`grid w-full min-w-0 ${navigationCompact ? 'lg:grid-cols-[84px_minmax(0,1fr)]' : 'lg:grid-cols-[256px_minmax(0,1fr)]'}`}>
        <aside className={`fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-neutral-800 bg-[#11151e] shadow-2xl transition-transform duration-200 lg:sticky lg:top-[76px] lg:z-20 lg:h-[calc(100dvh-76px)] lg:translate-x-0 lg:shadow-none ${navigationCompact ? 'lg:w-[84px]' : 'lg:w-[256px]'} ${navigationOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className={`flex shrink-0 items-center gap-2 border-b border-neutral-800 p-4 ${navigationCompact ? 'lg:justify-center lg:px-2' : ''}`}>
            <div className={`min-w-0 flex-1 ${navigationCompact ? 'lg:hidden' : ''}`}>
              <p className="text-[10px] font-black uppercase tracking-[0.19em] text-neutral-500">Main menu</p>
              <p className="mt-1 text-sm font-bold text-white">Control Center</p>
            </div>
            <button type="button" onClick={() => setNavigationCompact((v) => !v)}
              title={navigationCompact ? 'Expand sidebar' : 'Collapse sidebar'} aria-label={navigationCompact ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden h-9 w-9 items-center justify-center rounded-lg border border-neutral-800 text-neutral-400 hover:text-white lg:flex">
              <AdminUIIcon name="menu" size={18}/>
            </button>
            <button type="button" onClick={() => setNavigationOpen(false)} aria-label="Close sidebar"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-800 text-neutral-300 lg:hidden">
              <AdminUIIcon name="close" size={18}/>
            </button>
          </div>

          <div className={`p-3 ${navigationCompact ? 'lg:hidden' : ''}`}>
            <label className="relative block">
              <AdminUIIcon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"/>
              <input type="search" value={navigationQuery} onChange={(event) => setNavigationQuery(event.target.value)}
                placeholder="Filter sections" aria-label="Filter menu sections"
                className="w-full rounded-xl border border-neutral-800 bg-[#0a0d13] py-2.5 pl-9 pr-3 text-[11px] text-white placeholder:text-neutral-600 focus:border-red-500 focus:outline-none"/>
            </label>
          </div>

          <nav aria-label="Admin sections" className="dd-sidebar-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-3 pb-5">
            {filteredNavGroups.map((group) => (
              <div key={group.title}>
                <p className={`mb-2 px-3 text-[9px] font-black uppercase tracking-[0.17em] text-neutral-600 ${navigationCompact ? 'lg:hidden' : ''}`}>
                  {group.title}
                </p>
                <div className="space-y-1">
                  {group.links.map(({ key, text }) => (
                    <button key={key} type="button" onClick={() => switchSection(key)} title={`${text} — ${NAV_DESCRIPTIONS[key] || ''}`}
                      aria-current={section === key ? 'page' : undefined}
                      className={`dd-nav-button group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${navigationCompact ? 'lg:justify-center lg:px-0' : ''} ${section === key
                        ? 'bg-gradient-to-r from-red-600/25 to-orange-500/[0.06] font-black text-red-100 ring-1 ring-inset ring-red-500/25'
                        : 'font-semibold text-neutral-400 hover:bg-white/[0.045] hover:text-neutral-100'}`}>
                      <span className={`shrink-0 ${section === key ? 'text-red-400' : 'text-neutral-500 group-hover:text-neutral-200'}`}>
                        <AdminUIIcon name={NAV_ICONS[key]} size={18}/>
                      </span>
                      <span className={`min-w-0 flex-1 truncate text-[11px] ${navigationCompact ? 'lg:hidden' : ''}`}>{text}</span>
                      {key === 'custom-plans' && Number(data?.summary?.newCustomPlanRequests || 0) > 0 && (
                        <span className={`rounded-full bg-red-500/15 px-2 py-0.5 text-[9px] font-black text-red-300 ${navigationCompact ? 'lg:hidden' : ''}`}>
                          {data.summary.newCustomPlanRequests}
                        </span>
                      )}
                      {section === key && <span className={`h-1.5 w-1.5 shrink-0 rounded-full bg-red-400 ${navigationCompact ? 'lg:hidden' : ''}`} />}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {filteredNavGroups.length === 0 && (
              <p className="px-3 py-5 text-center text-xs text-neutral-500">No sections match this search.</p>
            )}
          </nav>

          <div className={`shrink-0 border-t border-neutral-800 p-3 ${navigationCompact ? 'lg:px-2' : ''}`}>
            <div className={`flex items-center gap-3 rounded-xl border border-neutral-800 bg-[#191e29] p-3 ${navigationCompact ? 'lg:justify-center lg:p-2' : ''}`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-500/30 to-orange-400/20 text-xs font-black text-red-200">A</span>
              <div className={`min-w-0 ${navigationCompact ? 'lg:hidden' : ''}`}>
                <p className="truncate text-[11px] font-bold text-white">Super Admin</p>
                <p className="truncate text-[10px] text-neutral-500" title={data?.admin?.email || ''}>{data?.admin?.email || 'Administrator'}</p>
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0 px-4 pb-12 pt-5 sm:px-6 lg:px-8 lg:pt-7">
          {section !== 'overview' && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/[0.07] text-red-300">
                  <AdminUIIcon name={NAV_ICONS[section]} size={22}/>
                </span>
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-[.16em] text-neutral-500">Digital Dine ERP / {activeLabel}</p>
                  <p className="mt-1 text-[11px] text-neutral-400">{NAV_DESCRIPTIONS[section]}</p>
                </div>
              </div>
              <button type="button" onClick={() => switchSection('overview')}
                className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 px-3 py-2.5 text-[11px] font-semibold text-neutral-300 hover:bg-white/5">
                <AdminUIIcon name="dashboard" size={15}/> Overview
              </button>
            </div>
          )}
          {error && (
            <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-300">
              {error}
            </div>
          )}

          {Array.isArray(
            data?.warnings
          ) &&
            data.warnings
              .length > 0 && (
              <details className="mb-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                <summary className="cursor-pointer text-xs font-black text-amber-300">
                  System warnings ({data.warnings.length})
                </summary>

                <div className="mt-3 space-y-1">
                  {data.warnings.map(
                    (
                      warning,
                      index
                    ) => (
                      <p
                        key={`${warning}-${index}`}
                        className="text-[10px] text-amber-200/70"
                      >
                        {warning}
                      </p>
                    )
                  )}
                </div>
              </details>
            )}

          {section ===
            'overview' && (
            <div>
              <div className="dd-hero relative overflow-hidden rounded-[28px] border border-white/[0.07] px-5 py-6 sm:px-7 sm:py-8 lg:px-9">
                <div className="relative z-10 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                  <div className="max-w-2xl">
                    <div className="inline-flex items-center gap-2 rounded-full border border-orange-400/15 bg-orange-400/[0.06] px-3 py-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-orange-400"/>
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-orange-200">Digital Dine · Platform Command</span>
                    </div>
                    <h1 className="mt-4 text-[clamp(1.6rem,3vw,2.5rem)] font-black leading-tight tracking-tight text-white">
                      Welcome to your control center<span className="text-orange-400">.</span>
                    </h1>
                    <p className="mt-3 max-w-xl text-xs leading-6 text-neutral-400 sm:text-sm">
                      Monitor restaurant operations, approve partners, manage prepaid wallets and control every store from one secure workspace.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap md:max-w-[315px]">
                    <button type="button" onClick={() => switchSection('registrations')}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-[11px] font-black text-white transition hover:bg-red-500">
                      <AdminUIIcon name="user-check" size={16}/> Approvals
                    </button>
                    <button type="button" onClick={() => switchSection('wallet-controls')}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-[11px] font-black text-white transition hover:bg-white/10">
                      <AdminUIIcon name="wallet" size={16}/> Wallets
                    </button>
                    <button type="button" onClick={() => switchSection('tenants')}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-[11px] font-black text-white transition hover:bg-white/10">
                      <AdminUIIcon name="building" size={16}/> Restaurants
                    </button>
                    <button type="button" onClick={() => switchSection('delivery-orders')}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-[11px] font-black text-white transition hover:bg-white/10">
                      <AdminUIIcon name="package" size={16}/> DD MART Orders
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-7 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">Platform pulse</p>
                  <h2 className="mt-1 text-xl font-black tracking-tight text-white">At-a-glance metrics</h2>
                  <p className="mt-1 text-[11px] text-neutral-500">Live operational totals from your existing Admin Control Center API.</p>
                </div>
                <button type="button" onClick={() => loadData(true)} disabled={refreshing}
                  className="inline-flex items-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-[11px] font-bold text-neutral-300 disabled:opacity-50">
                  <AdminUIIcon name="refresh" size={15} className={refreshing ? 'animate-spin' : ''}/>
                  {refreshing ? 'Refreshing...' : 'Refresh metrics'}
                </button>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
                <Metric
                  label="Registered Users"
                  value={
                    summary.authUsers ||
                    0
                  }
                  hint="Supabase Auth"
                />

                <Metric
                  label="Tenants"
                  value={
                    summary.tenants ||
                    0
                  }
                />

                <Metric
                  label="Legacy Active Status"
                  value={
                    summary.activeSubscriptions ||
                    0
                  }
                />

                <Metric
                  label="Legacy Expiring ≤7d"
                  value={
                    summary.expiringSoon ||
                    0
                  }
                />

                <Metric
                  label="Orders Today"
                  value={
                    summary.ordersToday ||
                    0
                  }
                />

                <Metric
                  label="Revenue Today"
                  value={money(
                    summary.revenueToday
                  )}
                />

                <Metric
                  label="Restaurant"
                  value={
                    summary.restaurantEnabled ||
                    0
                  }
                />

                <Metric
                  label="Delivery"
                  value={
                    summary.deliveryEnabled ||
                    0
                  }
                />

                <Metric
                  label="Resort"
                  value={
                    summary.resortEnabled ||
                    0
                  }
                />

                <Metric
                  label="Open Help"
                  value={
                    summary.openHelpCentre ||
                    0
                  }
                />

                <Metric
                  label="Low Stock"
                  value={
                    summary.lowStock ||
                    0
                  }
                />

                <Metric
                  label="Avg Rating"
                  value={
                    Number(
                      summary.averageRating ||
                        0
                    ).toFixed(
                      1
                    )
                  }
                  hint={`${summary.reviews || 0} verified reviews`}
                />
                <Metric
                  label="Custom Leads"
                  value={
                    summary.customPlanRequests ||
                    0
                  }
                  hint={`${summary.newCustomPlanRequests || 0} new`}
                />
              </div>

              <div className="mt-6 grid gap-4 xl:grid-cols-2">
                <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">
                        Live Platform Status
                      </p>

                      <h2 className="mt-1 text-lg font-black text-white">
                        Website + Application
                      </h2>
                    </div>

                    <StatusPill
                      value={
                        data?.platform
                          ?.websiteStatus ||
                        'Working'
                      }
                    />
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-neutral-950 p-4">
                      <p className="text-[9px] font-black uppercase text-neutral-600">
                        Installed App Start
                      </p>

                      <p className="mt-2 font-mono text-sm font-black text-emerald-400">
                        /app
                      </p>

                      <p className="mt-2 text-[10px] leading-5 text-neutral-500">
                        The installed PWA opens the app/app login portal, not the public website.
                      </p>
                    </div>

                    <div className="rounded-2xl bg-neutral-950 p-4">
                      <p className="text-[9px] font-black uppercase text-neutral-600">
                        App Scope
                      </p>

                      <p className="mt-2 font-mono text-sm font-black text-emerald-400">
                        /app/
                      </p>

                      <p className="mt-2 text-[10px] leading-5 text-neutral-500">
                        Owner, Manager, Waiter, Kitchen, Packer and Driver application portals stay inside this scope.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                  <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">
                    Latest Modules
                  </p>

                  <h2 className="mt-1 text-lg font-black text-white">
                    Current Website Capability
                  </h2>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] font-bold">
                    {[
                      'Restaurant owner onboarding',
                      'Plan-aware /app portals',
                      'Restaurant QR ordering',
                      'Delivery COD + Razorpay',
                      'Delivery radius + live pin',
                      'Inventory + barcode packing',
                      'COD reconciliation',
                      'Help Centre',
                      'Return pickup workflow',
                      'Verified product reviews',
                      'Resort booking',
                      'App-only PWA install',
                    ].map(
                      (item) => (
                        <div
                          key={item}
                          className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-neutral-300"
                        >
                          ✓ {item}
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {section ===
            'custom-plans' && (
            <div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
                    Sales Pipeline
                  </p>

                  <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">
                    Custom Plan Requests
                  </h1>

                  <p className="mt-2 max-w-3xl text-xs leading-6 text-neutral-500">
                    Review customer-selected Restaurant, Delivery and Resort requirements, record the quotation and manage the follow-up status.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    loadData(
                      true
                    )
                  }
                  disabled={
                    refreshing
                  }
                  className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-[10px] font-black text-neutral-300 disabled:opacity-50"
                >
                  {refreshing
                    ? 'Refreshing...'
                    : 'Refresh Requests'}
                </button>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Metric
                  label="Total Requests"
                  value={
                    summary.customPlanRequests ||
                    customPlanRequests.length
                  }
                />

                <Metric
                  label="New"
                  value={
                    summary.newCustomPlanRequests ||
                    0
                  }
                />

                <Metric
                  label="Quoted"
                  value={
                    customPlanRequests.filter(
                      (row) =>
                        row.status ===
                        'quoted'
                    ).length
                  }
                />

                <Metric
                  label="Accepted"
                  value={
                    customPlanRequests.filter(
                      (row) =>
                        row.status ===
                        'accepted'
                    ).length
                  }
                />
              </div>

              <div className="mt-5 space-y-4">
                {!customPlanRequests.length ? (
                  <Empty>
                    No Custom Plan requests have been submitted yet.
                  </Empty>
                ) : (
                  customPlanRequests.map(
                    (request) => (
                      <CustomPlanRequestCard
                        key={
                          request.id
                        }
                        request={
                          request
                        }
                        action={
                          action
                        }
                        actionLoading={
                          actionLoading
                        }
                      />
                    )
                  )
                )}
              </div>
            </div>
          )}

          {section ===
            'tenants' && (
            <div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
                    Access Control
                  </p>

                  <h1 className="mt-1 text-2xl font-black text-white">
                    Tenants & Subscriptions
                  </h1>
                </div>

                <input
                  value={
                    search
                  }
                  onChange={(
                    event
                  ) =>
                    setSearch(
                      event.target.value
                    )
                  }
                  placeholder="Search tenant, email, code, plan..."
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-xs outline-none focus:border-red-500 sm:max-w-sm"
                />
              </div>

              <div className="mt-5 overflow-x-auto rounded-3xl border border-neutral-800 bg-neutral-900">
                <table className="min-w-[1050px] w-full text-left">
                  <thead className="border-b border-neutral-800 bg-neutral-950 text-[9px] uppercase tracking-wider text-neutral-600">
                    <tr>
                      <th className="p-4">
                        Tenant
                      </th>
                      <th className="p-4">
                        Code
                      </th>
                      <th className="p-4">
                        Plan
                      </th>
                      <th className="p-4">
                        Status
                      </th>
                      <th className="p-4">
                        Modules
                      </th>
                      <th className="p-4">
                        Expires
                      </th>
                      <th className="p-4 text-right">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-neutral-800 text-xs">
                    {tenants.map(
                      (tenant) => (
                        <tr
                          key={
                            tenant.id
                          }
                          className="hover:bg-neutral-800/30"
                        >
                          <td className="p-4">
                            <p className="font-black text-white">
                              {tenant.name ||
                                'Tenant'}
                            </p>

                            <p className="mt-1 text-[9px] text-neutral-500">
                              {tenant.email ||
                                '—'}
                            </p>
                          </td>

                          <td className="p-4 font-mono text-[10px] text-neutral-400">
                            {tenant.restaurant_code ||
                              '—'}
                          </td>

                          <td className="p-4">
                            <p className="font-bold text-neutral-300">
                              {label(
                                tenant.plan_code ||
                                  tenant.plan
                              )}
                            </p>

                            <p className="mt-1 text-[9px] text-neutral-600">
                              {tenant.billing_cycle ||
                                '—'}
                            </p>
                          </td>

                          <td className="p-4">
                            <StatusPill
                              value={
                                tenant.subscription_status
                              }
                            />
                          </td>

                          <td className="p-4">
                            <div className="flex flex-wrap gap-1">
                              {tenant.plan_code !==
                                'delivery' && (
                                <span className="rounded-lg bg-blue-500/10 px-2 py-1 text-[8px] font-black text-blue-400">
                                  RESTAURANT
                                </span>
                              )}

                              {(tenant.delivery_enabled ||
                                [
                                  'delivery',
                                  'restaurant_delivery',
                                  'restaurant_resort_delivery',
                                ].includes(
                                  tenant.plan_code
                                )) && (
                                <span className="rounded-lg bg-emerald-500/10 px-2 py-1 text-[8px] font-black text-emerald-400">
                                  DELIVERY
                                </span>
                              )}

                              {tenant.resort_enabled && (
                                <span className="rounded-lg bg-violet-500/10 px-2 py-1 text-[8px] font-black text-violet-400">
                                  RESORT
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="p-4 text-[10px] text-neutral-400">
                            {formatDate(
                              tenant.subscription_expires_at
                            )}
                          </td>

                          <td className="p-4 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                openTenantEditor(
                                  tenant
                                )
                              }
                              className="rounded-xl bg-red-600 px-3 py-2 text-[9px] font-black text-white"
                            >
                              Manage Access
                            </button>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>

                {!tenants.length && (
                  <div className="p-8 text-center text-xs text-neutral-500">
                    No tenants found.
                  </div>
                )}
              </div>
            </div>
          )}

          {section ===
            'operations' && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
                Operations
              </p>

              <h1 className="mt-1 text-2xl font-black text-white">
                Restaurant · Delivery · Resort
              </h1>

              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Metric
                  label="Restaurant Orders"
                  value={
                    summary.restaurantOrders ||
                    0
                  }
                />

                <Metric
                  label="Delivery Orders"
                  value={
                    summary.deliveryOrders ||
                    0
                  }
                />

                <Metric
                  label="Resort Bookings"
                  value={
                    summary.resortBookings ||
                    0
                  }
                />

                <Metric
                  label="Return Pickups"
                  value={
                    summary.returnPickupsOpen ||
                    0
                  }
                />
              </div>

              <div className="mt-5 rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">
                      Delivery Stores
                    </p>

                    <h2 className="mt-1 text-sm font-black text-white">
                      Open / Close Store
                    </h2>
                  </div>

                  <p className="text-[9px] text-neutral-600">
                    Uses existing Delivery action engine
                  </p>
                </div>

                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {!(data?.deliverySettings || []).length ? (
                    <div className="md:col-span-2 xl:col-span-3">
                      <Empty>
                        No Delivery store settings found.
                      </Empty>
                    </div>
                  ) : (
                    data.deliverySettings.map(
                      (store) => (
                        <div
                          key={
                            store.id ||
                            store.restaurant_id
                          }
                          className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-black text-white">
                                {store.store_name ||
                                  store.restaurant_name ||
                                  'Delivery Store'}
                              </p>

                              <p className="mt-1 text-[9px] text-neutral-600">
                                Delivery ₹{Number(store.delivery_fee || 0)}
                                {' · '}
                                Handling ₹{Number(store.handling_charge || 0)}
                              </p>
                            </div>

                            <StatusPill
                              value={
                                store.is_open
                                  ? 'active'
                                  : 'inactive'
                              }
                            />
                          </div>

                          <button
                            type="button"
                            disabled={
                              actionLoading
                            }
                            onClick={() =>
                              action({
                                action:
                                  'set_delivery_store_open',
                                restaurantId:
                                  store.restaurant_id,
                                isOpen:
                                  !store.is_open,
                              })
                            }
                            className={`mt-3 w-full rounded-xl px-3 py-2.5 text-[9px] font-black text-white ${
                              store.is_open
                                ? 'bg-red-600'
                                : 'bg-emerald-600'
                            }`}
                          >
                            {store.is_open
                              ? 'Close Delivery Store'
                              : 'Open Delivery Store'}
                          </button>
                        </div>
                      )
                    )
                  )}
                </div>
              </div>

              <div className="mt-5 overflow-x-auto rounded-3xl border border-neutral-800 bg-neutral-900">
                <table className="min-w-[900px] w-full text-left">
                  <thead className="border-b border-neutral-800 bg-neutral-950 text-[9px] uppercase tracking-wider text-neutral-600">
                    <tr>
                      <th className="p-4">
                        Module
                      </th>
                      <th className="p-4">
                        Tenant
                      </th>
                      <th className="p-4">
                        Order / Booking
                      </th>
                      <th className="p-4">
                        Customer
                      </th>
                      <th className="p-4">
                        Status
                      </th>
                      <th className="p-4">
                        Payment
                      </th>
                      <th className="p-4 text-right">
                        Total
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-neutral-800 text-xs">
                    {recentOrders
                      .slice(
                        0,
                        100
                      )
                      .map(
                        (row) => (
                          <tr
                            key={`${row.module}-${row.id}`}
                          >
                            <td className="p-4 font-black uppercase text-neutral-400">
                              {row.module}
                            </td>

                            <td className="p-4 font-bold text-white">
                              {row.restaurant_name ||
                                'Tenant'}
                            </td>

                            <td className="p-4 font-mono text-[10px] text-neutral-400">
                              {row.order_code ||
                                row.id}
                            </td>

                            <td className="p-4 text-neutral-300">
                              {row.customer_name ||
                                '—'}
                            </td>

                            <td className="p-4">
                              <StatusPill
                                value={
                                  row.status
                                }
                              />
                            </td>

                            <td className="p-4">
                              <StatusPill
                                value={
                                  row.payment_status ||
                                  row.payment_method
                                }
                              />
                            </td>

                            <td className="p-4 text-right font-black text-white">
                              {money(
                                row.total_amount
                              )}
                            </td>
                          </tr>
                        )
                      )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {section === 'registrations' && (
            <AdminRegistrationApprovals />
          )}

          {section === 'privacy-deletions' && (
            <AdminPrivacyDeletionReviews />
          )}

          {section === 'wallet-controls' && (
            <AdminWalletControls />
          )}

          {section === 'delivery-signup' && (
            <AdminDeliverySignupSettings />
          )}

          {section === 'delivery-orders' && (
            <DeliveryOrdersReport />
          )}

          {section ===
            'people' && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
                People
              </p>

              <h1 className="mt-1 text-2xl font-black text-white">
                Users & Staff
              </h1>

              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Metric
                  label="Registered Users"
                  value={
                    summary.authUsers ||
                    0
                  }
                />

                <Metric
                  label="Staff Accounts"
                  value={
                    summary.staff ||
                    0
                  }
                />

                <Metric
                  label="Drivers"
                  value={
                    summary.drivers ||
                    0
                  }
                />

                <Metric
                  label="Packers"
                  value={
                    summary.packers ||
                    0
                  }
                />
              </div>

              <div className="mt-5 rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                <h2 className="text-sm font-black text-white">
                  Staff Directory
                </h2>

                <p className="mt-1 text-[10px] text-neutral-500">
                  Passwords are intentionally never returned to this dashboard.
                </p>

                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {(data?.staff ||
                    [])
                    .slice(
                      0,
                      150
                    )
                    .map(
                      (row) => (
                        <div
                          key={
                            row.id
                          }
                          className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-black text-white">
                                {row.name ||
                                  row.user_id ||
                                  'Staff'}
                              </p>

                              <p className="mt-1 text-[9px] uppercase text-neutral-500">
                                {row.role ||
                                  'staff'}
                              </p>
                            </div>

                            <StatusPill
                              value={
                                row.is_active
                                  ? 'active'
                                  : 'inactive'
                              }
                            />
                          </div>
                        </div>
                      )
                    )}
                </div>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                  <h2 className="text-sm font-black text-white">
                    Delivery Drivers
                  </h2>

                  <p className="mt-1 text-[10px] text-neutral-500">
                    Enable or disable Driver access from the ERP.
                  </p>

                  <div className="mt-4 space-y-2">
                    {!(data?.drivers || []).length ? (
                      <Empty>
                        No Delivery drivers found.
                      </Empty>
                    ) : (
                      data.drivers.slice(0, 100).map(
                        (worker) => (
                          <div
                            key={worker.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-950 p-3"
                          >
                            <div>
                              <p className="text-xs font-black text-white">
                                {worker.name || 'Driver'}
                              </p>

                              <p className="mt-1 text-[9px] text-neutral-600">
                                {worker.mobile || 'No mobile'}
                              </p>
                            </div>

                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() =>
                                action({
                                  action:
                                    'set_worker_active',
                                  workerType:
                                    'driver',
                                  workerId:
                                    worker.id,
                                  active:
                                    !worker.is_active,
                                })
                              }
                              className={`rounded-lg px-3 py-2 text-[9px] font-black text-white ${
                                worker.is_active
                                  ? 'bg-red-600'
                                  : 'bg-emerald-600'
                              }`}
                            >
                              {worker.is_active
                                ? 'Disable'
                                : 'Enable'}
                            </button>
                          </div>
                        )
                      )
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                  <h2 className="text-sm font-black text-white">
                    Delivery Packers
                  </h2>

                  <p className="mt-1 text-[10px] text-neutral-500">
                    Enable or disable Packer access from the ERP.
                  </p>

                  <div className="mt-4 space-y-2">
                    {!(data?.packers || []).length ? (
                      <Empty>
                        No Delivery packers found.
                      </Empty>
                    ) : (
                      data.packers.slice(0, 100).map(
                        (worker) => (
                          <div
                            key={worker.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-950 p-3"
                          >
                            <div>
                              <p className="text-xs font-black text-white">
                                {worker.name || 'Packer'}
                              </p>

                              <p className="mt-1 text-[9px] text-neutral-600">
                                {worker.mobile || 'No mobile'}
                              </p>
                            </div>

                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() =>
                                action({
                                  action:
                                    'set_worker_active',
                                  workerType:
                                    'packer',
                                  workerId:
                                    worker.id,
                                  active:
                                    !worker.is_active,
                                })
                              }
                              className={`rounded-lg px-3 py-2 text-[9px] font-black text-white ${
                                worker.is_active
                                  ? 'bg-red-600'
                                  : 'bg-emerald-600'
                              }`}
                            >
                              {worker.is_active
                                ? 'Disable'
                                : 'Enable'}
                            </button>
                          </div>
                        )
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {section ===
            'inventory' && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
                Inventory
              </p>

              <h1 className="mt-1 text-2xl font-black text-white">
                Stock Risk Monitor
              </h1>

              <div className="mt-5">
                {!(
                  data?.lowStock ||
                  []
                ).length ? (
                  <Empty>
                    No low-stock items detected.
                  </Empty>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {data.lowStock.map(
                      (row) => {
                        const available =
                          Math.max(
                            0,
                            Number(
                              row.stock_quantity ||
                                0
                            ) -
                              Number(
                                row.reserved_quantity ||
                                  0
                              )
                          )

                        return (
                          <article
                            key={
                              row.id
                            }
                            className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4"
                          >
                            <p className="text-sm font-black text-white">
                              {row.name}
                            </p>

                            <p className="mt-1 text-[9px] text-neutral-500">
                              {row.category ||
                                'Other'}
                            </p>

                            <div className="mt-3 flex items-end justify-between gap-3">
                              <div>
                                <p className="text-[9px] uppercase text-neutral-600">
                                  Available
                                </p>

                                <p className="mt-1 text-xl font-black text-amber-400">
                                  {available}
                                </p>
                              </div>

                              <p className="text-[9px] text-neutral-500">
                                Threshold{' '}
                                {row.low_stock_threshold}
                              </p>
                            </div>

                            <button
                              type="button"
                              disabled={
                                actionLoading
                              }
                              onClick={async () => {
                                const raw =
                                  window.prompt(
                                    `Add stock for ${row.name}:`,
                                    '1'
                                  )

                                if (raw === null) {
                                  return
                                }

                                const quantity =
                                  Number(
                                    String(raw).trim()
                                  )

                                if (
                                  !Number.isInteger(quantity) ||
                                  quantity <= 0
                                ) {
                                  window.alert(
                                    'Enter a positive whole-number quantity.'
                                  )
                                  return
                                }

                                await action({
                                  action:
                                    'restock_inventory',
                                  restaurantId:
                                    row.restaurant_id,
                                  itemId:
                                    row.id,
                                  quantity,
                                })
                              }}
                              className="mt-3 w-full rounded-xl bg-emerald-600 px-3 py-2.5 text-[9px] font-black text-white disabled:opacity-50"
                            >
                              Restock Item
                            </button>
                          </article>
                        )
                      }
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {section ===
            'live-support' && (
            <div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
                    Admin Live Support
                  </p>

                  <h1 className="mt-1 text-2xl font-black text-white">
                    Restaurant / Manager Live Chat
                  </h1>

                  <p className="mt-2 max-w-3xl text-xs leading-5 text-neutral-500">
                    Accept support requests raised from Restaurant/Manager portals and reply from the ERP. This is separate from the customer Delivery Help Centre.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={
                    liveSupportLoading
                  }
                  onClick={() =>
                    loadLiveSupport(
                      selectedLiveSupport?.id ||
                        ''
                    )
                  }
                  className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-[10px] font-black text-neutral-300 disabled:opacity-50"
                >
                  {liveSupportLoading
                    ? 'Refreshing...'
                    : 'Refresh Live Support'}
                </button>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                <Metric
                  label="Pending"
                  value={
                    liveSupportCounts.pending ||
                    0
                  }
                />

                <Metric
                  label="Connected"
                  value={
                    liveSupportCounts.connected ||
                    0
                  }
                />

                <Metric
                  label="Total Sessions"
                  value={
                    liveSupportCounts.total ||
                    0
                  }
                />
              </div>

              {liveSupportError && (
                <div className="mt-4 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs font-bold leading-5 text-red-300">
                  {liveSupportError}
                </div>
              )}

              <div className="mt-5 grid min-h-[620px] gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
                <aside className="overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900">
                  <div className="border-b border-neutral-800 p-4">
                    <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">
                      Live Support Inbox
                    </p>

                    <p className="mt-1 text-sm font-black text-white">
                      Support Requests
                    </p>
                  </div>

                  <div className="max-h-[650px] space-y-2 overflow-y-auto p-3">
                    {!liveSupportSessions.length ? (
                      <Empty>
                        No Live Support sessions yet.
                      </Empty>
                    ) : (
                      liveSupportSessions.map(
                        (session) => {
                          const active =
                            String(
                              selectedLiveSupport?.id ||
                                ''
                            ) ===
                            String(
                              session.id
                            )

                          return (
                            <button
                              key={
                                session.id
                              }
                              type="button"
                              onClick={() =>
                                openLiveSupport(
                                  session
                                )
                              }
                              className={`w-full rounded-2xl border p-3 text-left transition ${
                                active
                                  ? 'border-red-500/50 bg-red-500/10'
                                  : 'border-neutral-800 bg-neutral-950 hover:border-neutral-700'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-black text-white">
                                    {session.restaurant_name ||
                                      'Restaurant'}
                                  </p>

                                  <p className="mt-1 font-mono text-[9px] text-neutral-600">
                                    {session.restaurant_code ||
                                      '-----'}
                                  </p>
                                </div>

                                <StatusPill
                                  value={
                                    session.status
                                  }
                                />
                              </div>

                              {session.issue_category && (
                                <p className="mt-2 line-clamp-1 text-[9px] font-bold text-amber-400">
                                  {session.issue_category}
                                </p>
                              )}

                              <p className="mt-2 text-[8px] text-neutral-600">
                                Requested{' '}
                                {formatDate(
                                  session.requested_at
                                )}
                              </p>
                            </button>
                          )
                        }
                      )
                    )}
                  </div>
                </aside>

                <section className="flex min-h-[620px] flex-col overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900">
                  {!selectedLiveSupport ? (
                    <div className="flex flex-1 items-center justify-center p-8">
                      <div className="max-w-sm text-center">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-950 text-xl">
                          💬
                        </div>

                        <h2 className="mt-4 text-lg font-black text-white">
                          Select a support request
                        </h2>

                        <p className="mt-2 text-xs leading-6 text-neutral-500">
                          Pending and connected Restaurant/Manager support sessions appear in the inbox automatically.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <header className="border-b border-neutral-800 p-4 sm:p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-lg font-black text-white">
                              {selectedLiveSupport.restaurant_name ||
                                'Restaurant'}
                            </p>

                            <p className="mt-1 font-mono text-[9px] text-neutral-500">
                              {selectedLiveSupport.restaurant_code ||
                                '-----'}
                              {' · '}
                              {selectedLiveSupport.id}
                            </p>

                            <div className="mt-2">
                              <StatusPill
                                value={
                                  selectedLiveSupport.status
                                }
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {selectedLiveSupport.status ===
                              'pending' && (
                              <button
                                type="button"
                                disabled={
                                  liveSupportActionLoading
                                }
                                onClick={
                                  acceptLiveSupport
                                }
                                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-[10px] font-black text-white disabled:opacity-50"
                              >
                                Accept Chat
                              </button>
                            )}

                            {selectedLiveSupport.status !==
                              'closed' && (
                              <button
                                type="button"
                                disabled={
                                  liveSupportActionLoading
                                }
                                onClick={
                                  closeLiveSupport
                                }
                                className="rounded-xl bg-red-600 px-4 py-2.5 text-[10px] font-black text-white disabled:opacity-50"
                              >
                                Close Chat
                              </button>
                            )}
                          </div>
                        </div>

                        {selectedLiveSupport.ai_summary && (
                          <div className="mt-4 rounded-2xl border border-violet-500/20 bg-violet-500/10 p-3">
                            <p className="text-[9px] font-black uppercase tracking-wider text-violet-300">
                              AI Escalation Summary
                            </p>

                            <p className="mt-2 whitespace-pre-wrap text-[10px] leading-5 text-violet-100/80">
                              {selectedLiveSupport.ai_summary}
                            </p>
                          </div>
                        )}
                      </header>

                      <div className="flex-1 space-y-2 overflow-y-auto bg-neutral-950/40 p-4 sm:p-5">
                        {!liveSupportMessages.length ? (
                          <div className="py-12 text-center text-xs text-neutral-600">
                            No chat messages yet.
                          </div>
                        ) : (
                          liveSupportMessages.map(
                            (message) => {
                              const adminMessage =
                                String(
                                  message.sender ||
                                    ''
                                ).toLowerCase() ===
                                'admin'

                              return (
                                <div
                                  key={
                                    message.id
                                  }
                                  className={`flex ${
                                    adminMessage
                                      ? 'justify-end'
                                      : 'justify-start'
                                  }`}
                                >
                                  <div
                                    className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                                      adminMessage
                                        ? 'bg-red-600 text-white'
                                        : 'border border-neutral-800 bg-neutral-900 text-neutral-200'
                                    }`}
                                  >
                                    <p className="whitespace-pre-wrap text-xs leading-5">
                                      {message.message}
                                    </p>

                                    <p
                                      className={`mt-1 text-[8px] font-bold ${
                                        adminMessage
                                          ? 'text-red-200'
                                          : 'text-neutral-600'
                                      }`}
                                    >
                                      {adminMessage
                                        ? 'Admin'
                                        : 'Restaurant / Manager'}
                                      {' · '}
                                      {formatDate(
                                        message.created_at
                                      )}
                                    </p>
                                  </div>
                                </div>
                              )
                            }
                          )
                        )}
                      </div>

                      <div className="border-t border-neutral-800 p-4">
                        {selectedLiveSupport.status ===
                        'connected' ? (
                          <form
                            onSubmit={
                              sendLiveSupportReply
                            }
                            className="flex gap-2"
                          >
                            <textarea
                              rows={2}
                              value={
                                liveSupportReply
                              }
                              onChange={(
                                event
                              ) =>
                                setLiveSupportReply(
                                  event.target.value.slice(
                                    0,
                                    2000
                                  )
                                )
                              }
                              placeholder="Reply to Restaurant / Manager..."
                              className="min-h-[52px] flex-1 resize-none rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-xs text-white outline-none focus:border-red-500"
                            />

                            <button
                              type="submit"
                              disabled={
                                liveSupportActionLoading ||
                                !liveSupportReply.trim()
                              }
                              className="rounded-xl bg-red-600 px-5 py-3 text-[10px] font-black text-white disabled:opacity-50"
                            >
                              Send
                            </button>
                          </form>
                        ) : selectedLiveSupport.status ===
                          'pending' ? (
                          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-[10px] font-bold text-amber-300">
                            Accept this request before replying.
                          </div>
                        ) : (
                          <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-[10px] font-bold text-neutral-500">
                            This Live Support chat is closed.
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </section>
              </div>
            </div>
          )}

          {section ===
            'support' && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
                Help Centre
              </p>

              <h1 className="mt-1 text-2xl font-black text-white">
                Customer Requests & Return Pickups
              </h1>

              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                  <h2 className="text-sm font-black text-white">
                    Delivery Help Centre
                  </h2>

                  <div className="mt-4 space-y-2">
                    {!supportThreads.length ? (
                      <Empty>
                        No Help Centre threads.
                      </Empty>
                    ) : (
                      supportThreads
                        .slice(
                          0,
                          100
                        )
                        .map(
                          (thread) => (
                            <div
                              key={
                                thread.id
                              }
                              className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-mono text-[10px] font-black text-white">
                                    {thread.thread_code ||
                                      thread.id}
                                  </p>

                                  <p className="mt-1 text-[10px] font-bold text-neutral-400">
                                    {thread.restaurant_name}
                                  </p>

                                  <p className="mt-1 text-[9px] text-neutral-600">
                                    {thread.customer_name ||
                                      'Customer'}{' '}
                                    ·{' '}
                                    {thread.customer_mobile ||
                                      '—'}
                                  </p>
                                </div>

                                <StatusPill
                                  value={
                                    thread.status
                                  }
                                />
                              </div>

                              <button
                                type="button"
                                disabled={
                                  actionLoading
                                }
                                onClick={() =>
                                  action({
                                    action:
                                      'set_support_status',
                                    threadId:
                                      thread.id,
                                    status:
                                      thread.status ===
                                      'open'
                                        ? 'closed'
                                        : 'open',
                                  })
                                }
                                className="mt-3 rounded-lg border border-neutral-800 px-3 py-2 text-[9px] font-black text-neutral-300"
                              >
                                {thread.status ===
                                'open'
                                  ? 'Close Thread'
                                  : 'Reopen Thread'}
                              </button>
                            </div>
                          )
                        )
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                  <h2 className="text-sm font-black text-white">
                    Return Pickups
                  </h2>

                  <div className="mt-4 space-y-2">
                    {!(
                      data?.returnPickups ||
                      []
                    ).length ? (
                      <Empty>
                        No return pickups.
                      </Empty>
                    ) : (
                      data.returnPickups
                        .slice(
                          0,
                          100
                        )
                        .map(
                          (pickup) => (
                            <div
                              key={
                                pickup.id
                              }
                              className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-mono text-[10px] font-black text-white">
                                    {pickup.pickup_code ||
                                      pickup.id}
                                  </p>

                                  <p className="mt-1 text-[10px] font-bold text-neutral-400">
                                    {pickup.restaurant_name}
                                  </p>

                                  <p className="mt-1 text-[9px] text-neutral-600">
                                    {pickup.customer_name ||
                                      'Customer'}
                                  </p>
                                </div>

                                <StatusPill
                                  value={
                                    pickup.status
                                  }
                                />
                              </div>
                            </div>
                          )
                        )
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {section ===
            'reviews' && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
                Customer Voice
              </p>

              <h1 className="mt-1 text-2xl font-black text-white">
                Verified Product Reviews
              </h1>

              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {!reviews.length ? (
                  <div className="md:col-span-2 xl:col-span-3">
                    <Empty>
                      No verified product reviews yet.
                    </Empty>
                  </div>
                ) : (
                  reviews.map(
                    (review) => (
                      <article
                        key={
                          review.id
                        }
                        className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-white">
                              {review.product_name ||
                                'Product'}
                            </p>

                            <p className="mt-1 text-amber-400">
                              {'★'.repeat(
                                Math.max(
                                  0,
                                  Math.min(
                                    5,
                                    Number(
                                      review.rating ||
                                        0
                                    )
                                  )
                                )
                              )}
                            </p>
                          </div>

                          <StatusPill
                            value={
                              review.is_visible
                                ? 'active'
                                : 'inactive'
                            }
                          />
                        </div>

                        {review.review_text && (
                          <p className="mt-3 text-xs leading-5 text-neutral-400">
                            “{review.review_text}”
                          </p>
                        )}

                        <p className="mt-3 text-[9px] text-neutral-600">
                          {review.customer_display_name ||
                            'Verified customer'}{' '}
                          ·{' '}
                          {formatDate(
                            review.created_at
                          )}
                        </p>

                        <button
                          type="button"
                          disabled={
                            actionLoading
                          }
                          onClick={() =>
                            action({
                              action:
                                'set_review_visibility',
                              reviewId:
                                review.id,
                              visible:
                                !review.is_visible,
                            })
                          }
                          className="mt-3 rounded-lg border border-neutral-800 px-3 py-2 text-[9px] font-black text-neutral-300"
                        >
                          {review.is_visible
                            ? 'Hide Review'
                            : 'Show Review'}
                        </button>
                      </article>
                    )
                  )
                )}
              </div>
            </div>
          )}

          {section ===
            'payments' && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
                Payments
              </p>

              <h1 className="mt-1 text-2xl font-black text-white">
                Gateway Readiness
              </h1>

              <p className="mt-2 max-w-3xl text-xs leading-5 text-neutral-500">
                Admin can verify which tenant/module gateways are configured. Secret keys are never returned to the browser.
              </p>

              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {!(
                  data?.gateways ||
                  []
                ).length ? (
                  <div className="md:col-span-2 xl:col-span-3">
                    <Empty>
                      No payment gateway configurations found.
                    </Empty>
                  </div>
                ) : (
                  data.gateways.map(
                    (gateway) => (
                      <div
                        key={
                          gateway.id
                        }
                        className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black uppercase text-white">
                              {gateway.module ||
                                'module'}
                            </p>

                            <p className="mt-1 text-[9px] uppercase text-neutral-500">
                              {gateway.provider ||
                                'provider'}
                            </p>
                          </div>

                          <StatusPill
                            value={
                              gateway.is_enabled
                                ? 'active'
                                : 'inactive'
                            }
                          />
                        </div>

                        <p className="mt-3 font-mono text-[10px] text-neutral-400">
                          {gateway.key_id_masked ||
                            'Key ID not configured'}
                        </p>

                        <button
                          type="button"
                          disabled={
                            actionLoading
                          }
                          onClick={() =>
                            action({
                              action:
                                'set_gateway_enabled',
                              gatewayId:
                                gateway.id,
                              enabled:
                                !gateway.is_enabled,
                            })
                          }
                          className={`mt-3 w-full rounded-xl px-3 py-2.5 text-[9px] font-black text-white ${
                            gateway.is_enabled
                              ? 'bg-red-600'
                              : 'bg-emerald-600'
                          }`}
                        >
                          {gateway.is_enabled
                            ? 'Disable Gateway'
                            : 'Enable Gateway'}
                        </button>
                      </div>
                    )
                  )
                )}
              </div>
            </div>
          )}

          {section === 'client-websites' && <AdminClientWebsites />}

          {section ===
            'system' && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
                System
              </p>

              <h1 className="mt-1 text-2xl font-black text-white">
                Platform Control & Health
              </h1>

              <div className="mt-5 rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-red-400">Customer Login Security</p>
                    <h2 className="mt-1 text-lg font-black text-white">Mobile OTP Verification</h2>
                    <p className="mt-2 text-xs leading-5 text-neutral-400">
                      Control whether customer login requests OTP verification. Turning OTP off must not expose private order history or saved addresses without a verified session.
                    </p>
                  </div>
                  <label className="flex items-center gap-3 text-xs font-bold text-white">
                    <span>{otpEnabled ? 'OTP ON' : 'OTP OFF'}</span>
                    <input
                      type="checkbox"
                      checked={otpEnabled}
                      disabled={otpSettingsLoading || otpSettingsSaving}
                      onChange={(event) => {
                        setOtpEnabled(event.target.checked)
                        setOtpSettingsNotice('')
                      }}
                      className="h-5 w-5 accent-red-600"
                    />
                  </label>
                </div>
                {otpSettingsError && <p role="alert" className="mt-3 text-xs text-red-400">{otpSettingsError}</p>}
                {otpSettingsNotice && <p role="status" className="mt-3 text-xs text-emerald-400">{otpSettingsNotice}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={saveOtpSettings}
                    disabled={otpSettingsLoading || otpSettingsSaving || Boolean(otpSettingsError)}
                    className="rounded-xl bg-red-600 px-5 py-3 text-xs font-black text-white disabled:opacity-50">
                    {otpSettingsSaving ? 'Saving...' : 'Save OTP Setting'}
                  </button>
                  <button type="button" onClick={loadOtpSettings} disabled={otpSettingsSaving || otpSettingsLoading}
                    className="rounded-xl border border-neutral-700 px-4 py-3 text-xs font-bold text-neutral-300 disabled:opacity-50">
                    {otpSettingsLoading ? 'Loading...' : 'Reload Setting'}
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                <AdminMaintenanceSettings onChange={syncMaintenanceStatus} />

                <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                  <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">
                    PWA Architecture
                  </p>

                  <h2 className="mt-1 text-lg font-black text-white">
                    Installed Application
                  </h2>

                  <div className="mt-4 rounded-2xl bg-neutral-950 p-4 font-mono text-xs text-emerald-400">
                    <p>
                      start_url: /app
                    </p>
                    <p className="mt-2">
                      scope: /app/
                    </p>
                  </div>

                  <p className="mt-3 text-[10px] leading-5 text-neutral-500">
                    This matches the latest architecture: physical app/app/ contains the installed application portals, while the root app/ routes remain the website.
                  </p>
                </div>
              </div>
            </div>
          )}

          {section ===
            'audit' && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
                Accountability
              </p>

              <h1 className="mt-1 text-2xl font-black text-white">
                Admin Audit Log
              </h1>

              <div className="mt-5 space-y-2">
                {!(
                  data?.auditLogs ||
                  []
                ).length ? (
                  <Empty>
                    No Admin actions recorded yet.
                  </Empty>
                ) : (
                  data.auditLogs.map(
                    (row) => (
                      <div
                        key={
                          row.id
                        }
                        className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-xs font-black text-white">
                              {label(
                                row.action
                              )}
                            </p>

                            <p className="mt-1 font-mono text-[9px] text-neutral-500">
                              {row.entity_type}:{' '}
                              {row.entity_id ||
                                'platform'}
                            </p>
                          </div>

                          <div className="text-left sm:text-right">
                            <p className="text-[9px] font-bold text-neutral-400">
                              {row.actor_email ||
                                'Admin'}
                            </p>

                            <p className="mt-1 text-[9px] text-neutral-600">
                              {formatDate(
                                row.created_at
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  )
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {commandOpen && (
        <div className="fixed inset-0 z-[90] flex items-start justify-center bg-black/75 px-4 pb-10 pt-[9vh] backdrop-blur-sm"
          role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCommandOpen(false) }}>
          <div role="dialog" aria-modal="true" aria-label="Search Admin ERP pages" className="w-full max-w-xl overflow-hidden rounded-[24px] border border-neutral-700 bg-[#151a24] shadow-[0_28px_90px_rgba(0,0,0,.6)]">
            <div className="flex items-center gap-3 border-b border-neutral-800 px-5 py-4">
              <AdminUIIcon name="search" size={20} className="text-red-400"/>
              <input autoFocus type="search" value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter' && commandMatches.length) switchSection(commandMatches[0][0]) }}
                aria-label="Search sections" placeholder="Search pages, modules and tools..."
                className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-neutral-500"/>
              <button type="button" onClick={() => setCommandOpen(false)} className="rounded-lg border border-neutral-700 px-2 py-1 text-[10px] text-neutral-400">ESC</button>
            </div>
            <div className="dd-sidebar-scroll max-h-[60vh] overflow-y-auto p-2">
              {commandMatches.length ? commandMatches.map(([key, text]) => (
                <button key={key} type="button" onClick={() => switchSection(key)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-white/[0.055]">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] text-red-300"><AdminUIIcon name={NAV_ICONS[key]} size={19}/></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-white">{text}</span>
                    <span className="mt-1 block truncate text-[10px] text-neutral-500">{NAV_DESCRIPTIONS[key]}</span>
                  </span>
                  <AdminUIIcon name="arrow" size={16} className="text-neutral-600"/>
                </button>
              )) : <p className="p-8 text-center text-xs text-neutral-500">No matching modules found.</p>}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-neutral-800 px-5 py-3 text-[10px] text-neutral-500">
              <span>Search across {NAV.length} workspace sections</span>
              <span>Enter to open · Esc to close</span>
            </div>
          </div>
        </div>
      )}

      {tenantEditor && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[94dvh] w-full max-w-lg overflow-y-auto rounded-t-[30px] border border-neutral-800 bg-neutral-950 p-5 shadow-2xl sm:rounded-[30px]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-wider text-red-400">
                  Tenant Access
                </p>

                <h2 className="mt-1 text-xl font-black text-white">
                  {tenantEditor.name ||
                    'Tenant'}
                </h2>

                <p className="mt-1 font-mono text-[9px] text-neutral-600">
                  {tenantEditor.restaurant_code ||
                    tenantEditor.id}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setTenantEditor(
                    null
                  )
                }
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-800 text-neutral-400"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-2 block text-[9px] font-black uppercase tracking-wider text-neutral-500">
                  Plan / Module Access
                </span>

                <select
                  value={
                    tenantEditor.planCode
                  }
                  onChange={(
                    event
                  ) =>
                    setTenantEditor(
                      (
                        current
                      ) => ({
                        ...current,
                        planCode:
                          event.target.value,
                      })
                    )
                  }
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-xs text-white outline-none"
                >
                  {PLAN_OPTIONS.map(
                    ([
                      value,
                      optionLabel,
                    ]) => (
                      <option
                        key={
                          value
                        }
                        value={
                          value
                        }
                      >
                        {optionLabel}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-[9px] font-black uppercase tracking-wider text-neutral-500">
                  Subscription Status
                </span>

                <select
                  value={
                    tenantEditor.subscriptionStatus
                  }
                  onChange={(
                    event
                  ) =>
                    setTenantEditor(
                      (
                        current
                      ) => ({
                        ...current,
                        subscriptionStatus:
                          event.target.value,
                      })
                    )
                  }
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-xs text-white outline-none"
                >
                  {STATUS_OPTIONS.map(
                    (value) => (
                      <option
                        key={
                          value
                        }
                        value={
                          value
                        }
                      >
                        {label(
                          value
                        )}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-[9px] font-black uppercase tracking-wider text-neutral-500">
                  Billing Cycle
                </span>

                <select
                  value={
                    tenantEditor.billingCycle
                  }
                  onChange={(
                    event
                  ) =>
                    setTenantEditor(
                      (
                        current
                      ) => ({
                        ...current,
                        billingCycle:
                          event.target.value,
                      })
                    )
                  }
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-xs text-white outline-none"
                >
                  {BILLING_OPTIONS.map(
                    (value) => (
                      <option
                        key={
                          value
                        }
                        value={
                          value
                        }
                      >
                        {value}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-[9px] font-black uppercase tracking-wider text-neutral-500">
                  Subscription Expiry
                </span>

                <input
                  type="date"
                  value={
                    tenantEditor.subscriptionExpiresAt ||
                    ''
                  }
                  onChange={(
                    event
                  ) =>
                    setTenantEditor(
                      (
                        current
                      ) => ({
                        ...current,
                        subscriptionExpiresAt:
                          event.target.value,
                      })
                    )
                  }
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-xs text-white outline-none"
                />
              </label>

              {/* Independent admin-only fee save. Does not change access or wallet balances. */}
              <AdminRestaurantFeeEditor restaurantId={tenantEditor.id} />

              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-[10px] leading-5 text-amber-200">
                Changing the plan updates Restaurant / Delivery / Resort module flags together. Setting status to suspended, expired or inactive removes access from the current plan-aware application resolver.
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-white">
                      Restaurant Features
                    </p>
                    <p className="mt-1 text-[9px] leading-4 text-neutral-500">
                      Admin entitlement controls. Turning the master switch off blocks the module without deleting the saved child preferences.
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {RESTAURANT_FEATURE_OPTIONS.map(
                    ([
                      key,
                      featureLabel,
                      description,
                      master,
                    ]) => {
                      const enabled =
                        tenantEditor.features?.[key] !== false

                      const masterEnabled =
                        tenantEditor.features?.restaurant_enabled !== false

                      const visuallyDisabled =
                        !master &&
                        !masterEnabled

                      return (
                        <div
                          key={key}
                          className={`flex items-center justify-between gap-4 rounded-xl border px-3 py-3 ${
                            master
                              ? 'border-red-500/25 bg-red-500/5'
                              : 'border-neutral-800 bg-neutral-950/60'
                          } ${visuallyDisabled ? 'opacity-50' : ''}`}
                        >
                          <div className="min-w-0">
                            <p className="text-[10px] font-black text-white">
                              {featureLabel}
                            </p>
                            <p className="mt-1 text-[9px] leading-4 text-neutral-500">
                              {description}
                            </p>
                          </div>

                          <button
                            type="button"
                            aria-pressed={enabled}
                            onClick={() =>
                              setTenantEditor(
                                (current) => ({
                                  ...current,
                                  features: {
                                    ...DEFAULT_TENANT_FEATURES,
                                    ...(current?.features || {}),
                                    [key]: !enabled,
                                  },
                                })
                              )
                            }
                            className={`relative h-7 w-12 shrink-0 rounded-full border transition ${
                              enabled
                                ? 'border-emerald-500/40 bg-emerald-500/25'
                                : 'border-neutral-700 bg-neutral-800'
                            }`}
                          >
                            <span
                              className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                                enabled
                                  ? 'left-6'
                                  : 'left-1'
                              }`}
                            />
                          </button>
                        </div>
                      )
                    }
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-white">
                    Delivery Features
                  </p>
                  <p className="mt-1 text-[9px] leading-4 text-neutral-500">
                    These switches control which delivery capabilities this tenant is entitled to use.
                  </p>
                </div>

                <div className="mt-4 space-y-2">
                  {DELIVERY_FEATURE_OPTIONS.map(
                    ([
                      key,
                      featureLabel,
                      description,
                      master,
                    ]) => {
                      const enabled =
                        tenantEditor.features?.[key] !== false

                      const masterEnabled =
                        tenantEditor.features?.delivery_enabled !== false

                      const visuallyDisabled =
                        !master &&
                        !masterEnabled

                      return (
                        <div
                          key={key}
                          className={`flex items-center justify-between gap-4 rounded-xl border px-3 py-3 ${
                            master
                              ? 'border-red-500/25 bg-red-500/5'
                              : 'border-neutral-800 bg-neutral-950/60'
                          } ${visuallyDisabled ? 'opacity-50' : ''}`}
                        >
                          <div className="min-w-0">
                            <p className="text-[10px] font-black text-white">
                              {featureLabel}
                            </p>
                            <p className="mt-1 text-[9px] leading-4 text-neutral-500">
                              {description}
                            </p>
                          </div>

                          <button
                            type="button"
                            aria-pressed={enabled}
                            onClick={() =>
                              setTenantEditor(
                                (current) => ({
                                  ...current,
                                  features: {
                                    ...DEFAULT_TENANT_FEATURES,
                                    ...(current?.features || {}),
                                    [key]: !enabled,
                                  },
                                })
                              )
                            }
                            className={`relative h-7 w-12 shrink-0 rounded-full border transition ${
                              enabled
                                ? 'border-emerald-500/40 bg-emerald-500/25'
                                : 'border-neutral-700 bg-neutral-800'
                            }`}
                          >
                            <span
                              className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
                                enabled
                                  ? 'left-6'
                                  : 'left-1'
                              }`}
                            />
                          </button>
                        </div>
                      )
                    }
                  )}
                </div>
              </div>

              <button
                type="button"
                disabled={
                  actionLoading
                }
                onClick={
                  saveTenant
                }
                className="w-full rounded-xl bg-red-600 px-5 py-4 text-xs font-black text-white disabled:opacity-50"
              >
                {actionLoading
                  ? 'Saving...'
                  : 'Save Access, Subscription & Features'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
