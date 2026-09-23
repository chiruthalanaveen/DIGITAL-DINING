'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function TableQRPage() {
  const params = useParams()
  const restaurantId = String(params?.id || '').trim()
  const router = useRouter()

  const [restaurant, setRestaurant] = useState(null)
  const [tableNumber, setTableNumber] = useState(1)
  const [registeredTables, setRegisteredTables] = useState([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)

  // ============================================================
  // LOAD REGISTERED TABLES
  // ============================================================

  const loadTables = useCallback(async () => {
    if (!restaurantId) return []

    const { data, error } = await supabase.rpc('get_owner_registered_tables', {
      p_restaurant_id: restaurantId,
    })

    if (error) {
      throw new Error(error.message || 'Unable to load registered tables.')
    }

    const rows = Array.isArray(data) ? data : []
    setRegisteredTables(rows)
    return rows
  }, [restaurantId])

  // ============================================================
  // VERIFY OWNER + LOAD RESTAURANT
  // ============================================================

  useEffect(() => {
    let cancelled = false

    async function fetchRestaurantQRData() {
      if (!restaurantId) {
        router.replace('/login')
        return
      }

      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser()

        if (authError || !user) {
          router.replace('/login')
          return
        }

        const { data, error } = await supabase
          .from('restaurants')
          .select('*')
          .eq('id', restaurantId)
          .eq('owner_id', user.id)
          .maybeSingle()

        if (error || !data) {
          console.error('Restaurant QR authorization error:', error)

          if (!cancelled) {
            alert('Unauthorized or restaurant not found.')
            router.replace('/login')
          }

          return
        }

        if (!cancelled) {
          setRestaurant(data)
        }

        await loadTables()
      } catch (error) {
        console.error('QR page loading error:', error)

        if (!cancelled) {
          alert('Unable to load the Table QR page.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchRestaurantQRData()

    return () => {
      cancelled = true
    }
  }, [restaurantId, router, loadTables])

  // ============================================================
  // TABLE NUMBER
  // ============================================================

  const handleTableChange = (value) => {
    let number = parseInt(value, 10)

    if (!Number.isFinite(number) || number < 1) {
      number = 1
    }

    const currentPlan = restaurant?.plan || 'Starter'

    if (currentPlan === 'Starter' && number > 5) {
      alert(
        '🔒 Table Limit Reached! The Starter plan only supports up to 5 table QR codes. Please upgrade to Pro or Unlimited for unlimited tables.'
      )

      setTableNumber(5)
      return
    }

    const maximum = currentPlan === 'Starter' ? 5 : 1000

    setTableNumber(Math.min(number, maximum))
  }

  // ============================================================
  // REGISTER TABLE
  //
  // IMPORTANT:
  // We intentionally do NOT use:
  //
  // upsert(..., {
  //   onConflict: 'restaurant_id,table_number'
  // })
  //
  // Instead:
  // 1. Verify owner
  // 2. Check whether table already exists
  // 3. Insert only if missing
  //
  // This avoids ON CONFLICT constraint errors.
  // ============================================================

  const registerCurrentTable = async () => {
    const cleanTableNumber = Number(tableNumber)

    if (!restaurantId) {
      throw new Error('Restaurant ID is missing.')
    }

    if (!Number.isInteger(cleanTableNumber) || cleanTableNumber < 1) {
      throw new Error('Invalid table number.')
    }

    const { data, error } = await supabase.rpc('register_table_qr', {
      p_restaurant_id: restaurantId,
      p_table_number: cleanTableNumber,
    })

    if (error) {
      throw new Error(error.message || 'Unable to register this table.')
    }

    await loadTables()
    return data
  }

  // ============================================================
  // DOWNLOAD QR
  // ============================================================

  const handleDownload = async () => {
    if (downloading) return

    if (!restaurant) {
      alert('Restaurant information is not available.')
      return
    }

    setDownloading(true)

    try {
      // Register table first.
      await registerCurrentTable()

      // Generate QR URL locally here as well.
      // This avoids depending on a variable declared later
      // in the render section.
      const origin = window.location.origin

      const downloadMenuUrl =
        `${origin}/menu/${restaurant.id}` +
        `?table=${encodeURIComponent(tableNumber)}`

      const downloadQrUrl =
        'https://api.qrserver.com/v1/create-qr-code/' +
        `?size=500x500&data=${encodeURIComponent(downloadMenuUrl)}`

      const response = await fetch(downloadQrUrl)

      if (!response.ok) {
        throw new Error(
          `QR service returned HTTP ${response.status}.`
        )
      }

      const blob = await response.blob()

      if (!blob || blob.size === 0) {
        throw new Error(
          'The QR service returned an empty image.'
        )
      }

      const objectUrl = URL.createObjectURL(blob)

      try {
        const restaurantName = String(
          restaurant?.name || 'restaurant'
        )
          .replace(/[^a-z0-9]+/gi, '-')
          .replace(/^-+|-+$/g, '')
          .toLowerCase()

        const anchor = document.createElement('a')

        anchor.href = objectUrl

        anchor.download =
          `${restaurantName || 'restaurant'}` +
          `-table-${tableNumber}-qr.png`

        document.body.appendChild(anchor)

        anchor.click()

        anchor.remove()
      } finally {
        // Small delay prevents browsers from revoking the
        // object URL before the download starts.
        window.setTimeout(() => {
          URL.revokeObjectURL(objectUrl)
        }, 1000)
      }

      // Reload so total immediately reflects the registered QR.
      await loadTables()
    } catch (error) {
      console.error(
        'Table QR download error:',
        error
      )

      alert(
        `Unable to download Table ${tableNumber} QR: ${
          error?.message || 'Please try again.'
        }`
      )
    } finally {
      setDownloading(false)
    }
  }

  // ============================================================
  // LOADING
  // ============================================================

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-white">
        <p className="text-xs font-bold text-neutral-400 animate-pulse uppercase tracking-wider">
          Loading QR Generator...
        </p>
      </div>
    )
  }

  if (!restaurant) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-white p-6">
        <div className="text-center">
          <p className="font-black">
            Restaurant could not be loaded.
          </p>

          <button
            type="button"
            onClick={() => router.replace('/login')}
            className="mt-4 bg-orange-500 hover:bg-orange-600 px-5 py-3 rounded-xl text-xs font-black"
          >
            Return to Login
          </button>
        </div>
      </div>
    )
  }

  // ============================================================
  // QR INFORMATION
  // ============================================================

  const currentPlan =
    restaurant.plan || 'Starter'

  const baseUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : ''

  const menuUrl =
    `${baseUrl}/menu/${restaurant.id}` +
    `?table=${encodeURIComponent(tableNumber)}`

  const qrCodeImageUrl =
    'https://api.qrserver.com/v1/create-qr-code/' +
    `?size=250x250&data=${encodeURIComponent(menuUrl)}`

  const isRegistered =
    registeredTables.some(
      (table) =>
        String(table?.table_number) ===
        String(tableNumber)
    )

  // ============================================================
  // UI
  // ============================================================

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6 font-sans">
      <div className="max-w-xl mx-auto space-y-6">

        {/* Header */}

        <div className="flex justify-between items-center gap-4 border-b border-neutral-800 pb-4">
          <div>
            <h1 className="text-xl font-black text-white">
              Table QR Codes
            </h1>

            <p className="text-xs text-neutral-400 mt-0.5">
              <strong className="text-orange-400">
                {restaurant.name}
              </strong>

              {' • '}

              <span className="uppercase text-amber-400 font-bold">
                {currentPlan} Plan
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              router.push(
                `/dashboard/${restaurant.id}`
              )
            }
            className="bg-neutral-800 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-neutral-700 transition border border-neutral-700"
          >
            ← Back to Dashboard
          </button>
        </div>

        {/* Starter warning */}

        {currentPlan === 'Starter' && (
          <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-2xl text-xs text-amber-300 text-center font-bold">
            ⚠️ Starter Plan Notice: Limited to
            Table 1 through Table 5. Upgrade to Pro
            for unlimited tables.
          </div>
        )}

        {/* Registered count */}

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 text-center">
          <p className="text-[10px] uppercase text-neutral-500 font-black">
            Registered Table QR Codes
          </p>

          <p className="text-3xl font-black text-white mt-1">
            {registeredTables.length}
          </p>

          <p className="text-[10px] text-neutral-500 mt-1">
            Only registered/downloaded table QR
            codes count as restaurant tables.
          </p>
        </div>

        {/* QR generator */}

        <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-3xl space-y-6 shadow-2xl text-center">

          <div>
            <label className="text-xs font-bold text-neutral-400 block mb-2 uppercase tracking-wider">
              Select Table Number
            </label>

            <input
              type="number"
              min="1"
              max={
                currentPlan === 'Starter'
                  ? 5
                  : 1000
              }
              value={tableNumber}
              onChange={(event) =>
                handleTableChange(
                  event.target.value
                )
              }
              className="w-32 mx-auto bg-neutral-950 text-white font-black text-center text-2xl border border-neutral-800 rounded-2xl py-3 focus:outline-none focus:border-orange-500 shadow-inner"
            />
          </div>

          {/* QR Preview */}

          <div className="bg-white p-6 rounded-2xl inline-block shadow-lg border-4 border-neutral-800">
            <img
              src={qrCodeImageUrl}
              alt={`Table ${tableNumber} QR Code`}
              className="w-48 h-48 mx-auto"
            />
          </div>

          {/* URL */}

          <div className="space-y-2 text-left">
            <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider text-center">
              Menu Link for Table {tableNumber}:
            </p>

            <div className="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800 text-orange-400 font-mono text-xs break-all text-center select-all">
              {menuUrl}
            </div>
          </div>

          {/* Download */}

          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black py-3.5 rounded-2xl text-sm transition"
          >
            {downloading
              ? 'Registering & Downloading...'
              : isRegistered
                ? `⬇️ Download Table ${tableNumber} QR Again`
                : `⬇️ Register & Download Table ${tableNumber} QR`}
          </button>

          {isRegistered && (
            <p className="text-xs font-bold text-emerald-400">
              ✓ Table {tableNumber} is included
              in your total table count.
            </p>
          )}
        </div>

        {/* Registered tables */}

        {registeredTables.length > 0 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="font-black text-white">
                  Registered Tables
                </h2>

                <p className="text-[10px] text-neutral-500 mt-1">
                  These tables are included in the
                  Owner and Manager table totals.
                </p>
              </div>

              <div className="bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-xl px-3 py-2 text-xs font-black">
                {registeredTables.length}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {registeredTables.map(
                (table, index) => (
                  <button
                    key={
                      table?.id ||
                      `${table?.table_number}-${index}`
                    }
                    type="button"
                    onClick={() =>
                      setTableNumber(
                        Number(
                          table?.table_number
                        ) || 1
                      )
                    }
                    className="bg-neutral-950 border border-neutral-800 hover:border-orange-500 text-neutral-300 hover:text-orange-400 px-3 py-2 rounded-xl text-xs font-black transition"
                  >
                    Table {table?.table_number}
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}