'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const DEFAULT_PERMISSIONS = {
  view_orders: true,
  manage_kitchen: true,
  manage_menu: true,
  manage_offers: true,
  view_sales: true,
  manage_waiters: true,
  manage_kitchen_staff: true,
}

const PERMISSION_LABELS = {
  view_orders: 'View Orders',
  manage_kitchen: 'Manage Kitchen',
  manage_menu: 'Manage Menu',
  manage_offers: 'Manage Offers',
  view_sales: 'View Sales',
  manage_waiters: 'Manage Waiters',
  manage_kitchen_staff: 'Manage Kitchen Staff',
}

/**
 * Reads the restaurant ID only in the browser.
 *
 * Supported URLs:
 * /dashboard/manager?restaurantId=YOUR_RESTAURANT_ID
 * /dashboard/manager?restaurant_id=YOUR_RESTAURANT_ID
 *
 * We do not use useSearchParams() because Next.js production builds
 * require a Suspense boundary around useSearchParams().
 */
function getRestaurantIdFromBrowser() {
  if (typeof window === 'undefined') {
    return null
  }

  const params = new URLSearchParams(window.location.search)

  return (
    params.get('restaurantId') ||
    params.get('restaurant_id') ||
    localStorage.getItem('restaurantId') ||
    localStorage.getItem('restaurant_id') ||
    localStorage.getItem('selectedRestaurantId')
  )
}

function normalizePermissions(permissions) {
  if (!permissions || typeof permissions !== 'object') {
    return { ...DEFAULT_PERMISSIONS }
  }

  return {
    ...DEFAULT_PERMISSIONS,
    ...permissions,
  }
}

export default function RestaurantManagerDashboard() {
  const router = useRouter()

  const [restaurantId, setRestaurantId] = useState(null)
  const [restaurant, setRestaurant] = useState(null)

  const [managerList, setManagerList] = useState([])
  const [loadingManagers, setLoadingManagers] = useState(true)
  const [loadingRestaurant, setLoadingRestaurant] = useState(true)

  const [managerName, setManagerName] = useState('')
  const [managerUserId, setManagerUserId] = useState('')
  const [managerPassword, setManagerPassword] = useState('')
  const [managerPermissions, setManagerPermissions] = useState({
    ...DEFAULT_PERMISSIONS,
  })

  const [addingManager, setAddingManager] = useState(false)
  const [updatingManagerId, setUpdatingManagerId] = useState(null)
  const [deletingManagerId, setDeletingManagerId] = useState(null)

  const [authChecked, setAuthChecked] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [pageError, setPageError] = useState('')

  const [showPassword, setShowPassword] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(true)

  /*
   * Resolve restaurant ID on the client.
   *
   * This replaces useSearchParams() and avoids the Next.js
   * missing Suspense boundary error during production builds.
   */
  useEffect(() => {
    const resolvedId = getRestaurantIdFromBrowser()

    if (resolvedId) {
      setRestaurantId(resolvedId)

      if (typeof window !== 'undefined') {
        localStorage.setItem('restaurantId', resolvedId)
      }
    } else {
      setPageError(
        'Restaurant ID is missing. Open this page using a restaurant-specific manager dashboard URL.'
      )
    }
  }, [])

  /*
   * Check the current Supabase session.
   *
   * Note:
   * If your application uses a custom staff login rather than Supabase Auth,
   * this session can be null. The page can still load, but database RLS
   * policies must allow the current database operation.
   */
  useEffect(() => {
    let mounted = true

    const checkAuth = async () => {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser()

        if (!mounted) return

        if (error) {
          console.warn('Supabase auth check:', error.message)
        }

        setCurrentUser(user || null)
        setAuthChecked(true)
      } catch (error) {
        console.warn('Supabase authentication check failed:', error)

        if (!mounted) return

        setCurrentUser(null)
        setAuthChecked(true)
      }
    }

    checkAuth()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return

      setCurrentUser(session?.user || null)
      setAuthChecked(true)
    })

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  }, [])

  /*
   * Fetch restaurant details.
   */
  const fetchRestaurant = useCallback(async () => {
    if (!restaurantId) return

    setLoadingRestaurant(true)

    const { data, error } = await supabase
      .from('restaurants')
      .select('*')
      .eq('id', restaurantId)
      .maybeSingle()

    if (error) {
      console.error('Failed to fetch restaurant:', error)
      setPageError(`Failed to load restaurant: ${error.message}`)
    } else {
      setRestaurant(data || null)

      if (!data) {
        setPageError('Restaurant details could not be found.')
      }
    }

    setLoadingRestaurant(false)
  }, [restaurantId])

  /*
   * Fetch all managers belonging to this restaurant.
   *
   * We intentionally do not order by created_at because some versions
   * of staff_users do not contain a created_at column.
   */
  const fetchManagers = useCallback(async () => {
    if (!restaurantId) return

    setLoadingManagers(true)

    const { data, error } = await supabase
      .from('staff_users')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('role', 'manager')
      .order('name', { ascending: true })

    if (error) {
      console.error('Failed to fetch managers:', error)
      setPageError(`Failed to load managers: ${error.message}`)
      setManagerList([])
    } else {
      setManagerList(data || [])
    }

    setLoadingManagers(false)
  }, [restaurantId])

  /*
   * Load restaurant and managers after authentication check
   * and restaurant ID resolution.
   */
  useEffect(() => {
    if (!authChecked || !restaurantId) return

    fetchRestaurant()
    fetchManagers()
  }, [authChecked, restaurantId, fetchRestaurant, fetchManagers])

  const handlePermissionChange = (permissionKey) => {
    setManagerPermissions((previous) => ({
      ...previous,
      [permissionKey]: !previous[permissionKey],
    }))
  }

  const resetManagerForm = () => {
    setManagerName('')
    setManagerUserId('')
    setManagerPassword('')
    setManagerPermissions({ ...DEFAULT_PERMISSIONS })
    setShowPassword(false)
  }

  /*
   * Create a manager account.
   */
  const handleCreateManager = async (event) => {
    event.preventDefault()

    setPageError('')

    const trimmedName = managerName.trim()
    const trimmedUserId = managerUserId.trim().toLowerCase()
    const trimmedPassword = managerPassword.trim()

    if (!restaurantId) {
      alert('Restaurant ID is missing.')
      return
    }

    if (!trimmedName || !trimmedUserId || !trimmedPassword) {
      alert('Please fill out all manager credentials.')
      return
    }

    if (trimmedName.length < 2) {
      alert('Manager name must contain at least 2 characters.')
      return
    }

    if (trimmedUserId.length < 3) {
      alert('Manager user ID must contain at least 3 characters.')
      return
    }

    if (trimmedPassword.length < 4) {
      alert('Manager password must contain at least 4 characters.')
      return
    }

    const existingManager = managerList.some(
      (manager) =>
        String(manager.user_id || '').toLowerCase() === trimmedUserId
    )

    if (existingManager) {
      alert('A manager with this user ID already exists.')
      return
    }

    setAddingManager(true)

    try {
      const newManager = {
        restaurant_id: restaurantId,
        name: trimmedName,
        user_id: trimmedUserId,
        password: trimmedPassword,
        pin: trimmedPassword,
        role: 'manager',
        is_active: true,
        permissions: managerPermissions,
        created_by: 'owner',
      }

      const { data, error } = await supabase
        .from('staff_users')
        .insert([newManager])
        .select('*')
        .single()

      if (error) {
        throw error
      }

      alert('Manager account created successfully!')

      setManagerList((previous) => [data, ...previous])
      resetManagerForm()
    } catch (error) {
      console.error('Failed to create manager:', error)

      alert(
        `Failed to create manager account: ${
          error?.message || 'Unknown error'
        }`
      )
    } finally {
      setAddingManager(false)
    }
  }

  /*
   * Activate or deactivate a manager.
   */
  const toggleManagerStatus = async (manager) => {
    if (!manager?.id) return

    const nextStatus = !Boolean(manager.is_active)

    setPageError('')
    setUpdatingManagerId(manager.id)

    try {
      const { error } = await supabase
        .from('staff_users')
        .update({
          is_active: nextStatus,
        })
        .eq('id', manager.id)
        .eq('restaurant_id', restaurantId)
        .eq('role', 'manager')

      if (error) {
        throw error
      }

      setManagerList((previous) =>
        previous.map((item) =>
          item.id === manager.id
            ? {
                ...item,
                is_active: nextStatus,
              }
            : item
        )
      )
    } catch (error) {
      console.error('Failed to update manager status:', error)

      alert(
        `Failed to update status: ${
          error?.message || 'Unknown error'
        }`
      )
    } finally {
      setUpdatingManagerId(null)
    }
  }

  /*
   * Delete a manager.
   */
  const handleDeleteManager = async (managerId, name) => {
    if (!managerId) return

    const confirmed = window.confirm(
      `Are you sure you want to remove manager "${
        name || 'this manager'
      }"?`
    )

    if (!confirmed) return

    setPageError('')
    setDeletingManagerId(managerId)

    try {
      const { error } = await supabase
        .from('staff_users')
        .delete()
        .eq('id', managerId)
        .eq('restaurant_id', restaurantId)
        .eq('role', 'manager')

      if (error) {
        throw error
      }

      setManagerList((previous) =>
        previous.filter((manager) => manager.id !== managerId)
      )
    } catch (error) {
      console.error('Failed to delete manager:', error)

      alert(
        `Failed to delete manager: ${
          error?.message || 'Unknown error'
        }`
      )
    } finally {
      setDeletingManagerId(null)
    }
  }

  const activeManagerCount = useMemo(
    () =>
      managerList.filter((manager) => Boolean(manager.is_active)).length,
    [managerList]
  )

  const inactiveManagerCount = managerList.length - activeManagerCount

  const handleBack = () => {
    router.back()
  }

  if (!authChecked || loadingRestaurant) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-cyan-400" />
          <p className="text-sm text-slate-300">
            Loading manager dashboard...
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-6 flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <button
              type="button"
              onClick={handleBack}
              className="mb-3 text-sm text-slate-400 transition hover:text-white"
            >
              ← Back
            </button>

            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Manager Accounts
            </h1>

            <p className="mt-1 text-sm text-slate-400">
              {restaurant?.name || 'Restaurant'} · Create and manage manager
              access
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-300">
              Owner Area
            </span>

            <button
              type="button"
              onClick={() => {
                fetchRestaurant()
                fetchManagers()
              }}
              className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              Refresh
            </button>
          </div>
        </header>

        {/* Error */}
        {pageError && (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            <div className="flex items-start justify-between gap-4">
              <p>{pageError}</p>

              <button
                type="button"
                onClick={() => setPageError('')}
                className="text-red-300 hover:text-white"
              >
                ×
              </button>
            </div>
          </div>
        )}

        {/* Summary cards */}
        <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">Total Managers</p>
            <p className="mt-2 text-3xl font-bold">{managerList.length}</p>
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
            <p className="text-sm text-emerald-300">Active Managers</p>
            <p className="mt-2 text-3xl font-bold text-emerald-200">
              {activeManagerCount}
            </p>
          </div>

          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
            <p className="text-sm text-amber-300">Inactive Managers</p>
            <p className="mt-2 text-3xl font-bold text-amber-200">
              {inactiveManagerCount}
            </p>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          {/* Create manager form */}
          <section className="h-fit rounded-2xl border border-slate-800 bg-slate-900 shadow-xl">
            <button
              type="button"
              onClick={() => setShowCreateForm((previous) => !previous)}
              className="flex w-full items-center justify-between border-b border-slate-800 p-5 text-left"
            >
              <div>
                <h2 className="text-lg font-semibold">
                  Create Manager Account
                </h2>

                <p className="mt-1 text-sm text-slate-400">
                  Add a manager for this restaurant
                </p>
              </div>

              <span className="text-xl text-slate-400">
                {showCreateForm ? '−' : '+'}
              </span>
            </button>

            {showCreateForm && (
              <form onSubmit={handleCreateManager} className="space-y-5 p-5">
                <div>
                  <label
                    htmlFor="managerName"
                    className="mb-2 block text-sm font-medium text-slate-300"
                  >
                    Manager Name
                  </label>

                  <input
                    id="managerName"
                    type="text"
                    value={managerName}
                    onChange={(event) => setManagerName(event.target.value)}
                    placeholder="Enter manager name"
                    maxLength={100}
                    autoComplete="name"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="managerUserId"
                    className="mb-2 block text-sm font-medium text-slate-300"
                  >
                    Manager User ID
                  </label>

                  <input
                    id="managerUserId"
                    type="text"
                    value={managerUserId}
                    onChange={(event) =>
                      setManagerUserId(event.target.value)
                    }
                    placeholder="Example: manager01"
                    maxLength={80}
                    autoComplete="username"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="managerPassword"
                    className="mb-2 block text-sm font-medium text-slate-300"
                  >
                    Manager Password / PIN
                  </label>

                  <div className="relative">
                    <input
                      id="managerPassword"
                      type={showPassword ? 'text' : 'password'}
                      value={managerPassword}
                      onChange={(event) =>
                        setManagerPassword(event.target.value)
                      }
                      placeholder="Enter password or PIN"
                      maxLength={100}
                      autoComplete="new-password"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 pr-20 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-500"
                    />

                    <button
                      type="button"
                      onClick={() =>
                        setShowPassword((previous) => !previous)
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-medium text-slate-200">
                        Manager Permissions
                      </h3>

                      <p className="mt-1 text-xs text-slate-500">
                        Choose what this manager can access.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setManagerPermissions({ ...DEFAULT_PERMISSIONS })
                      }
                      className="text-xs text-cyan-400 hover:text-cyan-300"
                    >
                      Reset
                    </button>
                  </div>

                  <div className="space-y-2">
                    {Object.entries(PERMISSION_LABELS).map(
                      ([permissionKey, label]) => (
                        <label
                          key={permissionKey}
                          className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2.5 transition hover:border-slate-700"
                        >
                          <span className="text-sm text-slate-300">
                            {label}
                          </span>

                          <input
                            type="checkbox"
                            checked={Boolean(
                              managerPermissions[permissionKey]
                            )}
                            onChange={() =>
                              handlePermissionChange(permissionKey)
                            }
                            className="h-4 w-4 accent-cyan-500"
                          />
                        </label>
                      )
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={addingManager}
                  className="flex w-full items-center justify-center rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {addingManager ? (
                    <>
                      <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" />
                      Creating...
                    </>
                  ) : (
                    'Create Manager Account'
                  )}
                </button>
              </form>
            )}
          </section>

          {/* Manager list */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900 shadow-xl">
            <div className="flex flex-col gap-3 border-b border-slate-800 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Existing Managers</h2>

                <p className="mt-1 text-sm text-slate-400">
                  Manage manager access and account status.
                </p>
              </div>

              <span className="w-fit rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                {managerList.length} account
                {managerList.length === 1 ? '' : 's'}
              </span>
            </div>

            {loadingManagers ? (
              <div className="flex items-center justify-center p-12">
                <div className="text-center">
                  <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-cyan-400" />
                  <p className="text-sm text-slate-400">
                    Loading managers...
                  </p>
                </div>
              </div>
            ) : managerList.length === 0 ? (
              <div className="p-10 text-center">
                <div className="mb-3 text-4xl">👤</div>

                <h3 className="text-base font-semibold text-slate-200">
                  No managers found
                </h3>

                <p className="mt-2 text-sm text-slate-500">
                  Create the first manager account using the form.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800">
                {managerList.map((manager) => {
                  const isActive = Boolean(manager.is_active)
                  const permissions = normalizePermissions(
                    manager.permissions
                  )

                  return (
                    <article
                      key={manager.id}
                      className="p-5 transition hover:bg-slate-800/30"
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-lg font-bold text-cyan-300">
                            {(manager.name || 'M')
                              .charAt(0)
                              .toUpperCase()}
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="truncate text-base font-semibold text-white">
                                {manager.name || 'Unnamed Manager'}
                              </h3>

                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                  isActive
                                    ? 'bg-emerald-500/15 text-emerald-300'
                                    : 'bg-red-500/15 text-red-300'
                                }`}
                              >
                                {isActive ? 'Active' : 'Inactive'}
                              </span>
                            </div>

                            <p className="mt-1 break-all text-sm text-slate-400">
                              User ID: {manager.user_id || 'Not available'}
                            </p>

                            <p className="mt-1 text-xs text-slate-500">
                              Role: {manager.role || 'manager'}
                            </p>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => toggleManagerStatus(manager)}
                            disabled={updatingManagerId === manager.id}
                            className={`rounded-lg px-3 py-2 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              isActive
                                ? 'border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                                : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                            }`}
                          >
                            {updatingManagerId === manager.id
                              ? 'Updating...'
                              : isActive
                                ? 'Deactivate'
                                : 'Activate'}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleDeleteManager(
                                manager.id,
                                manager.name
                              )
                            }
                            disabled={deletingManagerId === manager.id}
                            className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {deletingManagerId === manager.id
                              ? 'Deleting...'
                              : 'Delete'}
                          </button>
                        </div>
                      </div>

                      <div className="mt-4">
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                          Permissions
                        </p>

                        <div className="flex flex-wrap gap-2">
                          {Object.entries(PERMISSION_LABELS)
                            .filter(
                              ([permissionKey]) =>
                                permissions[permissionKey]
                            )
                            .map(([, label]) => (
                              <span
                                key={label}
                                className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-300"
                              >
                                {label}
                              </span>
                            ))}

                          {!Object.entries(PERMISSION_LABELS).some(
                            ([permissionKey]) =>
                              permissions[permissionKey]
                          ) && (
                            <span className="text-xs text-slate-500">
                              No permissions assigned
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </div>

        {/* Footer note */}
        <footer className="mt-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-5 text-amber-200/80">
          <strong className="text-amber-200">Security note:</strong>{' '}
          Manager passwords are currently stored according to your existing
          `staff_users` structure. For production, manager authentication
          should use Supabase Auth or a secure server-side authentication
          route with hashed passwords. Never expose a Supabase service-role
          key in client-side code.
        </footer>
      </div>
    </main>
  )
}