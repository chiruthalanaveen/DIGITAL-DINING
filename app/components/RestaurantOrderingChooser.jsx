'use client'
import { useState } from 'react'
import { getFreshDineInProof } from '@/lib/client/restaurantLocation'
import { distanceMeters } from '@/lib/client/restaurantDistance'
export default function RestaurantOrderingChooser({ options, orderType, onRestaurantMode, onDelivery, issue = '' }) {
  const [locationStatus, setLocationStatus] = useState('')
  const [checking, setChecking] = useState(false)
  const checkLocation = async () => {
    setChecking(true)
    try {
      const proof = await getFreshDineInProof()
      if (options?.geofenceEnabled && options.originLatitude != null && options.originLongitude != null) {
        const distance = distanceMeters(proof.latitude, proof.longitude, Number(options.originLatitude), Number(options.originLongitude))
        const allowed = proof.locationAccuracy <= Number(options.maxAccuracyMeters) &&
          distance + proof.locationAccuracy <= Number(options.radiusMeters)
        setLocationStatus(allowed ? 'Location looks eligible. We will verify again at checkout.' : 'Outside or uncertain location. Please choose Home Delivery or Takeaway.')
      } else setLocationStatus('Location received. Final verification happens at checkout.')
    } catch (error) { setLocationStatus(error.message) }
    finally { setChecking(false) }
  }
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm" aria-label="Choose order type">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {options?.dineInEnabled !== false && <button type="button" onClick={() => onRestaurantMode('dine-in')}
          aria-pressed={orderType === 'dine-in'} className={`rounded-2xl px-3 py-3 text-xs font-bold ${orderType === 'dine-in' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>🍽 Dine-In</button>}
        {options?.takeawayEnabled !== false && <button type="button" onClick={() => onRestaurantMode('parcel')}
          aria-pressed={orderType === 'parcel'} className={`rounded-2xl px-3 py-3 text-xs font-bold ${orderType === 'parcel' ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-700'}`}>🥡 Takeaway</button>}
        {options?.homeDeliveryAvailable && <button type="button" onClick={onDelivery}
          className="col-span-2 rounded-2xl bg-emerald-600 px-3 py-3 text-xs font-bold text-white sm:col-span-1">🛵 Home Delivery</button>}
      </div>
      {(issue || locationStatus) && <div role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">{issue || locationStatus}</div>}
      {Number(options?.estimatedPrepMinutes) > 0 && <p className="mt-2 text-[11px] text-slate-500">Estimated preparation: {options.estimatedPrepMinutes} minutes (not a guaranteed pickup time).</p>}
      {orderType === 'dine-in' && options?.geofenceEnabled && <button type="button" onClick={checkLocation} disabled={checking}
        className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 disabled:opacity-50">
        {checking ? 'Checking live GPS…' : '📍 Check my Dine-In location'}
      </button>}
      {orderType === 'dine-in' && options?.signedTableQrRequired && <p className="mt-2 text-[11px] text-slate-500">A current signed table QR is required at checkout.</p>}
    </section>
  )
}
