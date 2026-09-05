'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function TableQRPage() {
  const params = useParams()
  const restaurantId = params.id
  const router = useRouter()

  const [restaurant, setRestaurant] = useState(null)
  const [tableNumber, setTableNumber] = useState(1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchRestaurantQRData() {
      if (!restaurantId) return

      const { data, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('id', restaurantId)
        .maybeSingle()

      if (error || !data) {
        alert('Unauthorized or restaurant not found.')
        router.push('/login')
        return
      }

      setRestaurant(data)
      setLoading(false)
    }

    fetchRestaurantQRData()
  }, [restaurantId, router])

  const handleTableChange = (val) => {
    const num = parseInt(val) || 1
    const currentPlan = restaurant?.plan || 'Starter'

    // Starter plan table limit check (Max 5 tables)
    if (currentPlan === 'Starter' && num > 5) {
      alert('🔒 Table Limit Reached! The Starter plan only supports up to 5 table QR codes. Please upgrade to Pro or Unlimited for unlimited tables.')
      setTableNumber(5)
      return
    }

    setTableNumber(num)
  }

  if (loading || !restaurant) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-white">
        <p className="text-xs font-bold text-neutral-400 animate-pulse uppercase tracking-wider">Loading QR Generator...</p>
      </div>
    )
  }

  const currentPlan = restaurant.plan || 'Starter'
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const menuUrl = `${baseUrl}/menu/${restaurant.id}?table=${tableNumber}`
  const qrCodeImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(menuUrl)}`

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6 font-sans">
      <div className="max-w-xl mx-auto space-y-6">
        
        <div className="flex justify-between items-center border-b border-neutral-800 pb-4">
          <div>
            <h1 className="text-xl font-black text-white">Table QR Codes</h1>
            <p className="text-xs text-neutral-400 mt-0.5"><strong className="text-orange-400">{restaurant.name}</strong> • <span className="uppercase text-amber-400 font-bold">{currentPlan} Plan</span></p>
          </div>
          <button 
            onClick={() => router.push(`/dashboard/${restaurant.id}`)}
            className="bg-neutral-800 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-neutral-700 transition border border-neutral-700"
          >
            ← Back to Dashboard
          </button>
        </div>

        {currentPlan === 'Starter' && (
          <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-2xl text-xs text-amber-300 text-center font-bold">
            ⚠️ Starter Plan Notice: Limited to Table 1 through Table 5. Upgrade to Pro for unlimited tables.
          </div>
        )}

        <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-3xl space-y-6 shadow-2xl text-center">
          <div>
            <label className="text-xs font-bold text-neutral-400 block mb-2 uppercase tracking-wider">Select Table Number</label>
            <input 
              type="number" 
              min="1" 
              max={currentPlan === 'Starter' ? 5 : 1000}
              value={tableNumber} 
              onChange={(e) => handleTableChange(e.target.value)}
              className="w-32 mx-auto bg-neutral-950 text-white font-black text-center text-2xl border border-neutral-800 rounded-2xl py-3 focus:outline-none focus:border-orange-500 shadow-inner"
            />
          </div>

          <div className="bg-white p-6 rounded-2xl inline-block shadow-lg border-4 border-neutral-800">
            <img src={qrCodeImageUrl} alt="Table QR Code" className="w-48 h-48 mx-auto" />
          </div>

          <div className="space-y-2 text-left">
            <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider text-center">Menu Link for Table {tableNumber}:</p>
            <div className="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800 text-orange-400 font-mono text-xs break-all text-center select-all">
              {menuUrl}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}