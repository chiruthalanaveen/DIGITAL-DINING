'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function RestaurantRegistration() {
  const router = useRouter()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [dob, setDob] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [biometricLoading, setBiometricLoading] = useState(false)

  const handleRegister = async (e) => {
    e.preventDefault()

    if (!name.trim() || !email.trim() || !phone.trim() || !dob.trim() || !password.trim()) {
      alert('Please fill out all required fields, including your Date of Birth.')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          dob: dob.trim(),
          password: password.trim()
        }),
      })

      const text = await res.text()
      const data = text ? JSON.parse(text) : {}

      if (!data.success) {
        throw new Error(data.message || 'Registration failed.')
      }

      // The registration API creates the Auth account with email_confirm=true,
      // so we can sign in immediately and register the owner's passkey.
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      })

      if (signInError || !authData?.user) {
        throw new Error('Account was created, but we could not start secure biometric setup. Please try signing in normally.')
      }

      if (!supabase.auth.registerPasskey) {
        await supabase.auth.signOut()
        throw new Error('Passkey support is not enabled in the Supabase client. Please update your Supabase client configuration first.')
      }

      setBiometricLoading(true)

      const { error: passkeyError } = await supabase.auth.registerPasskey({
        friendlyName: `${name.trim()} - Owner Device`
      })

      if (passkeyError) {
        await supabase.auth.signOut()
        throw new Error(`Biometric setup was not completed: ${passkeyError.message}`)
      }

      alert('Account Created and Biometric Login Enabled! 🔐')
      router.push(`/subscribe/${data.restaurantId}`)
    } catch (err) {
      alert('Registration Error: ' + (err?.message || 'Something went wrong.'))
    } finally {
      setBiometricLoading(false)
      setLoading(false)
    }
  }

  const isBusy = loading || biometricLoading

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4 font-sans py-12">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-lg w-full p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-3 py-1 rounded-full uppercase font-extrabold tracking-widest">
            Step 1 of 2
          </span>
          <h1 className="text-2xl font-black text-white">Create Partner Account</h1>
          <p className="text-xs text-neutral-400">Set up your digital dining credentials and owner profile.</p>
        </div>

        <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="text-2xl">🔐</div>
            <div>
              <p className="text-sm font-black text-orange-300">Biometric login will be set up</p>
              <p className="text-xs text-neutral-400 mt-1">
                After creating your account, your device will ask for Face ID, fingerprint, Windows Hello, Touch ID, or another supported device unlock method. Your actual biometric data is not stored by Digital Dining.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-neutral-300 block mb-1">Restaurant Name</label>
            <input
              type="text"
              placeholder="Spice Junction"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isBusy}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 disabled:opacity-50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-neutral-300 block mb-1">Email Address</label>
              <input
                type="email"
                placeholder="owner@restaurant.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isBusy}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-neutral-300 block mb-1">Phone Number</label>
              <input
                type="tel"
                maxLength="10"
                placeholder="9876543210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                disabled={isBusy}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 font-mono disabled:opacity-50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-neutral-300 block mb-1">Date of Birth (Security)</label>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                required
                disabled={isBusy}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 font-mono text-neutral-300 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-neutral-300 block mb-1">Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isBusy}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 font-mono disabled:opacity-50"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isBusy}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-xl text-xs uppercase tracking-wider transition shadow-lg shadow-orange-500/20 disabled:opacity-50"
          >
            {biometricLoading ? 'Set Up Face / Fingerprint...' : loading ? 'Creating Account...' : 'Create Account + Set Up Biometric 🔐'}
          </button>
        </form>

        <p className="text-[11px] text-neutral-500 text-center leading-relaxed">
          Biometric authentication is handled by your device. Digital Dining does not receive or store your face or fingerprint image.
        </p>
      </div>
    </div>
  )
}
