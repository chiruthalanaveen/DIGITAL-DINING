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

  const handleRegister = async (e) => {
    e.preventDefault()
    if (!name.trim() || !email.trim() || !phone.trim() || !dob.trim() || !password.trim()) {
      alert('Please fill out all required fields, including your Date of Birth.')
      return
    }

    setLoading(true)
    try {
      // 1. Create Supabase Auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password: password.trim(),
      })

      if (authError) throw new Error(authError.message)

      const userId = authData.user?.id

      // 2. Save base restaurant profile in Supabase
      const { data, error: dbError } = await supabase.from('restaurants').insert([
        {
          id: userId,
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim().replace(/\D/g, ''),
          dob: dob.trim(),
          subscription_status: 'pending', // Pending until they choose a plan
          enable_counter_payment: true
        }
      ]).select().single()

      if (dbError) throw new Error(dbError.message)

      alert('Account Created! Please select your subscription plan.')
      // Route to subscription payment gateway page
      router.push(`/subscribe/${data.id}`)
    } catch (err) {
      alert('Registration Error: ' + err.message)
      setLoading(false)
    }
  }

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

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-neutral-300 block mb-1">Restaurant Name</label>
            <input 
              type="text" 
              placeholder="Spice Junction" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
              required 
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500" 
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
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500" 
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
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 font-mono" 
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
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 font-mono text-neutral-300" 
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
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-xl text-xs uppercase tracking-wider transition shadow-lg shadow-orange-500/20"
          >
            {loading ? 'Creating Account...' : 'Continue to Subscription 💳'}
          </button>
        </form>

      </div>
    </div>
  )
}