'use client'

// Separate owner-only delivery poster designer.
// Exact destination: app/dashboard/[id]/delivery-qr/page.jsx
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import OwnerQRPosterDesigner from '@/app/components/OwnerQRPosterDesigner'

const DELIVERY_PLANS = ['delivery', 'restaurant_delivery', 'restaurant_resort_delivery']
const CODE = /^[A-Za-z0-9_-]{1,80}$/

export default function DeliveryQRPage() {
  const params = useParams()
  const restaurantId = String(params?.id || '')
  const router = useRouter()
  const [restaurant, setRestaurant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [baseUrl, setBaseUrl] = useState('')

  useEffect(() => {
    let active = true
    setBaseUrl(window.location.origin)
    const load = async () => {
      try {
        const { data, error: authError } = await supabase.auth.getUser()
        if (authError || !data?.user?.id) { router.replace('/login'); return }
        const { data: row, error: queryError } = await supabase.from('restaurants').select('*')
          .eq('id', restaurantId).eq('owner_id', data.user.id).maybeSingle()
        if (queryError || !row) throw new Error('Only this restaurant’s verified owner may generate its Delivery QR.')
        if (!DELIVERY_PLANS.includes(String(row.plan_code || ''))) throw new Error('This restaurant does not have an eligible Delivery plan.')
        if (!CODE.test(String(row.restaurant_code || ''))) throw new Error('The Delivery store code has not been configured.')
        if (active) setRestaurant(row)
      } catch (caught) { if (active) setError(caught?.message || 'Unable to load Delivery QR.') }
      finally { if (active) setLoading(false) }
    }
    void load()
    return () => { active = false }
  }, [restaurantId, router])

  // QR opens the store INSIDE the main /delivery app. Auth/login is handled by that app.
  const deliveryUrl = restaurant && baseUrl ? `${baseUrl}/delivery?store=${encodeURIComponent(restaurant.restaurant_code)}` : ''
  return <main className="min-h-screen bg-[#f5f8fb] px-3 py-5 text-[#182538] sm:px-6 sm:py-8">
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-[#142c26] px-5 py-5 text-white sm:px-7"><div><p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-300">DIGITAL DINE-IN / OWNER TOOLS</p><h1 className="mt-1 text-2xl font-black sm:text-3xl">Delivery Store QR Studio</h1><p className="mt-1 text-xs text-emerald-100/70">Editable counter posters that open your store inside the Delivery app</p></div><button type="button" onClick={() => router.push(`/dashboard/${restaurantId}`)} className="rounded-xl border border-white/20 px-4 py-3 text-xs font-black text-white hover:bg-white/10">← Back to Dashboard</button></header>
      {loading ? <div className="rounded-3xl bg-white p-10 text-center text-sm font-bold text-slate-500" role="status">Verifying your owner account…</div>
        : error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-bold text-rose-700" role="alert">{error}</div>
        : restaurant && <><div className="rounded-3xl border border-slate-200 bg-white p-4 sm:p-5"><h2 className="text-lg font-black">{restaurant.name}</h2><p className="mt-1 text-xs text-slate-500">Delivery store code: {restaurant.restaurant_code} · This is not a table QR and does not register a new restaurant table.</p></div><OwnerQRPosterDesigner type="delivery" restaurantName={restaurant.name} url={deliveryUrl}/></>}
    </div>
  </main>
}