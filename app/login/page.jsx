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
    try {
      // 1. Authenticate credentials via Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      })

      if (authError) throw new Error('Invalid email or password.')

      const userId = authData.user?.id

      // 2. Fetch restaurant profile and match Date of Birth for secondary validation
      const { data: restaurant, dbError } = await supabase
        .from('restaurants')
        .select('id, dob')
        .eq('id', userId)
        .single()

      if (dbError || !restaurant) {
        throw new Error('Restaurant profile not found.')
      }

      // 3. Verify that entered DOB matches database record
      if (restaurant.dob !== dob.trim()) {
        throw new Error('Security Error: Date of Birth does not match account records.')
      }

      alert('Secure Login Successful! ⚡')
      router.push(`/dashboard/${restaurant.id}`)
    } catch (err) {
      alert('Authentication Failed: ' + err.message)
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
          <p className="text-xs text-neutral-400">Enter your credentials and verification DOB to access dashboard.</p>
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
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500" 
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
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 font-mono" 
            />
          </div>

          <div>
            <label className="text-xs font-bold text-neutral-300 block mb-1">Date of Birth (Security Verification)</label>
            <input 
              type="date" 
              value={dob} 
              onChange={(e) => setDob(e.target.value)} 
              required 
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 font-mono text-neutral-300" 
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-xl text-xs uppercase tracking-wider transition shadow-lg shadow-orange-500/25"
          >
            {loading ? 'Verifying...' : 'Sign In Securely 🚀'}
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