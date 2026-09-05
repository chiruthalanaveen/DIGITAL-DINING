'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function UnifiedManagementLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const cleanEmail = email.trim().toLowerCase()

      // 1. Check Developer Credentials
      if (cleanEmail === 'chiruthalanaveen07@gmail.com' && password === 'Shu@Shu') {
        alert('⚡ Developer Authorization Granted!')
        router.push('/developer/dashboard')
        return
      }

      // 2. Check Secondary/Standard Admin Credentials (if you want separate admin accounts)
      if (cleanEmail === 'admin@digitaldining.com' && password === 'Shu@Shu') {
        alert('🛡️ Admin Authorization Granted!')
        router.push('/admin/dashboard')
        return
      }

      throw new Error('Invalid master credentials. Access denied.')
    } catch (err) {
      alert('Authentication Error: ' + err.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-md w-full p-8 shadow-2xl space-y-6">
        
        <div className="text-center space-y-2">
          <span className="text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-3 py-1 rounded-full uppercase font-extrabold tracking-widest">
            Restricted Gateway
          </span>
          <h1 className="text-2xl font-black text-white">Management Portal</h1>
          <p className="text-xs text-neutral-400">Unified entry point for Admin & Developer control nodes.</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-neutral-300 block mb-1">Authorized Email</label>
            <input 
              type="email" 
              placeholder="chiruthalanaveen07@gmail.com" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-purple-500" 
            />
          </div>

          <div>
            <label className="text-xs font-bold text-neutral-300 block mb-1">Master Password</label>
            <input 
              type="password" 
              placeholder="••••••••" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-purple-500 font-mono" 
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-black py-4 rounded-xl text-xs uppercase tracking-wider transition shadow-lg shadow-purple-600/20"
          >
            {loading ? 'Authenticating...' : 'Authorize & Launch 🚀'}
          </button>
        </form>

        <div className="text-center pt-2">
          <a href="/" className="text-xs text-neutral-400 hover:text-white underline">
            ← Back to Public Home
          </a>
        </div>

      </div>
    </div>
  )
}