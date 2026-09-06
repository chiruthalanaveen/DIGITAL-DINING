'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function RestaurantLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [dob, setDob] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()

    if (!email.trim() || !password.trim() || !dob.trim()) {
      alert('Please fill out your Email, Password, and Date of Birth.')
      return
    }

    setLoading(true)
    let passwordSessionCreated = false

    try {
      // Step 1: Verify the existing email + password credentials.
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      })

      if (authError || !authData?.user) {
        throw new Error('Invalid email or password.')
      }

      passwordSessionCreated = true
      const userId = authData.user.id

      // Step 2: Verify the restaurant profile and DOB.
      const { data: restaurant, error: dbError } = await supabase
        .from('restaurants')
        .select('id, dob')
        .eq('id', userId)
        .single()

      if (dbError || !restaurant) {
        throw new Error('Restaurant profile not found.')
      }

      if (restaurant.dob !== dob.trim()) {
        throw new Error('Security Error: Date of Birth does not match account records.')
      }

      // Step 3: Check whether this restaurant owner has registered a passkey.
      if (!supabase.auth.passkey || !supabase.auth.signInWithPasskey) {
        throw new Error('Biometric login is not enabled in the app configuration.')
      }

      const { data: passkeys, error: passkeyListError } = await supabase.auth.passkey.list()

      if (passkeyListError) {
        throw new Error('Could not check your biometric registration: ' + passkeyListError.message)
      }

      if (!passkeys || passkeys.length === 0) {
        alert('Your password and DOB are correct, but no biometric device is registered. Please use the device used during registration or contact support.')
        return
      }

      // Password authentication has served its purpose. Sign out before the
      // passkey ceremony so the final session is created by the biometric factor.
      await supabase.auth.signOut()
      passwordSessionCreated = false

      // Step 4: The browser/device now asks for Face ID, fingerprint,
      // Windows Hello, Touch ID, PIN, etc.
      const { data: passkeyAuthData, error: passkeyError } = await supabase.auth.signInWithPasskey()

      if (passkeyError || !passkeyAuthData?.user) {
        throw new Error(passkeyError?.message || 'Biometric verification failed.')
      }

      // A passkey must belong to the same restaurant whose credentials were entered.
      if (String(passkeyAuthData.user.id) !== String(restaurant.id)) {
        await supabase.auth.signOut()
        throw new Error('Biometric account does not match this restaurant account.')
      }

      alert('Secure Login Successful! 🔐')
      router.replace(`/dashboard/${restaurant.id}`)
    } catch (err) {
      if (passwordSessionCreated) {
        await supabase.auth.signOut()
      }

      alert('Authentication Failed: ' + (err?.message || 'Something went wrong.'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-md w-full p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-3 py-1 rounded-full uppercase font-extrabold tracking-widest">
            Multi-Factor Security
          </span>
          <h1 className="text-2xl font-black text-white">Partner Sign In</h1>
          <p className="text-xs text-neutral-400">Email, password, DOB, and biometric verification are required.</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-neutral-300 block mb-1">Email Address</label>
            <input
              type="email"
              placeholder="owner@restaurant.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 disabled:opacity-50"
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
              disabled={loading}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-neutral-300 block mb-1">Date of Birth (Security Verification)</label>
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              required
              disabled={loading}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 font-mono text-neutral-300 disabled:opacity-50"
            />
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4 text-center">
            <div className="text-3xl mb-2">🔐</div>
            <p className="text-sm font-black text-white">Biometric verification</p>
            <p className="text-[11px] text-neutral-500 mt-1">Your device will request Face ID, fingerprint, Touch ID, Windows Hello, or another supported unlock method.</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-xl text-xs uppercase tracking-wider transition shadow-lg shadow-orange-500/25 disabled:opacity-50"
          >
            {loading ? 'Verifying Credentials + Biometric...' : 'Sign In Securely 🔐'}
          </button>
        </form>

        <div className="text-center pt-2">
          <a href="/" className="text-xs text-neutral-400 hover:text-white underline">
            ← Back to Home
          </a>
        </div>
      </div>
    </div>
  )
}
