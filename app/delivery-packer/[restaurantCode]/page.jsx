'use client'

import {
  use,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { supabase } from '@/lib/supabase'
import { useMobileViewportLock } from '@/lib/useMobileViewportLock'
import { useLiveDeliveryRefresh } from '@/lib/useLiveDeliveryRefresh'

function money(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  })}`
}

function labelStatus(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatDate(value) {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function DeliveryPackerPortal({
  params,
}) {
  const unwrappedParams = use(params)

  useMobileViewportLock()

  const restaurantCode = String(
    unwrappedParams?.restaurantCode ||
      unwrappedParams?.restaurantcode ||
      ''
  ).trim()

  const storageKey =
    `digitaldining_delivery_packer_session_${restaurantCode}`

  const [
    sessionToken,
    setSessionToken,
  ] = useState('')

  const [
    userId,
    setUserId,
  ] = useState('')

  const [
    password,
    setPassword,
  ] = useState('')

  const [
    portalData,
    setPortalData,
  ] = useState(null)

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    loggingIn,
    setLoggingIn,
  ] = useState(false)

  const [
    refreshing,
    setRefreshing,
  ] = useState(false)

  const [
    updatingOrderId,
    setUpdatingOrderId,
  ] = useState('')

  const [
    error,
    setError,
  ] = useState('')

  const [
    message,
    setMessage,
  ] = useState('')

  const [
    barcodeInputs,
    setBarcodeInputs,
  ] = useState({})

  const [
    scanningOrderId,
    setScanningOrderId,
  ] = useState('')

  const [
    cameraOrderId,
    setCameraOrderId,
  ] = useState('')

  const [
    cameraError,
    setCameraError,
  ] = useState('')

  const [
    cameraStarting,
    setCameraStarting,
  ] = useState(false)

  const videoRef =
    useRef(null)

  const cameraStreamRef =
    useRef(null)

  const cameraFrameRef =
    useRef(null)

  const cameraScanLockedRef =
    useRef(false)

  /*
   * ---------------------------------------------------------
   * LOAD SAVED PACKER SESSION
   * ---------------------------------------------------------
   */

  useEffect(() => {
    try {
      const saved =
        localStorage.getItem(
          storageKey
        )

      if (saved) {
        setSessionToken(saved)
      }
    } catch {
      // Ignore unavailable local storage.
    }

    setLoading(false)
  }, [storageKey])

  /*
   * ---------------------------------------------------------
   * LOAD PACKER PORTAL
   * ---------------------------------------------------------
   */

  const loadPortal = async (
    tokenOverride = '',
    quiet = false
  ) => {
    const token =
      String(
        tokenOverride ||
          sessionToken ||
          ''
      ).trim()

    if (!token) {
      setPortalData(null)
      return
    }

    if (quiet) {
      setRefreshing(true)
    }

    try {
      const {
        data,
        error: rpcError,
      } = await supabase.rpc(
        'get_delivery_packer_portal_data',
        {
          p_session_token:
            token,
        }
      )

      if (rpcError) {
        throw rpcError
      }

      if (!data?.success) {
        throw new Error(
          data?.message ||
            'Packer session is invalid.'
        )
      }

      setPortalData(data)
      setError('')
    } catch (loadError) {
      console.error(
        'Packer portal load error:',
        loadError
      )

      setPortalData(null)
      setSessionToken('')

      try {
        localStorage.removeItem(
          storageKey
        )
      } catch {
        // Ignore.
      }

      setError(
        loadError?.message ||
          'Your Packer Portal session expired. Please sign in again.'
      )
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    if (!sessionToken) {
      return
    }

    loadPortal()

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken])

  /*
   * ---------------------------------------------------------
   * LIVE DELIVERY REFRESH
   * ---------------------------------------------------------
   */

  useLiveDeliveryRefresh(
    () =>
      loadPortal(
        '',
        false
      ),
    Boolean(sessionToken),
    1000
  )

  /*
   * ---------------------------------------------------------
   * LOGIN
   * ---------------------------------------------------------
   */

  const handleLogin = async (
    event
  ) => {
    event.preventDefault()

    if (loggingIn) {
      return
    }

    const cleanUserId =
      userId
        .trim()
        .toLowerCase()

    if (
      cleanUserId.length < 3 ||
      password.length < 6
    ) {
      setError(
        'Enter your Packer User ID and password.'
      )

      return
    }

    setLoggingIn(true)
    setError('')
    setMessage('')

    try {
      const {
        data,
        error: rpcError,
      } = await supabase.rpc(
        'delivery_packer_login',
        {
          p_restaurant_code:
            restaurantCode,

          p_user_id:
            cleanUserId,

          p_password:
            password,
        }
      )

      if (rpcError) {
        throw rpcError
      }

      if (
        !data?.success ||
        !data?.session_token
      ) {
        throw new Error(
          data?.message ||
            'Packer login failed.'
        )
      }

      const token =
        String(
          data.session_token
        )

      try {
        localStorage.setItem(
          storageKey,
          token
        )
      } catch {
        // Continue even if local storage is unavailable.
      }

      setSessionToken(token)

      setPassword('')

      setMessage(
        `Welcome ${
          data?.packer?.name ||
          'Packer'
        }.`
      )

      await loadPortal(
        token
      )
    } catch (loginError) {
      console.error(
        'Delivery packer login error:',
        loginError
      )

      setError(
        loginError?.message ||
          'Packer login failed.'
      )
    } finally {
      setLoggingIn(false)
    }
  }

  /*
   * ---------------------------------------------------------
   * LOGOUT
   * ---------------------------------------------------------
   */

  const logout = async () => {
    const token =
      sessionToken

    try {
      if (token) {
        await supabase.rpc(
          'delivery_packer_logout',
          {
            p_session_token:
              token,
          }
        )
      }
    } catch (logoutError) {
      console.error(
        'Packer logout error:',
        logoutError
      )
    } finally {
      try {
        localStorage.removeItem(
          storageKey
        )
      } catch {
        // Ignore.
      }

      setCameraOrderId('')
      setCameraError('')
      setScanningOrderId('')
      setBarcodeInputs({})

      setSessionToken('')
      setPortalData(null)
      setUserId('')
      setPassword('')
      setMessage('')
      setError('')
    }
  }

  /*
   * ---------------------------------------------------------
   * UPDATE PACKING PROGRESS LOCALLY
   * ---------------------------------------------------------
   */

  const updatePackingLocally = (
    orderId,
    packing
  ) => {
    if (!packing) {
      return
    }

    setPortalData(
      (current) => {
        if (
          !current ||
          !Array.isArray(
            current.orders
          )
        ) {
          return current
        }

        return {
          ...current,

          orders:
            current.orders.map(
              (order) =>
                order.id ===
                orderId
                  ? {
                      ...order,
                      packing,
                    }
                  : order
            ),
        }
      }
    )
  }

  /*
   * ---------------------------------------------------------
   * VERIFY BARCODE
   * ---------------------------------------------------------
   */

  const submitBarcode =
    async (
      orderId,
      rawBarcode
    ) => {
      const barcode =
        String(
          rawBarcode || ''
        ).trim()

      if (
        !sessionToken ||
        !orderId ||
        !barcode ||
        scanningOrderId
      ) {
        if (!barcode) {
          setError(
            'Scan or enter a product barcode.'
          )
        }

        return false
      }

      setScanningOrderId(
        orderId
      )

      setError('')
      setMessage('')

      try {
        const {
          data,
          error: rpcError,
        } = await supabase.rpc(
          'delivery_packer_scan_barcode',
          {
            p_session_token:
              sessionToken,

            p_order_id:
              orderId,

            p_barcode:
              barcode,
          }
        )

        if (rpcError) {
          throw rpcError
        }

        if (!data?.success) {
          const scanError =
            new Error(
              data?.message ||
                'Unable to verify this barcode.'
            )

          scanError.code =
            data?.code || ''

          throw scanError
        }

        updatePackingLocally(
          orderId,
          data?.packing
        )

        setBarcodeInputs(
          (current) => ({
            ...current,
            [orderId]: '',
          })
        )

        setMessage(
          data?.message ||
            'Product barcode verified.'
        )

        await loadPortal(
          '',
          true
        )

        return true
      } catch (scanError) {
        console.error(
          'Packer barcode scan error:',
          scanError
        )

        setError(
          scanError?.message ||
            'Unable to verify this barcode.'
        )

        return false
      } finally {
        setScanningOrderId('')
      }
    }

  /*
   * ---------------------------------------------------------
   * CAMERA HELPERS
   * ---------------------------------------------------------
   */

  const stopCamera = () => {
    if (
      cameraFrameRef.current
    ) {
      window.cancelAnimationFrame(
        cameraFrameRef.current
      )

      cameraFrameRef.current =
        null
    }

    if (
      cameraStreamRef.current
    ) {
      cameraStreamRef.current
        .getTracks()
        .forEach(
          (track) => {
            try {
              track.stop()
            } catch {
              // Ignore camera cleanup errors.
            }
          }
        )

      cameraStreamRef.current =
        null
    }

    if (
      videoRef.current
    ) {
      videoRef.current.srcObject =
        null
    }

    cameraScanLockedRef.current =
      false
  }

  const closeCameraScanner =
    () => {
      stopCamera()

      setCameraOrderId('')
      setCameraError('')
      setCameraStarting(false)
    }

  const openCameraScanner = (
    orderId
  ) => {
    if (
      !orderId ||
      scanningOrderId
    ) {
      return
    }

    setCameraError('')
    setCameraOrderId(
      orderId
    )
  }

  /*
   * ---------------------------------------------------------
   * NATIVE BARCODE CAMERA
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (!cameraOrderId) {
      return undefined
    }

    let cancelled = false

    const startCamera =
      async () => {
        if (
          typeof window ===
            'undefined' ||
          !navigator
            ?.mediaDevices
            ?.getUserMedia
        ) {
          setCameraError(
            'Camera access is not supported here. Use manual barcode entry below.'
          )

          return
        }

        if (
          !(
            'BarcodeDetector' in
            window
          )
        ) {
          setCameraError(
            'Automatic barcode detection is not supported by this browser. Use manual barcode entry on the order card.'
          )

          return
        }

        setCameraStarting(true)

        try {
          const stream =
            await navigator
              .mediaDevices
              .getUserMedia({
                video: {
                  facingMode: {
                    ideal:
                      'environment',
                  },
                },

                audio: false,
              })

          if (cancelled) {
            stream
              .getTracks()
              .forEach(
                (track) =>
                  track.stop()
              )

            return
          }

          cameraStreamRef.current =
            stream

          const video =
            videoRef.current

          if (!video) {
            throw new Error(
              'Camera preview is unavailable.'
            )
          }

          video.srcObject =
            stream

          await video.play()

          const detector =
            new window.BarcodeDetector()

          const detectOnce =
            async () => {
              if (
                cancelled ||
                cameraScanLockedRef.current ||
                !videoRef.current
              ) {
                return
              }

              try {
                const detected =
                  await detector.detect(
                    videoRef.current
                  )

                const barcode =
                  String(
                    detected?.[0]
                      ?.rawValue ||
                      ''
                  ).trim()

                if (barcode) {
                  /*
                   * One camera activation records one physical scan only.
                   *
                   * Closing after detection prevents the same physical
                   * barcode frame being counted several times.
                   */

                  cameraScanLockedRef.current =
                    true

                  await submitBarcode(
                    cameraOrderId,
                    barcode
                  )

                  if (!cancelled) {
                    setCameraOrderId(
                      ''
                    )

                    setCameraError(
                      ''
                    )
                  }

                  return
                }
              } catch (
                detectError
              ) {
                console.error(
                  'Barcode detector error:',
                  detectError
                )
              }

              if (!cancelled) {
                cameraFrameRef.current =
                  window.requestAnimationFrame(
                    detectOnce
                  )
              }
            }

          cameraFrameRef.current =
            window.requestAnimationFrame(
              detectOnce
            )
        } catch (
          cameraStartError
        ) {
          console.error(
            'Packer camera error:',
            cameraStartError
          )

          if (!cancelled) {
            setCameraError(
              cameraStartError
                ?.message ||
                'Unable to open the camera. Allow camera permission or use manual barcode entry.'
            )
          }
        } finally {
          if (!cancelled) {
            setCameraStarting(
              false
            )
          }
        }
      }

    startCamera()

    return () => {
      cancelled = true
      stopCamera()
    }

    // Camera should restart only when a new order is selected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOrderId])

  useEffect(() => {
    return () =>
      stopCamera()

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /*
   * ---------------------------------------------------------
   * UPDATE ORDER STATUS
   * ---------------------------------------------------------
   */

  const updateStatus =
    async (
      order,
      nextStatus
    ) => {
      if (
        !sessionToken ||
        updatingOrderId
      ) {
        return
      }

      /*
       * Update immediately from Packer Portal.
       *
       * No additional confirmation popup is added.
       * The button press itself remains the action.
       */

      setUpdatingOrderId(
        order.id
      )

      setError('')
      setMessage('')

      try {
        const {
          data,
          error: rpcError,
        } = await supabase.rpc(
          'delivery_packer_update_order_status',
          {
            p_session_token:
              sessionToken,

            p_order_id:
              order.id,

            p_new_status:
              nextStatus,
          }
        )

        if (rpcError) {
          throw rpcError
        }

        if (!data?.success) {
          throw new Error(
            data?.message ||
              'Unable to update order.'
          )
        }

        setMessage(
          nextStatus ===
            'confirmed'
            ? 'Order confirmed.'
            : nextStatus ===
                'packed'
              ? 'Order marked Packed.'
              : 'Order marked Out for Delivery.'
        )

        await loadPortal(
          '',
          true
        )
      } catch (
        updateError
      ) {
        console.error(
          'Packer order update error:',
          updateError
        )

        setError(
          updateError?.message ||
            'Unable to update order.'
        )
      } finally {
        setUpdatingOrderId(
          ''
        )
      }
    }

  /*
   * ---------------------------------------------------------
   * ORDERS
   * ---------------------------------------------------------
   */

  const orders =
    Array.isArray(
      portalData?.orders
    )
      ? portalData.orders
      : []

  const sections =
    useMemo(() => {
      const grouped = {
        received: [],
        confirmed: [],
        packed: [],
        out_for_delivery: [],
      }

      for (
        const order of orders
      ) {
        const status =
          String(
            order.order_status ||
              ''
          )

        if (
          status ===
          'preparing'
        ) {
          grouped.confirmed.push(
            order
          )
        } else if (
          grouped[status]
        ) {
          grouped[status].push(
            order
          )
        }
      }

      return grouped
    }, [orders])

  /*
   * ---------------------------------------------------------
   * LOADING
   * ---------------------------------------------------------
   */

  if (loading) {
    return (
      <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-neutral-950 px-3 py-6 text-white sm:px-4 sm:py-10">
        <div className="mx-auto w-full max-w-md rounded-3xl border border-neutral-800 bg-neutral-900 p-6 text-center sm:p-8">
          Loading Packer
          Portal...
        </div>
      </main>
    )
  }

  /*
   * ---------------------------------------------------------
   * LOGIN PAGE
   * ---------------------------------------------------------
   */

  if (
    !sessionToken ||
    !portalData
  ) {
    return (
      <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-neutral-950 px-3 py-6 text-neutral-100 sm:px-4 sm:py-10">
        <div className="mx-auto w-full max-w-md">
          <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5 shadow-2xl sm:p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10 text-2xl">
              📦
            </div>

            <p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-violet-400">
              Digital Dining
            </p>

            <h1 className="mt-1 text-2xl font-black text-white">
              Delivery Packer
              Login
            </h1>

            <p className="mt-2 text-sm leading-6 text-neutral-400">
              Sign in using the
              Packer User ID and
              password given by
              the owner.
            </p>

            <form
              onSubmit={
                handleLogin
              }
              className="mt-6 space-y-4"
            >
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-neutral-500">
                  Packer User ID
                </span>

                <input
                  value={
                    userId
                  }
                  onChange={(
                    event
                  ) =>
                    setUserId(
                      event.target
                        .value
                    )
                  }
                  autoComplete="username"
                  placeholder="packer01"
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-violet-500"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-neutral-500">
                  Password
                </span>

                <input
                  type="password"
                  value={
                    password
                  }
                  onChange={(
                    event
                  ) =>
                    setPassword(
                      event.target
                        .value
                    )
                  }
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-violet-500"
                />
              </label>

              {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-bold leading-5 text-red-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={
                  loggingIn
                }
                className="w-full rounded-xl bg-violet-600 px-5 py-4 text-sm font-black text-white disabled:opacity-50"
              >
                {loggingIn
                  ? 'Signing In...'
                  : 'Open Packer Portal'}
              </button>
            </form>
          </section>
        </div>
      </main>
    )
  }

  const packer =
    portalData.packer || {}

  const restaurant =
    portalData.restaurant || {}

  /*
   * ---------------------------------------------------------
   * ORDER SECTIONS
   * ---------------------------------------------------------
   */

  const renderOrders = (
    title,
    subtitle,
    rows
  ) => (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
            {subtitle}
          </p>

          <h2 className="mt-1 text-lg font-black text-white">
            {title}
          </h2>
        </div>

        <span className="rounded-full bg-neutral-900 px-3 py-1.5 text-[10px] font-black text-neutral-400">
          {rows.length}
        </span>
      </div>

      <div className="space-y-3">
        {rows.map(
          (order) => {
            const address = [
              order.address_line1,
              order.address_line2,
              order.landmark,
              order.city,
              order.state,
              order.pincode,
            ]
              .filter(
                Boolean
              )
              .join(', ')

            const hasLocation =
              Number.isFinite(
                Number(
                  order.latitude
                )
              ) &&
              Number.isFinite(
                Number(
                  order.longitude
                )
              )

            const mapUrl =
              hasLocation
                ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    `${order.latitude},${order.longitude}`
                  )}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    address
                  )}`

            const busy =
              updatingOrderId ===
              order.id

            const status =
              String(
                order.order_status ||
                  ''
              )

            const packing =
              order?.packing ||
              null

            const hasPackingData =
              Boolean(
                packing &&
                  typeof packing ===
                    'object' &&
                  'requires_scan' in
                    packing
              )

            const requiresScan =
              Boolean(
                packing?.requires_scan
              )

            const readyToPack =
              hasPackingData
                ? Boolean(
                    packing?.ready_to_pack
                  )
                : false

            const requiredTotal =
              Number(
                packing?.required_total ||
                  0
              )

            const scannedTotal =
              Number(
                packing?.scanned_total ||
                  0
              )

            const remainingTotal =
              Number(
                packing?.remaining_total ||
                  0
              )

            const missingBarcodeCount =
              Number(
                packing?.missing_barcode_count ||
                  0
              )

            const packingItems =
              Array.isArray(
                packing?.items
              )
                ? packing.items
                : []

            const scanBusy =
              scanningOrderId ===
              order.id

            const progressPercent =
              requiredTotal > 0
                ? Math.min(
                    100,
                    Math.round(
                      (
                        scannedTotal /
                        requiredTotal
                      ) * 100
                    )
                  )
                : 100

            return (
              <article
                key={
                  order.id
                }
                className="min-w-0 rounded-3xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5"
              >
                {/* ORDER STATUS */}

                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-violet-500/10 px-2.5 py-1 font-mono text-[10px] font-black text-violet-300">
                    {
                      order.order_code
                    }
                  </span>

                  <span className="rounded-full bg-orange-500/10 px-2.5 py-1 text-[10px] font-black text-orange-400">
                    {labelStatus(
                      status
                    )}
                  </span>

                  <span className="rounded-full bg-neutral-800 px-2.5 py-1 text-[10px] font-black text-neutral-300">
                    {order.payment_method ===
                    'cod'
                      ? `COD ${money(
                          order.total_amount
                        )}`
                      : `Paid ${money(
                          order.total_amount
                        )}`}
                  </span>
                </div>

                {/* CUSTOMER */}

                <h3 className="mt-4 text-base font-black text-white">
                  {
                    order.customer_name
                  }
                </h3>

                <p className="mt-1 text-xs text-neutral-400">
                  {
                    order.customer_mobile
                  }

                  {order.alternate_mobile
                    ? ` · Alt ${order.alternate_mobile}`
                    : ''}
                </p>

                {/* ORDER ITEMS */}

                <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                  <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">
                    Items to Pack
                  </p>

                  <div className="mt-2 space-y-2">
                    {Array.isArray(
                      order.items
                    ) &&
                      order.items.map(
                        (
                          item,
                          index
                        ) => (
                          <div
                            key={
                              item.id ||
                              index
                            }
                            className="flex items-start justify-between gap-3 text-xs"
                          >
                            <span className="text-neutral-200">
                              {
                                item.name
                              }{' '}
                              ×{' '}
                              {Number(
                                item.quantity ||
                                  item.qty ||
                                  1
                              )}
                            </span>

                            <span className="font-black text-white">
                              {money(
                                item.line_total ??
                                  Number(
                                    item.price ||
                                      0
                                  ) *
                                    Number(
                                      item.quantity ||
                                        item.qty ||
                                        1
                                    )
                              )}
                            </span>
                          </div>
                        )
                      )}
                  </div>
                </div>

                {/* BARCODE PACKING VERIFICATION */}

                {hasPackingData && (
                  <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">
                          Barcode
                          Verification
                        </p>

                        <p className="mt-1 text-sm font-black text-white">
                          {requiresScan
                            ? `${scannedTotal}/${requiredTotal} items scanned`
                            : 'No barcode scan required'}
                        </p>
                      </div>

                      <span
                        className={`rounded-full px-2.5 py-1 text-[9px] font-black ${
                          readyToPack
                            ? 'bg-emerald-500/10 text-emerald-300'
                            : 'bg-amber-500/10 text-amber-300'
                        }`}
                      >
                        {readyToPack
                          ? 'Ready'
                          : 'Scanning'}
                      </span>
                    </div>

                    {!requiresScan ? (
                      <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-3 text-[10px] font-bold leading-5 text-emerald-300">
                        ✓ Food-only
                        order. Food
                        items do not
                        require barcode
                        verification.
                      </div>
                    ) : (
                      <>
                        {/* PROGRESS BAR */}

                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-800">
                          <div
                            className="h-full rounded-full bg-emerald-500 transition-all"
                            style={{
                              width:
                                `${progressPercent}%`,
                            }}
                          />
                        </div>

                        {/* PRODUCTS */}

                        <div className="mt-3 space-y-2">
                          {packingItems.map(
                            (
                              scanItem
                            ) => {
                              const complete =
                                Boolean(
                                  scanItem?.complete
                                )

                              return (
                                <div
                                  key={
                                    scanItem?.menu_item_id ||
                                    scanItem?.name
                                  }
                                  className={`rounded-xl border px-3 py-3 ${
                                    complete
                                      ? 'border-emerald-500/20 bg-emerald-500/10'
                                      : 'border-neutral-800 bg-neutral-900'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="truncate text-xs font-black text-white">
                                        {scanItem?.name ||
                                          'Packaged Product'}
                                      </p>

                                      <p className="mt-1 text-[9px] font-bold text-neutral-500">
                                        {scanItem?.barcode
                                          ? 'Barcode configured'
                                          : 'Barcode missing'}
                                      </p>
                                    </div>

                                    <div className="shrink-0 text-right">
                                      <p
                                        className={`text-sm font-black ${
                                          complete
                                            ? 'text-emerald-400'
                                            : 'text-white'
                                        }`}
                                      >
                                        {Number(
                                          scanItem?.scanned_quantity ||
                                            0
                                        )}
                                        /
                                        {Number(
                                          scanItem?.required_quantity ||
                                            0
                                        )}
                                      </p>

                                      <p className="mt-0.5 text-[8px] font-black uppercase text-neutral-600">
                                        {complete
                                          ? 'Verified'
                                          : 'Required'}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              )
                            }
                          )}
                        </div>

                        {/* MISSING BARCODE */}

                        {missingBarcodeCount >
                          0 && (
                          <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-3 text-[10px] font-bold leading-5 text-red-300">
                            {
                              missingBarcodeCount
                            }{' '}
                            packaged
                            product
                            {missingBarcodeCount ===
                            1
                              ? ''
                              : 's'}{' '}
                            has no
                            barcode
                            configured.
                            Ask the
                            Manager to
                            configure
                            the barcode
                            before
                            packing.
                          </div>
                        )}

                        {/* SCAN CONTROLS */}

                        {[
                          'confirmed',
                          'preparing',
                        ].includes(
                          status
                        ) &&
                          !readyToPack &&
                          missingBarcodeCount ===
                            0 && (
                            <div className="mt-4 space-y-2">
                              <form
                                onSubmit={async (
                                  event
                                ) => {
                                  event.preventDefault()

                                  await submitBarcode(
                                    order.id,
                                    barcodeInputs[
                                      order
                                        .id
                                    ]
                                  )
                                }}
                                className="flex gap-2"
                              >
                                <input
                                  value={
                                    barcodeInputs[
                                      order
                                        .id
                                    ] ||
                                    ''
                                  }
                                  onChange={(
                                    event
                                  ) =>
                                    setBarcodeInputs(
                                      (
                                        current
                                      ) => ({
                                        ...current,

                                        [order.id]:
                                          event
                                            .target
                                            .value,
                                      })
                                    )
                                  }
                                  autoComplete="off"
                                  inputMode="text"
                                  placeholder="Scan / enter barcode"
                                  className="min-w-0 flex-1 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-xs text-white outline-none focus:border-violet-500"
                                />

                                <button
                                  type="submit"
                                  disabled={
                                    scanBusy ||
                                    !String(
                                      barcodeInputs[
                                        order
                                          .id
                                      ] ||
                                        ''
                                    ).trim()
                                  }
                                  className="shrink-0 rounded-xl bg-violet-600 px-4 py-3 text-[10px] font-black text-white disabled:opacity-40"
                                >
                                  {scanBusy
                                    ? 'Checking...'
                                    : 'Verify'}
                                </button>
                              </form>

                              <button
                                type="button"
                                disabled={
                                  scanBusy ||
                                  Boolean(
                                    cameraOrderId
                                  )
                                }
                                onClick={() =>
                                  openCameraScanner(
                                    order.id
                                  )
                                }
                                className="w-full rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-xs font-black text-violet-300 disabled:opacity-40"
                              >
                                📷 Scan
                                Product with
                                Camera
                              </button>

                              <p className="text-[9px] leading-4 text-neutral-600">
                                Scan each
                                physical
                                packaged
                                unit once.
                                Remaining:{' '}
                                {
                                  remainingTotal
                                }
                                .
                              </p>
                            </div>
                          )}

                        {/* COMPLETED */}

                        {readyToPack && (
                          <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-3 text-[10px] font-black text-emerald-300">
                            ✓ All
                            required
                            packaged
                            products are
                            verified.
                            This order
                            can be
                            marked
                            Packed.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* DELIVERY ADDRESS */}

                <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                  <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">
                    Delivery Address
                  </p>

                  <p className="mt-2 text-xs leading-5 text-neutral-300">
                    {address}
                  </p>

                  {hasLocation && (
                    <p className="mt-2 text-[10px] font-bold text-emerald-400">
                      ✓ Customer live
                      location
                      captured
                      {order.location_accuracy_m
                        ? ` · ±${Math.round(
                            Number(
                              order.location_accuracy_m
                            )
                          )}m`
                        : ''}
                    </p>
                  )}
                </div>

                {/* CUSTOMER ACTIONS */}

                <div className="mt-3 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">
                  <a
                    href={`tel:${order.customer_mobile}`}
                    className="rounded-xl bg-neutral-800 px-4 py-3 text-center text-xs font-black text-white"
                  >
                    Call Customer
                  </a>

                  <a
                    href={
                      mapUrl
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl bg-sky-600 px-4 py-3 text-center text-xs font-black text-white"
                  >
                    Open Location
                  </a>
                </div>

                {/* DRIVER */}

                <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                  <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">
                    Assigned Driver
                  </p>

                  <p className="mt-1 text-xs font-bold text-white">
                    {order.driver_name ||
                      'Waiting for driver assignment'}
                  </p>

                  {order.driver_mobile && (
                    <p className="mt-1 text-[10px] text-neutral-400">
                      {
                        order.driver_mobile
                      }
                    </p>
                  )}
                </div>

                <p className="mt-4 text-[10px] text-neutral-600">
                  Received{' '}
                  {formatDate(
                    order.created_at
                  )}
                </p>

                {/* CONFIRM */}

                {status ===
                  'received' && (
                  <button
                    type="button"
                    disabled={
                      busy
                    }
                    onClick={() =>
                      updateStatus(
                        order,
                        'confirmed'
                      )
                    }
                    className="mt-4 w-full rounded-xl bg-violet-600 px-5 py-4 text-sm font-black text-white disabled:opacity-50"
                  >
                    {busy
                      ? 'Updating...'
                      : 'Confirm Order'}
                  </button>
                )}

                {/* PACK */}

                {[
                  'confirmed',
                  'preparing',
                ].includes(
                  status
                ) && (
                  <button
                    type="button"
                    disabled={
                      busy ||
                      scanBusy ||
                      !readyToPack
                    }
                    onClick={() =>
                      updateStatus(
                        order,
                        'packed'
                      )
                    }
                    className="mt-4 w-full rounded-xl bg-orange-500 px-5 py-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                  >
                    {busy
                      ? 'Updating...'
                      : !hasPackingData
                        ? 'Checking Packing Requirements...'
                        : missingBarcodeCount >
                            0
                          ? 'Barcode Setup Required'
                          : requiresScan &&
                              !readyToPack
                            ? `Scan ${remainingTotal} More Item${
                                remainingTotal ===
                                1
                                  ? ''
                                  : 's'
                              }`
                            : 'Mark Packed'}
                  </button>
                )}

                {/* OUT FOR DELIVERY */}

                {status ===
                  'packed' && (
                  <button
                    type="button"
                    disabled={
                      busy ||
                      !order.driver_id
                    }
                    onClick={() =>
                      updateStatus(
                        order,
                        'out_for_delivery'
                      )
                    }
                    className="mt-4 w-full rounded-xl bg-emerald-600 px-5 py-4 text-sm font-black text-white disabled:opacity-40"
                  >
                    {busy
                      ? 'Updating...'
                      : order.driver_id
                        ? 'Out for Delivery'
                        : 'Waiting for Driver Assignment'}
                  </button>
                )}

                {/* DRIVER COMPLETES DELIVERY */}

                {status ===
                  'out_for_delivery' && (
                  <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs font-bold text-emerald-300">
                    Out for
                    Delivery. Driver
                    completes
                    Delivered / Not
                    Delivered with
                    proof.
                  </div>
                )}
              </article>
            )
          }
        )}

        {!rows.length && (
          <div className="rounded-3xl border border-neutral-800 bg-neutral-900 py-12 text-center text-xs text-neutral-500">
            No orders in this
            stage.
          </div>
        )}
      </div>
    </section>
  )

  /*
   * ---------------------------------------------------------
   * MAIN PACKER PORTAL
   * ---------------------------------------------------------
   */

  return (
    <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-neutral-950 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-neutral-100">
      {/* HEADER */}

      <header className="sticky top-0 z-30 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-white">
              {restaurant.name ||
                'Delivery'}
            </p>

            <p className="mt-0.5 text-[10px] font-black uppercase tracking-wider text-violet-400">
              Packer Portal ·{' '}
              {packer.name}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                loadPortal(
                  '',
                  true
                )
              }
              disabled={
                refreshing
              }
              className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-[10px] font-black text-neutral-300 disabled:opacity-50"
            >
              {refreshing
                ? 'Refreshing...'
                : 'Refresh'}
            </button>

            <button
              type="button"
              onClick={
                logout
              }
              className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-[10px] font-black text-neutral-300"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* CONTENT */}

      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-5">
        {/* QUEUE COUNTS */}

        <section className="min-w-0 rounded-3xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
          <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
            Live Packing Queue
          </p>

          <div className="mt-3 grid grid-cols-4 gap-2">
            {[
              [
                'Received',
                sections
                  .received
                  .length,
              ],

              [
                'Confirmed',
                sections
                  .confirmed
                  .length,
              ],

              [
                'Packed',
                sections
                  .packed
                  .length,
              ],

              [
                'On Road',
                sections
                  .out_for_delivery
                  .length,
              ],
            ].map(
              ([
                label,
                value,
              ]) => (
                <div
                  key={
                    label
                  }
                  className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3 text-center"
                >
                  <p className="text-lg font-black text-white">
                    {
                      value
                    }
                  </p>

                  <p className="mt-1 text-[8px] font-black uppercase text-neutral-500">
                    {
                      label
                    }
                  </p>
                </div>
              )
            )}
          </div>

          <p className="mt-3 text-[10px] text-neutral-500">
            Orders refresh
            automatically.
            Use Refresh for an
            immediate check.
          </p>
        </section>

        {/* SUCCESS */}

        {message && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs font-bold text-emerald-300">
            {message}
          </div>
        )}

        {/* ERROR */}

        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-300">
            {error}
          </div>
        )}

        {renderOrders(
          'New Orders',
          'Confirm incoming orders',
          sections.received
        )}

        {renderOrders(
          'Packing Queue',
          'Confirmed and preparing',
          sections.confirmed
        )}

        {renderOrders(
          'Ready to Dispatch',
          'Packed orders',
          sections.packed
        )}

        {renderOrders(
          'Out for Delivery',
          'Driver has left',
          sections.out_for_delivery
        )}
      </div>

      {/* CAMERA SCANNER */}

      {cameraOrderId && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/80 p-3 sm:items-center sm:p-6">
          <section className="w-full max-w-md overflow-hidden rounded-[28px] border border-neutral-800 bg-neutral-950 shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-neutral-800 px-4 py-4">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-violet-400">
                  Product
                  Verification
                </p>

                <h3 className="mt-1 text-base font-black text-white">
                  Scan one product
                  barcode
                </h3>
              </div>

              <button
                type="button"
                onClick={
                  closeCameraScanner
                }
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-lg font-black text-neutral-300"
                aria-label="Close barcode scanner"
              >
                ×
              </button>
            </div>

            <div className="p-4">
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-neutral-800 bg-black">
                <video
                  ref={
                    videoRef
                  }
                  muted
                  playsInline
                  className="h-full w-full object-cover"
                />

                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-28 w-[78%] rounded-2xl border-2 border-violet-400/90 shadow-[0_0_0_999px_rgba(0,0,0,0.32)]" />
                </div>

                {cameraStarting && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs font-black text-white">
                    Opening
                    Camera...
                  </div>
                )}
              </div>

              {cameraError ? (
                <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-3 text-[10px] font-bold leading-5 text-amber-300">
                  {
                    cameraError
                  }
                </div>
              ) : (
                <p className="mt-3 text-center text-[10px] leading-5 text-neutral-500">
                  Place one
                  product barcode
                  inside the
                  frame. One
                  camera opening
                  records only one
                  unit to prevent
                  duplicate scans.
                </p>
              )}

              <button
                type="button"
                onClick={
                  closeCameraScanner
                }
                className="mt-4 w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-xs font-black text-neutral-300"
              >
                Cancel Camera
                Scan
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}