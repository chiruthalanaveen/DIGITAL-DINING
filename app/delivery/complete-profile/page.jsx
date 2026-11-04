'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { safeDeliveryNext } from '@/lib/deliveryGoogleAuth'

const INITIAL_ADDRESS = {
  address_line1: '',
  address_line2: '',
  landmark: '',
  city: '',
  state: '',
  pincode: '',
  latitude: null,
  longitude: null,
  gps_accuracy_m: null,
}
const VALID_MOBILE = /^[6-9][0-9]{9}$/
const PLACE = /^[A-Za-z0-9_-]{1,80}$/

function Field({ label, value, onChange, placeholder, required = false, maxLength = 240, inputMode = 'text' }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-bold text-slate-700">{label}{required ? ' *' : ''}</span>
      <input type="text" inputMode={inputMode} value={value} maxLength={maxLength} required={required}
        placeholder={placeholder} onChange={(event) => onChange(event.target.value)}
        className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none transition focus:border-emerald-500" />
    </label>
  )
}

function CompleteDeliveryProfileContent() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') || '/delivery'
  const target = useMemo(() => {
    if (next === '/delivery?view=orders' || next === '/delivery?view=account') return next
    return safeDeliveryNext(next)
  }, [next])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [name, setName] = useState('')
  const [mobile, setMobile] = useState('')
  const [address, setAddress] = useState(INITIAL_ADDRESS)
  const [hasSavedAddress, setHasSavedAddress] = useState(false)
  const [manualPin, setManualPin] = useState(false)
  const mountedRef = useRef(true)

  const setAddressField = (key, value) => setAddress(current => ({ ...current, [key]: value }))
  const token = async () => {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session?.access_token) throw new Error('Your Delivery session expired. Sign in again.')
    return session.access_token
  }
  const api = async (path, options = {}) => {
    const accessToken = await token()
    const response = await fetch(path, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok || result?.success !== true) {
      throw new Error(result?.message || 'Unable to finish Delivery profile setup.')
    }
    return result
  }

  useEffect(() => {
    mountedRef.current = true
    let active = true
    const load = async () => {
      try {
        const { data, error: authError } = await supabase.auth.getUser()
        const user = data?.user
        const google = user?.identities?.some(item => item.provider === 'google') || user?.app_metadata?.provider === 'google' || user?.app_metadata?.providers?.includes('google')
        const verifiedPhone = /^\+91[6-9]\d{9}$/.test(String(user?.phone || '')) && Boolean(user?.phone_confirmed_at)
        const registeredDevice = user?.app_metadata?.delivery_auth_method === 'mobile_device'
        if (authError || !(google || verifiedPhone || registeredDevice)) {
          router.replace(`/delivery/login?next=${encodeURIComponent(target)}`)
          return
        }
        const [profileResponse, addressesResponse] = await Promise.all([
          api('/api/delivery/customer/google-profile'),
          api('/api/delivery/customer/addresses?accountType=google'),
        ])
        if (!active) return
        const profile = profileResponse.profile || {}
        const existing = Array.isArray(addressesResponse.addresses) ? addressesResponse.addresses : []
        const saved = existing.find(item => item.is_default) || existing[0] || null
        setEmail(profile.type === 'device' ? 'Mobile device account · phone not verified' : (profile.email || user.email || (profile.type === 'phone' ? 'Verified mobile account' : '')))
        setPhoneVerified(profile.type === 'phone' || profile.type === 'device')
        setName(profile.name || user.user_metadata?.full_name || '')
        setMobile(String(profile.mobile || saved?.recipient_mobile || '').replace(/\D/g, '').slice(-10))
        setHasSavedAddress(Boolean(saved))
        if (profile.complete) {
          router.replace(target)
          return
        }
      } catch (caught) {
        if (active) setError(caught?.message || 'Unable to load your Delivery profile.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false; mountedRef.current = false }
    // One setup check on navigation; callbacks authenticate independently.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, router])

  const captureGps = () => {
    if (!navigator?.geolocation) {
      setError('This device does not support GPS. Enter the address pin coordinates manually.')
      return
    }
    setError('')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!mountedRef.current) return
        setAddress(current => ({
          ...current,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          gps_accuracy_m: position.coords.accuracy,
        }))
        setLocating(false)
      },
      (gpsError) => {
        if (!mountedRef.current) return
        setLocating(false)
        setError(gpsError?.code === 1
          ? 'Location permission was denied. Allow GPS, or enter the address pin coordinates manually.'
          : 'Unable to locate the delivery address. Retry GPS or enter coordinates manually.')
      },
      { enableHighAccuracy: true, timeout: 18000, maximumAge: 0 },
    )
  }

  const save = async (event) => {
    event.preventDefault()
    if (saving) return
    const phone = mobile.replace(/\D/g, '')
    const fullName = name.trim().replace(/\s+/g, ' ')
    if (fullName.length < 2 || !VALID_MOBILE.test(phone)) {
      setError('Please enter your name and a valid 10-digit mobile contact number.')
      return
    }
    if (!hasSavedAddress) {
      const lat = Number(address.latitude)
      const lng = Number(address.longitude)
      if (address.address_line1.trim().length < 2 || address.city.trim().length < 2 ||
          address.state.trim().length < 2 || !/^[0-9]{6}$/.test(address.pincode.trim()) ||
          address.latitude == null || address.longitude == null ||
          !Number.isFinite(lat) || !Number.isFinite(lng) ||
          lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        setError('Complete your address and choose its GPS location before continuing.')
        return
      }
    }
    setSaving(true)
    setError('')
    try {
      await api('/api/delivery/customer/google-profile', {
        method: 'POST', body: JSON.stringify({ name: fullName, mobile: phone }),
      })
      if (!hasSavedAddress) {
        await api('/api/delivery/customer/addresses?accountType=google', {
          method: 'POST',
          body: JSON.stringify({
            accountType: 'google',
            makeDefault: true,
            address: {
              label: 'Home',
              recipient_name: fullName,
              recipient_mobile: phone,
              address_line1: address.address_line1.trim(),
              address_line2: address.address_line2.trim(),
              landmark: address.landmark.trim(),
              city: address.city.trim(),
              state: address.state.trim(),
              pincode: address.pincode.trim(),
              latitude: Number(address.latitude),
              longitude: Number(address.longitude),
              gps_accuracy_m: address.gps_accuracy_m ?? null,
            },
          }),
        })
        setHasSavedAddress(true)
      }
      const result = await api('/api/delivery/customer/google-profile')
      if (!result.profile?.complete) {
        throw new Error('Your profile was saved but setup is not yet complete. Please retry.')
      }
      router.replace(target)
      router.refresh()
    } catch (caught) {
      setError(caught?.message || 'Could not save your Delivery profile. Try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <main className="flex min-h-dvh items-center justify-center bg-[#f6f8f5] text-sm font-semibold text-slate-600">Preparing your Delivery profile…</main>
  }

  return (
    <main className="min-h-[100dvh] bg-[#f6f8f5] px-4 pb-10 pt-[max(1.5rem,env(safe-area-inset-top))] text-slate-900">
      <div className="mx-auto w-full max-w-xl">
        <header className="mb-7 flex items-center justify-between">
          <span className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-black text-white">DD</span>
          <span className="text-xs font-bold uppercase tracking-[.12em] text-emerald-700">Delivery profile setup</span>
        </header>
        <h1 className="text-3xl font-black tracking-tight">Complete your Delivery profile</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Complete your name, contact number and first delivery address. Google and SMS users are verified; device-only mobile numbers are not.</p>
        <form onSubmit={save} className="mt-6 space-y-5 rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="rounded-xl bg-emerald-50 p-3">
            <p className="text-xs font-semibold text-emerald-800">Delivery account</p>
            <p className="mt-1 break-words text-sm font-bold text-slate-800">{email}</p>
          </div>
          <Field label="Full name" value={name} onChange={setName} maxLength={100} required placeholder="Your name" />
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-700">Mobile contact number *</span>
            <div className="flex min-h-12 overflow-hidden rounded-xl border border-slate-200 focus-within:border-emerald-500">
              <span className="flex items-center border-r border-slate-200 bg-slate-50 px-3 text-sm font-bold">+91</span>
              <input type="tel" inputMode="numeric" autoComplete="tel-national" required maxLength={10}
                value={mobile} readOnly={phoneVerified} onChange={event => setMobile(event.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit mobile number"
                className="min-w-0 flex-1 px-3 text-base outline-none" />
            </div>
            <p className="mt-1 text-xs text-slate-500">Used for delivery calls. Google accounts use Google verification. Device-only mobile sign-in uses a private credential stored on your registered browser, not SMS.</p>
          </label>

          {hasSavedAddress ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="font-bold text-emerald-800">✓ Saved address found</p>
              <p className="mt-1 text-xs leading-5 text-emerald-800">Your existing address is linked to this account. You can change it from Saved Addresses at checkout.</p>
            </div>
          ) : (
            <fieldset className="space-y-3 border-t border-slate-100 pt-5">
              <legend className="text-sm font-extrabold text-slate-900">Your first delivery address</legend>
              <Field label="House / Flat / Street" value={address.address_line1} required onChange={v => setAddressField('address_line1', v)} placeholder="Flat 102, Main Road" />
              <Field label="Area / Locality" value={address.address_line2} onChange={v => setAddressField('address_line2', v)} placeholder="Apartment or locality" />
              <Field label="Landmark" value={address.landmark} onChange={v => setAddressField('landmark', v)} placeholder="Near the park" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="City" value={address.city} required maxLength={120} onChange={v => setAddressField('city', v)} placeholder="Bengaluru" />
                <Field label="State" value={address.state} required maxLength={120} onChange={v => setAddressField('state', v)} placeholder="Karnataka" />
              </div>
              <Field label="PIN code" value={address.pincode} required maxLength={6} inputMode="numeric"
                onChange={v => setAddressField('pincode', v.replace(/\D/g, '').slice(0, 6))} placeholder="6-digit postal code" />
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-extrabold">Delivery location pin *</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Use GPS when you are at the delivery address. For an address elsewhere, enter its coordinates manually. Coverage is rechecked at checkout.</p>
                <button type="button" disabled={locating} onClick={captureGps}
                  className="mt-3 min-h-11 w-full rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white disabled:opacity-50">
                  {locating ? 'Finding exact location…' : '📍 Use current GPS location'}
                </button>
                {address.latitude != null && address.longitude != null && (
                  <p className="mt-2 text-xs font-semibold text-emerald-700">Location saved: {Number(address.latitude).toFixed(5)}, {Number(address.longitude).toFixed(5)}</p>
                )}
                <button type="button" onClick={() => setManualPin(value => !value)}
                  className="mt-3 text-xs font-bold text-slate-600 underline underline-offset-2">
                  {manualPin ? 'Hide manual coordinates' : 'Enter another address location manually'}
                </button>
                {manualPin && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Field label="Latitude" inputMode="decimal" value={address.latitude ?? ''}
                      onChange={v => setAddressField('latitude', v)} placeholder="12.9716" />
                    <Field label="Longitude" inputMode="decimal" value={address.longitude ?? ''}
                      onChange={v => setAddressField('longitude', v)} placeholder="77.5946" />
                  </div>
                )}
              </div>
            </fieldset>
          )}

          {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700" role="alert">{error}</p>}
          <button type="submit" disabled={saving}
            className="min-h-[54px] w-full rounded-2xl bg-slate-950 px-5 text-sm font-extrabold text-white disabled:opacity-50">
            {saving ? 'Saving your details…' : 'Save & Continue to Delivery'}
          </button>
        </form>
      </div>
    </main>
  )
}

export default function CompleteGoogleDeliveryProfilePage() {
  return (
    <Suspense fallback={<main className="min-h-dvh bg-[#f6f8f5]" />}>
      <CompleteDeliveryProfileContent />
    </Suspense>
  )
}
