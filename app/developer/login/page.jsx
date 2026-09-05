'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function DeveloperLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleDeveloperLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      // Hardcoded or secure environment-based developer credentials
      if (email.trim() !== 'chiruthalanaveen07@gmail.com' || password !== 'Shu@Shu') {
        throw new Error('Unauthorized Developer Access.')
      }

      alert('Developer Node Authenticated! ⚡')
      router.push('/developer/dashboard')
    } catch (err) {
      alert('Login Error: ' + err.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-neutral-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-md w-full p-8 shadow-2xl space-y-6">
        
        <div className="text-center space-y-2">
          <span className="text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-3 py-1 rounded-full uppercase font-extrabold tracking-widest">
            System Core v2.0
          </span>
          <h1 className="text-2xl font-black text-white">Developer Command Node</h1>
          <p className="text-xs text-neutral-400">Global telemetry and cross-tenant management.</p>
        </div>

        <form onSubmit={handleDeveloperLogin} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-neutral-300 block mb-1">Developer Email</label>
            <input 
              type="email" 
              placeholder="chiruthalanaveen07@gmail.com" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              required 
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan-500" 
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
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan-500 font-mono" 
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-cyan-500 hover:bg-cyan-600 text-neutral-950 font-black py-4 rounded-xl text-xs uppercase tracking-wider transition shadow-lg shadow-cyan-500/20"
          >
            {loading ? 'Initializing...' : 'Authorize Terminal 🚀'}
          </button>
        </form>

      </div>
    </div>
  )
}