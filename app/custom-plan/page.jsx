'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

const MODULES = [
  {
    id: 'restaurant',
    number: '01',
    title: 'Restaurant',
    subtitle: 'Build your restaurant operating system',
    description:
      'Choose the tools you need for ordering, staff operations, kitchen workflow, payments, billing and restaurant management.',
    requirements: [
      {
        id: 'qr_menu',
        title: 'QR Menu & Mobile Ordering',
        description:
          'Customers scan a QR code, view your live menu and place orders directly from their phone.',
        benefit:
          'Reduces printed menus, speeds up ordering and gives customers a modern ordering experience.',
      },
      {
        id: 'dine_in',
        title: 'Dine-In Ordering',
        description:
          'Connect customer orders with restaurant tables and manage dine-in orders digitally.',
        benefit:
          'Helps staff identify the correct table and reduces manual order mistakes.',
      },
      {
        id: 'parcel',
        title: 'Parcel / Takeaway',
        description:
          'Customers can place takeaway orders separately from dine-in orders.',
        benefit:
          'Lets your restaurant manage dine-in and takeaway orders from the same system.',
      },
      {
        id: 'owner_portal',
        title: 'Owner Portal',
        description:
          'Provides the restaurant owner with access to restaurant operations, settings and controls.',
        benefit:
          'Gives the owner central visibility and control over the restaurant.',
      },
      {
        id: 'manager_portal',
        title: 'Manager Portal',
        description:
          'Provides managers with their own operational workspace.',
        benefit:
          'Allows daily restaurant operations to be managed without sharing owner access.',
      },
      {
        id: 'waiter_portal',
        title: 'Waiter Portal',
        description:
          'Waiters receive a dedicated interface for handling restaurant orders and service.',
        benefit:
          'Makes order handling faster and separates waiter access from management access.',
      },
      {
        id: 'kitchen_kds',
        title: 'Kitchen / KDS',
        description:
          'Orders are displayed digitally for kitchen staff with preparation-status controls.',
        benefit:
          'Reduces handwritten tickets and helps the kitchen process orders in sequence.',
      },
      {
        id: 'razorpay',
        title: 'Restaurant Razorpay Payments',
        description:
          'Accept supported online payments for restaurant orders using your configured Razorpay account.',
        benefit:
          'Customers can pay digitally instead of depending only on counter payments.',
      },
      {
        id: 'counter_payment',
        title: 'Pay at Counter',
        description:
          'Allow customers to place an order and complete payment at your restaurant counter.',
        benefit:
          'Useful for restaurants that want both online and counter-payment workflows.',
      },
      {
        id: 'gst_billing',
        title: 'GST Billing & Digital Invoice',
        description:
          'Generate structured bills with configured tax information and digital invoice details.',
        benefit:
          'Creates a cleaner billing workflow for both your restaurant and customers.',
      },
      {
        id: 'offers',
        title: 'Offers & Promotions',
        description:
          'Display restaurant offers and promotional items to customers.',
        benefit:
          'Helps promote selected menu items, combos and special deals.',
      },
      {
        id: 'highly_reordered',
        title: 'Highly Reordered Items',
        description:
          'Highlight popular items based on ordering activity.',
        benefit:
          'Helps customers quickly discover frequently ordered menu items.',
      },
      {
        id: 'reports',
        title: 'Restaurant Reports',
        description:
          'Provide useful operational information about restaurant orders and activity.',
        benefit:
          'Helps owners understand business performance and daily restaurant operations.',
      },
    ],
  },

  {
    id: 'delivery',
    number: '02',
    title: 'Delivery',
    subtitle: 'Operate your own local delivery service',
    description:
      'Choose the tools required for your delivery storefront, inventory, packing, riders, payments, tracking and customer support.',
    requirements: [
      {
        id: 'delivery_storefront',
        title: 'Delivery Storefront',
        description:
          'Create a customer ordering area for Food, Groceries, Fruits & Vegetables.',
        benefit:
          'Lets customers directly order products from your own delivery platform.',
      },
      {
        id: 'cod',
        title: 'Cash on Delivery',
        description:
          'Allow eligible customers to pay when their order is delivered.',
        benefit:
          'Supports customers who prefer cash instead of online payment.',
      },
      {
        id: 'delivery_razorpay',
        title: 'Delivery Razorpay Payments',
        description:
          'Accept prepaid delivery orders through your configured Razorpay gateway.',
        benefit:
          'Provides customers with a secure prepaid digital-payment option.',
      },
      {
        id: 'inventory',
        title: 'Inventory & Opening Stock',
        description:
          'Track opening stock, available stock, reserved stock and stock movement.',
        benefit:
          'Helps reduce overselling and gives staff better visibility into inventory.',
      },
      {
        id: 'barcode',
        title: 'Barcode Scanning',
        description:
          'Use supported barcode scanning to identify products and assist inventory workflows.',
        benefit:
          'Makes packaged-product entry and verification faster.',
      },
      {
        id: 'packer',
        title: 'Packer Portal',
        description:
          'Give packing staff their own portal for preparing and verifying delivery orders.',
        benefit:
          'Separates packing responsibilities from management and delivery staff.',
      },
      {
        id: 'driver',
        title: 'Delivery Boy Portal',
        description:
          'Give delivery staff access to their assigned delivery tasks and order workflow.',
        benefit:
          'Drivers can focus on orders assigned specifically to them.',
      },
      {
        id: 'auto_assignment',
        title: 'Automatic Driver Assignment',
        description:
          'Automatically attempt to assign eligible orders to available delivery staff.',
        benefit:
          'Reduces manual assignment work during busy periods.',
      },
      {
        id: 'live_tracking',
        title: 'Live Delivery Tracking',
        description:
          'Support delivery progress and location-based delivery operations.',
        benefit:
          'Improves visibility during the delivery process.',
      },
      {
        id: 'delivery_proof',
        title: 'Delivery Proof',
        description:
          'Maintain delivery-completion information as part of the delivery workflow.',
        benefit:
          'Helps verify that an assigned delivery has been completed.',
      },
      {
        id: 'delivery_radius',
        title: 'Delivery Radius Control',
        description:
          'Restrict delivery orders based on your configured service distance.',
        benefit:
          'Prevents orders from locations outside your supported delivery area.',
      },
      {
        id: 'minimum_order',
        title: 'Minimum Order Rules',
        description:
          'Configure delivery-fee behaviour when an order is below your required minimum.',
        benefit:
          'Helps protect delivery economics for small-value orders.',
      },
      {
        id: 'handling_charge',
        title: 'Handling Charges',
        description:
          'Configure an additional handling amount for applicable delivery orders.',
        benefit:
          'Lets your business account for operational handling costs.',
      },
      {
        id: 'packing_charge',
        title: 'Packing Charges',
        description:
          'Configure packing charges for eligible delivery orders.',
        benefit:
          'Helps your business recover packaging-related operational costs.',
      },
      {
        id: 'surge',
        title: 'Demand-Based Surge Pricing',
        description:
          'Support additional delivery charges when configured demand conditions are reached.',
        benefit:
          'Helps manage delivery operations during high-demand periods.',
      },
      {
        id: 'returns',
        title: 'Returns & Replacement Workflow',
        description:
          'Managers can handle approved return or replacement requests through the operational workflow.',
        benefit:
          'Provides a structured process for customer order issues.',
      },
      {
        id: 'return_pickup',
        title: 'Return Pickup by Delivery Boy',
        description:
          'Approved returns can create pickup tasks for delivery staff.',
        benefit:
          'Keeps return pickup connected to your delivery operation.',
      },
      {
        id: 'live_support',
        title: 'Customer Live Support',
        description:
          'Allow customers to contact management regarding delivery-order problems.',
        benefit:
          'Creates a direct support channel between customers and your operations team.',
      },
      {
        id: 'cod_reconciliation',
        title: 'COD Cash Reconciliation',
        description:
          'Track cash collected by delivery staff and its handover to management.',
        benefit:
          'Makes COD cash accountability easier to manage.',
      },
    ],
  },

  {
    id: 'resort',
    number: '03',
    title: 'Resort',
    subtitle: 'Digitize rooms, bookings and guests',
    description:
      'Choose the tools required to manage resort inventory, reservations, guests, management access and payments.',
    requirements: [
      {
        id: 'resort_workspace',
        title: 'Resort Management Workspace',
        description:
          'Create a dedicated operational area for your resort.',
        benefit:
          'Keeps resort operations organized while remaining part of Digital Dine-In.',
      },
      {
        id: 'room_types',
        title: 'Room Types',
        description:
          'Create and manage different room categories offered by your property.',
        benefit:
          'Helps organize rooms according to category and offering.',
      },
      {
        id: 'room_inventory',
        title: 'Room Inventory',
        description:
          'Manage the rooms available under your configured room types.',
        benefit:
          'Provides better visibility into your accommodation inventory.',
      },
      {
        id: 'booking_management',
        title: 'Booking Management',
        description:
          'Manage resort reservations and booking status digitally.',
        benefit:
          'Creates a structured booking workflow instead of relying only on manual records.',
      },
      {
        id: 'guest_workflow',
        title: 'Guest Management',
        description:
          'Maintain the guest information needed for booking operations.',
        benefit:
          'Keeps important guest and reservation information connected.',
      },
      {
        id: 'resort_manager',
        title: 'Owner / Manager Access',
        description:
          'Give authorized management staff visibility into resort operations.',
        benefit:
          'Allows owners and managers to supervise bookings and room operations.',
      },
      {
        id: 'resort_payment',
        title: 'Resort Online Payments',
        description:
          'Use separately configured payment handling for eligible resort bookings.',
        benefit:
          'Allows booking payments to be handled digitally where configured.',
      },
      {
        id: 'resort_reports',
        title: 'Resort Reports & Overview',
        description:
          'Provide management with useful booking and operational information.',
        benefit:
          'Helps management review resort activity from one place.',
      },
    ],
  },
]

function RequirementCard({
  requirement,
  selected,
  onToggle,
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full rounded-2xl border p-4 text-left transition ${
        selected
          ? 'border-orange-400 bg-orange-50 shadow-sm'
          : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[10px] font-black ${
            selected
              ? 'border-orange-500 bg-orange-500 text-white'
              : 'border-neutral-300 bg-white text-transparent'
          }`}
        >
          ✓
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-black text-neutral-950">
            {requirement.title}
          </h3>

          <p className="mt-2 text-[11px] leading-5 text-neutral-600">
            {requirement.description}
          </p>

          <div className="mt-3 rounded-xl bg-neutral-50 p-3">
            <p className="text-[8px] font-black uppercase tracking-[0.14em] text-orange-600">
              What this adds to your business
            </p>

            <p className="mt-1.5 text-[10px] leading-5 text-neutral-600">
              {requirement.benefit}
            </p>
          </div>
        </div>
      </div>
    </button>
  )
}

export default function CustomPlanPage() {
  const [activeModule, setActiveModule] =
    useState('restaurant')

  const [selected, setSelected] =
    useState({})

  const [customerName, setCustomerName] =
    useState('')

  const [contactNumber, setContactNumber] =
    useState('')

  const [email, setEmail] =
    useState('')

  const [businessName, setBusinessName] =
    useState('')

  const [businessCity, setBusinessCity] =
    useState('')

  const [
    additionalRequirements,
    setAdditionalRequirements,
  ] = useState('')

  const [submitting, setSubmitting] =
    useState(false)

  const [error, setError] =
    useState('')

  const [submitted, setSubmitted] =
    useState(false)

  const active =
    MODULES.find(
      (module) =>
        module.id === activeModule
    ) || MODULES[0]

  const toggleRequirement = (
    moduleId,
    requirementId
  ) => {
    const key =
      `${moduleId}:${requirementId}`

    setSelected((current) => ({
      ...current,
      [key]: !current[key],
    }))

    setError('')
  }

  const selectedByModule =
    useMemo(() => {
      const result = {
        restaurant: [],
        delivery: [],
        resort: [],
      }

      MODULES.forEach((module) => {
        module.requirements.forEach(
          (requirement) => {
            const key =
              `${module.id}:${requirement.id}`

            if (selected[key]) {
              result[module.id].push({
                id: requirement.id,
                title:
                  requirement.title,
              })
            }
          }
        )
      })

      return result
    }, [selected])

  const totalSelected =
    selectedByModule.restaurant.length +
    selectedByModule.delivery.length +
    selectedByModule.resort.length

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (submitting) {
      return
    }

    setError('')

    if (totalSelected === 0) {
      setError(
        'Please select at least one requirement.'
      )
      return
    }

    const cleanName =
      customerName.trim()

    if (!cleanName) {
      setError(
        'Please enter your name.'
      )
      return
    }

    const cleanedPhone =
      contactNumber.replace(/\D/g, '')

    if (
      cleanedPhone.length < 10 ||
      cleanedPhone.length > 15
    ) {
      setError(
        'Please enter a valid contact number.'
      )
      return
    }

    if (
      email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email.trim()
      )
    ) {
      setError(
        'Please enter a valid email address.'
      )
      return
    }

    setSubmitting(true)

    try {
      const response = await fetch(
        '/api/custom-plan',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            customerName:
              cleanName,

            contactNumber:
              contactNumber.trim(),

            email:
              email.trim(),

            businessName:
              businessName.trim(),

            businessCity:
              businessCity.trim(),

            additionalRequirements:
              additionalRequirements.trim(),

            restaurantRequirements:
              selectedByModule.restaurant,

            deliveryRequirements:
              selectedByModule.delivery,

            resortRequirements:
              selectedByModule.resort,
          }),
        }
      )

      let result = null

      try {
        result =
          await response.json()
      } catch {
        result = null
      }

      if (
        !response.ok ||
        !result?.ok
      ) {
        throw new Error(
          result?.error ||
            'Unable to submit your requirements.'
        )
      }

      setSubmitted(true)

      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      })
    } catch (submitError) {
      console.error(
        'Custom plan submission error:',
        submitError
      )

      setError(
        submitError?.message ||
          'Unable to submit your requirements. Please try again.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <main className="min-h-screen bg-[#f7f7f5] px-4 py-12">
        <div className="mx-auto flex min-h-[75vh] max-w-xl items-center justify-center">
          <div className="w-full rounded-[32px] border border-neutral-200 bg-white p-7 text-center shadow-sm sm:p-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-2xl font-black text-emerald-600">
              ✓
            </div>

            <p className="mt-6 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">
              Requirements Submitted
            </p>

            <h1 className="mt-3 text-3xl font-black tracking-tight text-neutral-950">
              Thank you.
            </h1>

            <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-neutral-600">
              We have received your
              business requirements.
            </p>

            <p className="mx-auto mt-2 max-w-md text-sm font-bold leading-7 text-neutral-900">
              Our managers will contact
              you soon.
            </p>

            <p className="mx-auto mt-2 max-w-md text-[10px] leading-5 text-neutral-400">
              Our team will review the
              features you selected and
              contact you using the
              number you provided.
            </p>

            <Link
              href="/"
              className="mt-7 inline-flex min-h-12 items-center justify-center rounded-xl bg-neutral-950 px-6 text-xs font-black text-white transition hover:bg-neutral-800"
            >
              Back to Digital Dine-In
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f7f7f5] text-neutral-950">
      {/* HEADER */}

      <header className="sticky top-0 z-50 border-b border-neutral-200 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-3"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-950 text-[10px] font-black text-white">
              DD
            </div>

            <div>
              <p className="text-xs font-black">
                Digital Dine-In
              </p>

              <p className="text-[8px] font-bold uppercase tracking-[0.14em] text-neutral-400">
                Custom Plan
              </p>
            </div>
          </Link>

          <Link
            href="/"
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[9px] font-black text-neutral-600 transition hover:bg-neutral-50 hover:text-neutral-950"
          >
            Back Home
          </Link>
        </div>
      </header>

      {/* HERO */}

      <section className="border-b border-neutral-200 bg-neutral-950 text-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="inline-flex rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1.5">
            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-400">
              Build Your Own Plan
            </span>
          </div>

          <h1 className="mt-5 max-w-3xl text-3xl font-black tracking-[-0.04em] sm:text-5xl">
            Tell us exactly what
            your business needs.
          </h1>

          <p className="mt-5 max-w-2xl text-sm leading-7 text-neutral-400">
            Select the Restaurant,
            Delivery and Resort
            features you need. Every
            option explains what it
            does and what it adds to
            your business.
          </p>

          <div className="mt-7 flex flex-wrap gap-2">
            <span className="rounded-full border border-neutral-800 px-3 py-1.5 text-[9px] font-bold text-neutral-400">
              Restaurant
            </span>

            <span className="rounded-full border border-neutral-800 px-3 py-1.5 text-[9px] font-bold text-neutral-400">
              Delivery
            </span>

            <span className="rounded-full border border-neutral-800 px-3 py-1.5 text-[9px] font-bold text-neutral-400">
              Resort
            </span>
          </div>
        </div>
      </section>

      <form onSubmit={handleSubmit}>
        <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
          {/* MODULE TABS */}

          <div className="grid gap-3 sm:grid-cols-3">
            {MODULES.map(
              (module) => {
                const count =
                  selectedByModule[
                    module.id
                  ].length

                const isActive =
                  activeModule ===
                  module.id

                return (
                  <button
                    key={module.id}
                    type="button"
                    onClick={() =>
                      setActiveModule(
                        module.id
                      )
                    }
                    className={`rounded-2xl border p-4 text-left transition ${
                      isActive
                        ? 'border-orange-400 bg-orange-50 shadow-sm'
                        : 'border-neutral-200 bg-white hover:border-neutral-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[9px] font-black text-neutral-400">
                        {module.number}
                      </span>

                      {count > 0 ? (
                        <span className="rounded-full bg-orange-500 px-2.5 py-1 text-[8px] font-black text-neutral-950">
                          {count}{' '}
                          selected
                        </span>
                      ) : (
                        <span className="text-[8px] font-bold text-neutral-300">
                          Optional
                        </span>
                      )}
                    </div>

                    <h2 className="mt-3 text-lg font-black">
                      {module.title}
                    </h2>

                    <p className="mt-1 text-[10px] leading-5 text-neutral-500">
                      {
                        module.subtitle
                      }
                    </p>
                  </button>
                )
              }
            )}
          </div>

          {/* REQUIREMENTS */}

          <div className="mt-6 rounded-[28px] border border-neutral-200 bg-white p-5 sm:p-7">
            <div className="flex flex-col gap-4 border-b border-neutral-100 pb-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-orange-600">
                  {active.title}{' '}
                  Requirements
                </p>

                <h2 className="mt-2 text-2xl font-black">
                  What do you need?
                </h2>

                <p className="mt-3 max-w-3xl text-xs leading-6 text-neutral-500">
                  {
                    active.description
                  }
                </p>
              </div>

              <div className="shrink-0 rounded-xl bg-neutral-50 px-4 py-3">
                <p className="text-[8px] font-black uppercase tracking-[0.12em] text-neutral-400">
                  Selected
                </p>

                <p className="mt-1 text-lg font-black text-neutral-950">
                  {
                    selectedByModule[
                      active.id
                    ].length
                  }
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 lg:grid-cols-2">
              {active.requirements.map(
                (requirement) => {
                  const key =
                    `${active.id}:${requirement.id}`

                  return (
                    <RequirementCard
                      key={
                        requirement.id
                      }
                      requirement={
                        requirement
                      }
                      selected={Boolean(
                        selected[key]
                      )}
                      onToggle={() =>
                        toggleRequirement(
                          active.id,
                          requirement.id
                        )
                      }
                    />
                  )
                }
              )}
            </div>
          </div>

          {/* SELECTED SUMMARY */}

          <div className="mt-6 rounded-[28px] border border-neutral-200 bg-white p-5 sm:p-7">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-orange-600">
                  Your Selection
                </p>

                <h2 className="mt-2 text-2xl font-black">
                  Selected requirements
                </h2>
              </div>

              <div className="rounded-full bg-neutral-950 px-4 py-2 text-[9px] font-black text-white">
                {totalSelected}{' '}
                selected
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {MODULES.map(
                (module) => {
                  const items =
                    selectedByModule[
                      module.id
                    ]

                  return (
                    <div
                      key={
                        module.id
                      }
                      className="rounded-2xl bg-neutral-50 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-black">
                          {
                            module.title
                          }
                        </h3>

                        <span className="text-[9px] font-black text-orange-600">
                          {
                            items.length
                          }
                        </span>
                      </div>

                      {items.length >
                      0 ? (
                        <div className="mt-3 space-y-2">
                          {items.map(
                            (item) => (
                              <p
                                key={
                                  item.id
                                }
                                className="text-[9px] leading-4 text-neutral-600"
                              >
                                <span className="font-black text-orange-600">
                                  ✓
                                </span>{' '}
                                {
                                  item.title
                                }
                              </p>
                            )
                          )}
                        </div>
                      ) : (
                        <p className="mt-3 text-[9px] text-neutral-400">
                          No
                          requirements
                          selected.
                        </p>
                      )}
                    </div>
                  )
                }
              )}
            </div>
          </div>

          {/* CONTACT DETAILS */}

          <div className="mt-6 rounded-[28px] border border-neutral-200 bg-white p-5 sm:p-7">
            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-orange-600">
              Final Step
            </p>

            <h2 className="mt-2 text-2xl font-black">
              How can our manager
              contact you?
            </h2>

            <p className="mt-3 max-w-2xl text-xs leading-6 text-neutral-500">
              Enter your contact
              details after selecting
              your requirements. Our
              team will review your
              request and contact you.
            </p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {/* NAME */}

              <label>
                <span className="text-[9px] font-black uppercase tracking-[0.12em] text-neutral-500">
                  Your Name *
                </span>

                <input
                  type="text"
                  value={
                    customerName
                  }
                  onChange={(
                    event
                  ) => {
                    setCustomerName(
                      event.target
                        .value
                    )
                    setError('')
                  }}
                  maxLength={100}
                  autoComplete="name"
                  placeholder="Enter your name"
                  className="mt-2 min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-4 text-sm outline-none transition focus:border-orange-500"
                />
              </label>

              {/* PHONE */}

              <label>
                <span className="text-[9px] font-black uppercase tracking-[0.12em] text-neutral-500">
                  Contact Number *
                </span>

                <input
                  type="tel"
                  inputMode="tel"
                  value={
                    contactNumber
                  }
                  onChange={(
                    event
                  ) => {
                    setContactNumber(
                      event.target
                        .value
                    )
                    setError('')
                  }}
                  maxLength={20}
                  autoComplete="tel"
                  placeholder="Enter mobile number"
                  className="mt-2 min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-4 text-sm outline-none transition focus:border-orange-500"
                />
              </label>

              {/* BUSINESS */}

              <label>
                <span className="text-[9px] font-black uppercase tracking-[0.12em] text-neutral-500">
                  Business Name
                </span>

                <input
                  type="text"
                  value={
                    businessName
                  }
                  onChange={(
                    event
                  ) =>
                    setBusinessName(
                      event.target
                        .value
                    )
                  }
                  maxLength={150}
                  autoComplete="organization"
                  placeholder="Restaurant / Resort / Store name"
                  className="mt-2 min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-4 text-sm outline-none transition focus:border-orange-500"
                />
              </label>

              {/* CITY */}

              <label>
                <span className="text-[9px] font-black uppercase tracking-[0.12em] text-neutral-500">
                  City
                </span>

                <input
                  type="text"
                  value={
                    businessCity
                  }
                  onChange={(
                    event
                  ) =>
                    setBusinessCity(
                      event.target
                        .value
                    )
                  }
                  maxLength={100}
                  autoComplete="address-level2"
                  placeholder="Business city"
                  className="mt-2 min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-4 text-sm outline-none transition focus:border-orange-500"
                />
              </label>

              {/* EMAIL */}

              <label className="md:col-span-2">
                <span className="text-[9px] font-black uppercase tracking-[0.12em] text-neutral-500">
                  Email
                </span>

                <input
                  type="email"
                  value={email}
                  onChange={(
                    event
                  ) => {
                    setEmail(
                      event.target
                        .value
                    )
                    setError('')
                  }}
                  maxLength={200}
                  autoComplete="email"
                  placeholder="Optional email address"
                  className="mt-2 min-h-12 w-full rounded-xl border border-neutral-300 bg-white px-4 text-sm outline-none transition focus:border-orange-500"
                />
              </label>

              {/* EXTRA REQUIREMENTS */}

              <label className="md:col-span-2">
                <span className="text-[9px] font-black uppercase tracking-[0.12em] text-neutral-500">
                  Additional
                  Requirements
                </span>

                <textarea
                  value={
                    additionalRequirements
                  }
                  onChange={(
                    event
                  ) =>
                    setAdditionalRequirements(
                      event.target
                        .value
                    )
                  }
                  maxLength={1500}
                  rows={5}
                  placeholder="Tell us about anything else your business requires..."
                  className="mt-2 w-full resize-none rounded-xl border border-neutral-300 bg-white p-4 text-sm outline-none transition focus:border-orange-500"
                />

                <p className="mt-1 text-right text-[8px] font-bold text-neutral-400">
                  {
                    additionalRequirements.length
                  }
                  /1500
                </p>
              </label>
            </div>

            {/* ERROR */}

            {error ? (
              <div
                role="alert"
                className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-[10px] font-bold leading-5 text-red-700"
              >
                {error}
              </div>
            ) : null}

            {/* SUBMISSION INFO */}

            <div className="mt-6 rounded-2xl bg-neutral-50 p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-sm">
                  ✓
                </div>

                <div>
                  <p className="text-[10px] font-black text-neutral-950">
                    Before
                    submitting
                  </p>

                  <p className="mt-1 text-[9px] leading-5 text-neutral-500">
                    Your selected
                    requirements and
                    contact
                    information will
                    be securely sent
                    to Digital
                    Dine-In for
                    review. Our
                    management team
                    will contact you
                    regarding your
                    custom plan.
                  </p>
                </div>
              </div>
            </div>

            {/* SUBMIT */}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="submit"
                disabled={
                  submitting ||
                  totalSelected ===
                    0
                }
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-orange-500 px-7 text-xs font-black text-neutral-950 transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting
                  ? 'Submitting Requirements...'
                  : 'Submit Requirements'}
              </button>

              {totalSelected ===
              0 ? (
                <p className="text-[9px] font-bold text-neutral-400">
                  Select at least
                  one requirement
                  before submitting.
                </p>
              ) : (
                <p className="text-[9px] font-bold text-neutral-500">
                  {
                    totalSelected
                  }{' '}
                  requirement
                  {totalSelected ===
                  1
                    ? ''
                    : 's'}{' '}
                  ready to submit.
                </p>
              )}
            </div>
          </div>
        </section>
      </form>

      {/* FOOTER */}

      <footer className="border-t border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-7 text-center sm:px-6 md:flex-row md:items-center md:justify-between md:text-left">
          <div>
            <p className="text-xs font-black">
              Digital Dine-In
            </p>

            <p className="mt-1 text-[8px] font-bold text-neutral-400">
              Restaurant · Delivery
              · Resort
            </p>
          </div>

          <Link
            href="/"
            className="text-[9px] font-black text-neutral-500 hover:text-neutral-950"
          >
            Back to Home
          </Link>
        </div>
      </footer>
    </main>
  )
}