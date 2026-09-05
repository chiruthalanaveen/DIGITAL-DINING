'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AdminLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleAdminLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      // Strict Admin Verification
      if (email.trim() !== 'chiruthalanaveen07@gmail.com' || password !== 'Shu@Shu') {
        throw new Error('Invalid Admin Credentials. Please check your email and password.')
      }

      alert('Admin Login Successful! ⚡')
      router.push('/admin/dashboard')
    } catch (err) {
      alert('Login Error: ' + err.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-md w-full p-8 shadow-2xl space-y-6">
        
        <div className="text-center space-y-2">
          <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-1 rounded-full uppercase font-extrabold tracking-widest">
            Restricted Admin Area
          </span>
          <h1 className="text-2xl font-black text-white">Admin Portal</h1>
          <p className="text-xs text-neutral-400">Sign in to manage partner restaurants and subscriptions.</p>
        </div>

        <form onSubmit={handleAdminLogin} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-neutral-300 block mb-1">Admin Email</label>
            <input 
              type="email" 
              placeholder="chiruthalanaveen07@gmail.com" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-red-500" 
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
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-red-500 font-mono" 
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-4 rounded-xl text-xs uppercase tracking-wider transition shadow-lg shadow-red-600/20"
          >
            {loading ? 'Authenticating...' : 'Access Admin Dashboard 🛡️'}
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