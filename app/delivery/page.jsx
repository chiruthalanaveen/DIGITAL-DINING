'use client'







import { useEffect, useMemo, useRef, useState } from 'react'



import { useRouter } from 'next/navigation'



import { supabase } from '@/lib/supabase'







const CATEGORIES = [



  { key: 'food', icon: '🍔', label: 'Food' },



  { key: 'groceries', icon: '🛒', label: 'Groceries' },



  { key: 'fruits', icon: '🍎', label: 'Fruits & Veg' },



]







function formatDistance(value) {



  const distance = Number(value)



  if (!Number.isFinite(distance)) return ''



  if (distance < 1) return `${Math.max(1, Math.round(distance * 1000))} m away`



  return `${distance.toFixed(2)} km away`



}







export default function DeliveryCustomerHome() {



  const router = useRouter()



  const searchRef = useRef(null)







  const [loading, setLoading] = useState(false)



  const [locationError, setLocationError] = useState('')



  const [stores, setStores] = useState([])



  const [searched, setSearched] = useState(false)



  const [openingStore, setOpeningStore] = useState('')



  const [search, setSearch] = useState('')



  const [activeCategory, setActiveCategory] = useState('all')
  const [customerUser, setCustomerUser] = useState(null)
  const [customerProfile, setCustomerProfile] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [accountOpen, setAccountOpen] = useState(false)







  useEffect(() => {
    let active = true

    async function syncCustomer(session) {
      const user = session?.user || null
      if (!active) return
      setCustomerUser(user)

      if (!user) {
        setCustomerProfile(null)
        setAuthLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('delivery_customer_profiles')
        .select('id, full_name, email, phone, avatar_url')
        .eq('id', user.id)
        .maybeSingle()

      if (!active) return
      if (error) {
        console.error('Delivery customer profile load error:', error)
        setCustomerProfile(null)
      } else {
        setCustomerProfile(data || null)
      }
      setAuthLoading(false)
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) {
        console.error('Delivery customer session error:', error)
        setAuthLoading(false)
        return
      }
      syncCustomer(data?.session || null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => syncCustomer(session)
    )

    return () => {
      active = false
      subscription?.unsubscribe()
    }
  }, [])

  async function signOutCustomer() {
    try {
      setAuthLoading(true)
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      setAccountOpen(false)
      setCustomerUser(null)
      setCustomerProfile(null)
      router.replace('/delivery')
    } catch (error) {
      console.error('Delivery sign out error:', error)
      setLocationError(error?.message || 'Unable to sign out. Please try again.')
    } finally {
      setAuthLoading(false)
    }
  }

  function openAccount() {
    if (authLoading) return
    if (!customerUser) {
      router.push('/delivery/login?next=%2Fdelivery')
      return
    }
    setAccountOpen(true)
  }

  const filteredStores = useMemo(() => {



    const query = search.trim().toLowerCase()



    if (!query) return stores







    return stores.filter((store) => {



      const name = String(store?.name || '').toLowerCase()



      const code = String(store?.restaurantCode || '').toLowerCase()



      return name.includes(query) || code.includes(query)



    })



  }, [search, stores])







  function openStore(store) {



    const restaurantCode = String(store?.restaurantCode || '').trim()







    if (!restaurantCode) {



      setLocationError('This store is not configured correctly.')



      return



    }







    setOpeningStore(restaurantCode)



    router.push(`/delivery/${encodeURIComponent(restaurantCode)}`)



  }







  async function findNearbyStores(latitude, longitude) {



    const { data, error } = await supabase.rpc('get_nearby_delivery_stores', {



      p_latitude: latitude,



      p_longitude: longitude,



    })







    if (error) throw error



    if (!data?.success) {



      throw new Error(data?.message || 'Unable to find nearby stores.')



    }







    const nearbyStores = Array.isArray(data?.stores) ? data.stores : []







    // If exactly one store can deliver to this location, open it directly.



    // If there are multiple stores, keep the customer on this page to choose.



    if (nearbyStores.length === 1) {



      const restaurantCode = String(



        nearbyStores[0]?.restaurantCode || ''



      ).trim()







      if (!restaurantCode) {



        throw new Error('The nearby store is not configured correctly.')



      }







      setStores(nearbyStores)



      setSearched(true)



      setOpeningStore(restaurantCode)







      router.push(



        `/delivery/${encodeURIComponent(restaurantCode)}`



      )



      return



    }







    setStores(nearbyStores)



    setSearched(true)



  }







  function useCurrentLocation() {



    if (loading) return







    setLocationError('')



    setSearched(false)







    if (typeof navigator === 'undefined' || !navigator.geolocation) {



      setLocationError('Location is not supported on this device or browser.')



      return



    }







    setLoading(true)







    navigator.geolocation.getCurrentPosition(



      async (position) => {



        try {



          const latitude = Number(position.coords.latitude)



          const longitude = Number(position.coords.longitude)







          if (



            !Number.isFinite(latitude) ||



            latitude < -90 ||



            latitude > 90 ||



            !Number.isFinite(longitude) ||



            longitude < -180 ||



            longitude > 180



          ) {



            throw new Error('Your current location could not be read correctly.')



          }







          await findNearbyStores(latitude, longitude)



        } catch (error) {



          console.error('Delivery store discovery error:', error)



          setStores([])



          setSearched(true)



          setLocationError(error?.message || 'Unable to find delivery stores near you.')



        } finally {



          setLoading(false)



        }



      },



      (error) => {



        console.error('Delivery location error:', error)



        setLoading(false)







        if (error?.code === 1) {



          setLocationError('Location permission was denied. Please allow location access and try again.')



        } else if (error?.code === 2) {



          setLocationError('Your location is unavailable. Turn on GPS/location services and try again.')



        } else if (error?.code === 3) {



          setLocationError('Location request timed out. Please try again.')



        } else {



          setLocationError('Unable to get your current location. Please try again.')



        }



      },



      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }



    )



  }







  function focusSearch() {



    searchRef.current?.focus()



    searchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })



  }







  return (



    <main className="min-h-screen bg-[#f7f8fa] pb-24 text-slate-950">



      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur">



        <div className="mx-auto max-w-5xl px-4 pb-3 pt-3">



          <div className="flex items-center justify-between gap-3">



            <button type="button" onClick={useCurrentLocation} className="min-w-0 text-left">



              <p className="text-base font-black tracking-tight">DIGITAL DINE</p>



              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">



                Delivering to



              </p>



              <div className="mt-1 flex items-center gap-1.5">



                <span>📍</span>



                <span className="truncate text-sm font-extrabold">



                  {loading ? 'Finding your location...' : searched ? 'Current Location' : 'Choose Current Location'}



                </span>



                <span className="text-[10px] text-slate-400">▼</span>



              </div>



            </button>







            <div className="flex shrink-0 items-center gap-2">








              <button type="button" onClick={openAccount} aria-label={customerUser ? 'Open account' : 'Sign in'} className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white text-lg shadow-sm">








                {customerProfile?.avatar_url ? (








                  <img src={customerProfile.avatar_url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />








                ) : (








                  <span aria-hidden="true">{customerUser ? '👤' : '🔐'}</span>








                )}








              </button>








              <button type="button" aria-label="Cart" className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-xl shadow-sm">🛒</button>








            </div>



          </div>







          <div className="mt-3 flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">



            <span className="text-lg">🔍</span>



            <input



              ref={searchRef}



              value={search}



              onChange={(event) => setSearch(event.target.value)}



              placeholder="Search food, groceries..."



              className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-slate-400"



            />



            {search ? (



              <button type="button" onClick={() => setSearch('')} className="text-xs font-bold text-slate-400">



                Clear



              </button>



            ) : null}



          </div>



        </div>



      </header>







      <div className="mx-auto max-w-5xl px-4">



        <section className="pt-5">



          <div className="relative overflow-hidden rounded-[28px] bg-slate-950 p-6 text-white shadow-lg">



            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-400/20" />



            <div className="absolute -bottom-12 right-12 h-28 w-28 rounded-full bg-cyan-400/10" />



            <p className="relative text-[10px] font-black uppercase tracking-[0.22em] text-emerald-300">



              Delivery Offers



            </p>



            <h1 className="relative mt-2 max-w-xs text-3xl font-black leading-tight">



              Fast delivery near you



            </h1>



            <p className="relative mt-2 max-w-sm text-sm leading-6 text-slate-300">



              Food, groceries and fresh produce from stores serving your location.



            </p>



            <button



              type="button"



              onClick={useCurrentLocation}



              disabled={loading}



              className="relative mt-5 rounded-2xl bg-emerald-400 px-5 py-3 text-sm font-black text-slate-950 disabled:opacity-60"



            >



              {loading ? 'Finding stores...' : searched ? 'Refresh nearby stores' : 'Find stores near me'}



            </button>



          </div>



        </section>







        <section className="pt-7">



          <h2 className="text-xl font-black">What are you looking for?</h2>



          <div className="mt-4 grid grid-cols-3 gap-3">



            {CATEGORIES.map((category) => {



              const active = activeCategory === category.key



              return (



                <button



                  key={category.key}



                  type="button"



                  onClick={() => setActiveCategory(active ? 'all' : category.key)}



                  className={`rounded-3xl border p-3 text-center transition ${



                    active ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white'



                  }`}



                >



                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl">



                    {category.icon}



                  </span>



                  <span className="mt-2 block text-xs font-black sm:text-sm">{category.label}</span>



                </button>



              )



            })}



          </div>



        </section>







        {locationError ? (



          <section className="pt-5">



            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">



              <p className="text-sm font-bold text-red-700">{locationError}</p>



              <button type="button" onClick={useCurrentLocation} className="mt-3 rounded-xl bg-white px-4 py-2 text-xs font-black text-red-700 shadow-sm">



                Try Again



              </button>



            </div>



          </section>



        ) : null}







        {!searched && !locationError ? (



          <section className="pt-7">



            <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">



              <div className="flex gap-4">



                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-xl">📍</div>



                <div>



                  <h2 className="font-black">Find stores near you</h2>



                  <p className="mt-1 text-sm leading-6 text-slate-500">



                    Allow location access to show only stores that can deliver to you.



                  </p>



                </div>



              </div>



              <button type="button" onClick={useCurrentLocation} disabled={loading} className="mt-5 w-full rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-black text-white disabled:opacity-60">



                {loading ? 'Checking location...' : 'Use My Current Location'}



              </button>



            </div>



          </section>



        ) : null}







        {searched && !loading && !locationError ? (



          <section className="pt-8">



            <div className="flex items-end justify-between gap-3">



              <div>



                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">



                  {stores.length ? `${stores.length} available` : 'Your area'}



                </p>



                <h2 className="mt-1 text-2xl font-black">Stores near you</h2>



              </div>



              <button type="button" onClick={useCurrentLocation} className="text-xs font-black text-emerald-700">



                Refresh



              </button>



            </div>







            {stores.length === 0 ? (



              <div className="mt-4 rounded-[28px] border border-slate-200 bg-white p-7 text-center shadow-sm">



                <div className="text-5xl">🏪</div>



                <h3 className="mt-4 text-xl font-black">Delivery isn't available here yet</h3>



                <p className="mt-2 text-sm leading-6 text-slate-500">



                  No delivery store currently covers your location.



                </p>



              </div>



            ) : filteredStores.length === 0 ? (



              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-center text-sm font-semibold text-slate-500">



                No nearby store matches “{search}”.



              </div>



            ) : (



              <div className="mt-4 space-y-4">



                {filteredStores.map((store) => {



                  const code = String(store?.restaurantCode || '')



                  const opening = openingStore === code



                  const originalIndex = stores.findIndex(



                    (item) => String(item?.restaurantId || item?.restaurantCode || '') === String(store?.restaurantId || store?.restaurantCode || '')



                  )







                  return (



                    <article key={store?.restaurantId || code} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">



                      <div className="flex items-start gap-4">



                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-3xl">🏪</div>



                        <div className="min-w-0 flex-1">



                          <div className="flex flex-wrap items-center gap-2">



                            <h3 className="truncate text-lg font-black">{store?.name || 'Delivery Store'}</h3>



                            {originalIndex === 0 ? (



                              <span className="rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-700">



                                Nearest



                              </span>



                            ) : null}



                          </div>



                          <p className="mt-1 text-sm font-bold text-slate-600">{formatDistance(store?.distanceKm)}</p>



                          <p className="mt-1 text-xs font-semibold text-emerald-600">Delivery available</p>



                        </div>



                      </div>



                      <button



                        type="button"



                        disabled={Boolean(openingStore)}



                        onClick={() => openStore(store)}



                        className="mt-4 w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-60"



                      >



                        {opening ? 'Opening Store...' : 'Shop Now'}



                      </button>



                    </article>



                  )



                })}



              </div>



            )}



          </section>



        ) : null}



      </div>







      {accountOpen && customerUser ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-4">
          <button type="button" aria-label="Close account" onClick={() => setAccountOpen(false)} className="absolute inset-0" />
          <section className="relative z-10 w-full max-w-md rounded-t-[30px] bg-white p-5 shadow-2xl sm:rounded-[30px]">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-emerald-50 text-2xl">
                {customerProfile?.avatar_url ? (
                  <img src={customerProfile.avatar_url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                ) : '👤'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-600">Delivery Account</p>
                <h2 className="mt-1 truncate text-xl font-black">
                  {customerProfile?.full_name || customerUser?.user_metadata?.full_name || customerUser?.email?.split('@')?.[0] || 'Customer'}
                </h2>
                <p className="mt-1 truncate text-xs font-semibold text-slate-500">{customerProfile?.email || customerUser?.email || ''}</p>
              </div>
              <button type="button" onClick={() => setAccountOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-xs font-black text-slate-600">✕</button>
            </div>
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-black">My Orders</p>
              <p className="mt-1 text-[10px] leading-5 text-slate-500">
                Your Google delivery account is connected. Customer order history will be connected to this account in the next step.
              </p>
            </div>
            <button type="button" onClick={signOutCustomer} disabled={authLoading} className="mt-4 w-full rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm font-black text-red-700 disabled:opacity-50">
              {authLoading ? 'Signing Out...' : 'Sign Out'}
            </button>
          </section>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur">



        <div className="mx-auto grid max-w-md grid-cols-4 px-4 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2">



          <button type="button" className="flex flex-col items-center gap-1 py-1 text-emerald-700">



            <span className="text-xl">🏠</span>



            <span className="text-[10px] font-black">Home</span>



          </button>



          <button type="button" onClick={focusSearch} className="flex flex-col items-center gap-1 py-1 text-slate-400">



            <span className="text-xl">🔎</span>



            <span className="text-[10px] font-black">Search</span>



          </button>



          <button type="button" onClick={() => customerUser ? setAccountOpen(true) : router.push('/delivery/login?next=%2Fdelivery')} className="flex flex-col items-center gap-1 py-1 text-slate-400">
            <span className="text-xl">📦</span>
            <span className="text-[10px] font-black">Orders</span>
          </button>
          <button type="button" onClick={openAccount} className="flex flex-col items-center gap-1 py-1 text-slate-400">
            <span className="text-xl">{customerUser ? '👤' : '🔐'}</span>
            <span className="text-[10px] font-black">{customerUser ? 'Account' : 'Sign In'}</span>
          </button>



        </div>



      </nav>



    </main>



  )



}
