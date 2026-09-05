'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function DeveloperDashboard() {
  const router = useRouter()
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [globalAnnouncement, setGlobalAnnouncement] = useState('')
  const [maintenanceMode, setMaintenanceMode] = useState(false)

  useEffect(() => {
    fetchAllTenants()
  }, [])

  const fetchAllTenants = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('restaurants')
        .select('*')
        .order('name', { ascending: true })

      if (error) throw new Error(error.message)
      setTenants(data || [])
    } catch (err) {
      alert('Sync Error: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Developer Action: Force-upgrade or modify tenant subscription status remotely
  const handleToggleTenantStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active'
    try {
      const { error } = await supabase
        .from('restaurants')
        .update({ subscription_status: newStatus })
        .eq('id', id)

      if (error) throw new Error(error.message)
      alert(`Tenant status successfully changed to: ${newStatus}`)
      fetchAllTenants()
    } catch (err) {
      alert('Action Failed: ' + err.message)
    }
  }

  return (
    <div className="min-h-screen bg-black text-neutral-100 p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-neutral-800 pb-6">
          <div>
            <span className="text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 px-3 py-1 rounded-full uppercase font-extrabold tracking-widest">
              Root Access • Developer Control
            </span>
            <h1 className="text-3xl font-black text-white mt-2">Digital Dining Core Node</h1>
            <p className="text-xs text-neutral-400">Managing all connected tenant websites, database states, and global overrides.</p>
          </div>

          <button 
            onClick={() => router.push('/developer/login')}
            className="bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 px-4 py-2 rounded-xl text-xs font-bold transition self-start"
          >
            Disconnect Terminal 🔒
          </button>
        </div>

        {/* SYSTEM METRICS & GLOBAL CONTROLS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl">
            <p className="text-xs text-neutral-400 uppercase tracking-widest font-bold">Connected Tenant Nodes</p>
            <p className="text-3xl font-black text-cyan-400 font-mono mt-1">{tenants.length}</p>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl">
            <p className="text-xs text-neutral-400 uppercase tracking-widest font-bold">Database Cluster</p>
            <p className="text-3xl font-black text-emerald-400 font-mono mt-1">Supabase (Healthy)</p>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl flex flex-col justify-between">
            <p className="text-xs text-neutral-400 uppercase tracking-widest font-bold">Global Maintenance Toggle</p>
            <button 
              onClick={() => setMaintenanceMode(!maintenanceMode)}
              className={`mt-2 py-2 px-4 rounded-xl text-xs font-black uppercase transition ${maintenanceMode ? 'bg-red-500 text-white' : 'bg-neutral-800 text-neutral-300'}`}
            >
              {maintenanceMode ? '🚨 Maintenance Active' : '🟢 System Online'}
            </button>
          </div>
        </div>

        {/* CONNECTED TENANTS MANAGEMENT TABLE */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-6 border-b border-neutral-800 flex items-center justify-between">
            <h2 className="text-sm font-black text-white uppercase tracking-wider">Connected Restaurant Instances ({tenants.length})</h2>
            <button 
              onClick={fetchAllTenants}
              className="text-xs text-cyan-400 hover:underline font-bold"
            >
              🔄 Refresh Node Sync
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-800 text-[10px] text-neutral-400 uppercase tracking-widest bg-neutral-950/50">
                  <th className="p-4 font-bold">Tenant Name</th>
                  <th className="p-4 font-bold">Owner Email / Phone</th>
                  <th className="p-4 font-bold">Subscription Tier</th>
                  <th className="p-4 font-bold">Node Status</th>
                  <th className="p-4 font-bold text-right">Developer Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="p-8 text-center text-neutral-400">Syncing with tenant databases...</td>
                  </tr>
                ) : tenants.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="p-8 text-center text-neutral-400">No connected restaurant nodes found.</td>
                  </tr>
                ) : (
                  tenants.map((tenant) => (
                    <tr key={tenant.id} className="hover:bg-neutral-800/30 transition">
                      <td className="p-4 font-bold text-white">
                        {tenant.name}
                        <p className="text-[10px] text-neutral-500 font-mono mt-0.5">UUID: {tenant.id}</p>
                      </td>
                      <td className="p-4">
                        <p className="text-neutral-300">{tenant.email}</p>
                        <p className="text-[10px] text-neutral-500 font-mono">+91 {tenant.phone || 'N/A'}</p>
                      </td>
                      <td className="p-4">
                        <span className="bg-neutral-800 text-neutral-300 px-2.5 py-1 rounded-lg text-[11px] font-bold">
                          {tenant.plan || 'Standard'}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${tenant.subscription_status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                          {tenant.subscription_status || 'active'}
                        </span>
                      </td>
                      <td className="p-4 text-right space-x-2">
                        <button 
                          onClick={() => window.open(`/dashboard/${tenant.id}`, '_blank')}
                          className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-3 py-1.5 rounded-xl font-bold transition"
                        >
                          Inspect Tenant 🔍
                        </button>
                        <button 
                          onClick={() => handleToggleTenantStatus(tenant.id, tenant.subscription_status)}
                          className="bg-cyan-500/10 hover:bg-cyan-500 text-cyan-400 hover:text-neutral-950 px-3 py-1.5 rounded-xl font-bold transition"
                        >
                          Toggle Access ⚡
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}