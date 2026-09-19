'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function DeveloperAdminDashboard() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState([])

  // Detailed Modal/Drawer state for inspecting/modifying specific restaurant data
  const [activeRestaurant, setActiveRestaurant] = useState(null)
  const [restaurantMenu, setRestaurantMenu] = useState([])
  const [restaurantStaff, setRestaurantStaff] = useState([])
  const [restaurantOrders, setRestaurantOrders] = useState([])
  const [inspectTab, setInspectTab] = useState('menu')

  // Support chat states
  const [supportChatSessions, setSupportChatSessions] = useState([])
  const [selectedSupportSession, setSelectedSupportSession] = useState(null)
  const [supportChatMessages, setSupportChatMessages] = useState([])
  const [adminReply, setAdminReply] = useState('')
  const [supportChatLoading, setSupportChatLoading] = useState(false)
  const [supportReplyLoading, setSupportReplyLoading] = useState(false)
  const chatEndRef = useRef(null)

  // Website Status Control State (Working / Not Working)
  const [siteStatus, setSiteStatus] = useState('Working')
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // Strict Security Check: Bounces direct URL entries straight to the landing page
  useEffect(() => {
    const isAuth = sessionStorage.getItem('isSuperAdminAuthenticated')
    if (!isAuth) {
      router.replace('/')
      return
    }

    setAuthorized(true)
    fetchRestaurants()
    fetchSupportChatSessions()
    fetchWebsiteStatus()
  }, [router])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [supportChatMessages])

  const fetchWebsiteStatus = async () => {
    try {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('status')
        .eq('key', 'website_status')
        .single()

      if (data && data.status) {
        setSiteStatus(data.status)
      }
    } catch (err) {
      setSiteStatus('Working')
    }
  }

  const handleUpdateWebsiteStatus = async (newStatus) => {
    setUpdatingStatus(true)
    try {
      const { error } = await supabase
        .from('platform_settings')
        .upsert([{ key: 'website_status', status: newStatus }], { onConflict: 'key' })

      if (error) throw error

      setSiteStatus(newStatus)
      alert(`Website Status successfully updated to: ${newStatus} ⚡`)
    } catch (err) {
      alert('Failed to update status: ' + err.message)
    } finally {
      setUpdatingStatus(false)
    }
  }
  useEffect(() => {
    if (!authorized) return undefined

    const channel = supabase
      .channel('admin-support-chat-live-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'support_chat_sessions' },
        () => {
          fetchSupportChatSessions()
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          if (
            selectedSupportSession?.id &&
            payload?.new?.support_session_id &&
            String(payload.new.support_session_id) === String(selectedSupportSession.id)
          ) {
            setSupportChatMessages((current) => {
              if (current.some((item) => String(item.id) === String(payload.new.id))) return current
              return [...current, payload.new]
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [authorized, selectedSupportSession?.id])


  const fetchSupportChatSessions = async () => {
    try {
      const { data, error } = await supabase.rpc('admin_get_support_chats')
      if (error) throw error
      if (data?.success === false) {
        throw new Error(data?.message || 'Unable to load support chats.')
      }

      const sessions = Array.isArray(data?.sessions) ? data.sessions : []
      setSupportChatSessions(sessions)

      setSelectedSupportSession((current) => {
        if (!current) return null
        return sessions.find((session) => String(session.id) === String(current.id)) || current
      })
    } catch (err) {
      console.error('Error fetching support chats:', err)
    }
  }

  const loadSelectedSupportChat = async (session) => {
    if (!session?.restaurant_id) return

    try {
      const { data, error } = await supabase.rpc('get_support_chat_state', {
        p_restaurant_id: String(session.restaurant_id),
      })

      if (error) throw error
      if (data?.success === false) {
        throw new Error(data?.message || 'Unable to load support conversation.')
      }

      const loadedSession = data?.session || session
      setSelectedSupportSession(loadedSession)
      setSupportChatMessages(Array.isArray(data?.messages) ? data.messages : [])
    } catch (err) {
      console.error('Error loading support conversation:', err)
      alert(`Unable to load support chat: ${err.message || 'Unknown error'}`)
    }
  }

  const openSupportChat = async (session) => {
    setSelectedSupportSession(session)
    await loadSelectedSupportChat(session)
  }

  const acceptSupportChat = async (session) => {
    if (!session?.id) return

    setSupportChatLoading(true)
    try {
      const { data, error } = await supabase.rpc('admin_accept_support_chat', {
        p_session_id: String(session.id),
        p_admin_name: 'Admin',
      })

      if (error) throw error
      if (data?.success === false) {
        throw new Error(data?.message || 'Unable to accept support chat.')
      }

      const acceptedSession = data?.session || { ...session, status: 'connected' }
      setSelectedSupportSession(acceptedSession)
      await fetchSupportChatSessions()
      await loadSelectedSupportChat(acceptedSession)
    } catch (err) {
      console.error('Support chat acceptance error:', err)
      alert(`Unable to accept chat: ${err.message || 'Unknown error'}`)
    } finally {
      setSupportChatLoading(false)
    }
  }

  const closeSupportChat = async (session) => {
    if (!session?.id) return
    if (!window.confirm(`Close the support chat for ${session.restaurant_name || 'this restaurant'}?`)) return

    try {
      const { data, error } = await supabase.rpc('admin_close_support_chat', {
        p_session_id: String(session.id),
        p_admin_name: 'Admin',
      })

      if (error) throw error
      if (data?.success === false) {
        throw new Error(data?.message || 'Unable to close support chat.')
      }

      setSupportChatMessages([])
      setSelectedSupportSession(null)
      await fetchSupportChatSessions()
    } catch (err) {
      console.error('Support chat close error:', err)
      alert(`Unable to close chat: ${err.message || 'Unknown error'}`)
    }
  }

  const sendAdminChatReply = async (event) => {
    event.preventDefault()
    const message = adminReply.trim()
    if (!message || !selectedSupportSession?.id || !selectedSupportSession?.restaurant_id) return

    if (String(selectedSupportSession.status).toLowerCase() !== 'connected') {
      alert('Accept the support chat before sending a reply.')
      return
    }

    setSupportReplyLoading(true)
    try {
      const { data, error } = await supabase.rpc('support_chat_send_message', {
        p_restaurant_id: String(selectedSupportSession.restaurant_id),
        p_session_id: String(selectedSupportSession.id),
        p_sender: 'admin',
        p_message: message,
      })

      if (error) throw error
      if (data?.success === false) {
        throw new Error(data?.message || 'Unable to send reply.')
      }

      setAdminReply('')
      if (data?.message) {
        setSupportChatMessages((current) => {
          if (current.some((item) => String(item.id) === String(data.message.id))) return current
          return [...current, data.message]
        })
      }
    } catch (err) {
      console.error('Admin reply error:', err)
      alert(`Failed to send reply: ${err.message || 'Unknown error'}`)
    } finally {
      setSupportReplyLoading(false)
    }
  }

  // Keep Admin support inbox and the selected conversation synchronized even
  // if a browser/device does not deliver Supabase Realtime events.
  useEffect(() => {
    if (!authorized) return undefined

    const interval = window.setInterval(async () => {
      if (document.visibilityState !== 'visible') return
      await fetchSupportChatSessions()
      if (selectedSupportSession?.restaurant_id) {
        try {
          const { data } = await supabase.rpc('get_support_chat_state', {
            p_restaurant_id: String(selectedSupportSession.restaurant_id),
          })
          if (data?.success !== false) {
            setSelectedSupportSession(data?.session || selectedSupportSession)
            setSupportChatMessages(Array.isArray(data?.messages) ? data.messages : [])
          }
        } catch (error) {
          console.error('Support chat polling error:', error)
        }
      }
    }, 2000)

    return () => window.clearInterval(interval)
  }, [authorized, selectedSupportSession?.restaurant_id])


  const fetchRestaurants = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('restaurants')
        .select('*')
        .order('name', { ascending: true })

      if (error) throw new Error(error.message)
      setRestaurants(data || [])
      setSelectedIds([])
    } catch (err) {
      alert('Error loading restaurants: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Open Deep Inspector for a specific restaurant
  const handleOpenInspector = async (restaurant) => {
    setActiveRestaurant(restaurant)
    await fetchInspectorData(restaurant.id)
  }

  const fetchInspectorData = async (restId) => {
    try {
      const [menuRes, staffRes, orderRes] = await Promise.all([
        supabase.from('menu_items').select('*').eq('restaurant_id', restId),
        supabase.from('staff_users').select('*').eq('restaurant_id', restId),
        supabase.from('orders').select('*').eq('restaurant_id', restId).order('created_at', { ascending: false })
      ])

      setRestaurantMenu(menuRes.data || [])
      setRestaurantStaff(staffRes.data || [])
      setRestaurantOrders(orderRes.data || [])
    } catch (err) {
      console.error('Error fetching restaurant deep data:', err)
    }
  }

  // Developer Modifier: Update Restaurant Plan Globally
  const handleUpdatePlan = async (restId, newPlan) => {
    try {
      const { error } = await supabase
        .from('restaurants')
        .update({ plan: newPlan })
        .eq('id', restId)

      if (error) throw error
      setRestaurants(prev => prev.map(r => r.id === restId ? { ...r, plan: newPlan } : r))
      if (activeRestaurant) setActiveRestaurant(prev => ({ ...prev, plan: newPlan }))
      alert(`Plan updated to ${newPlan} successfully! ✅`)
    } catch (err) {
      alert('Failed to update plan: ' + err.message)
    }
  }

  // Developer Modifier: Delete Menu Item
  const handleDeveloperDeleteMenuItem = async (itemId) => {
    if (!confirm('Developer override: Delete this menu item?')) return
    try {
      await supabase.from('menu_items').delete().eq('id', itemId)
      setRestaurantMenu(prev => prev.filter(i => i.id !== itemId))
    } catch (err) {
      alert('Failed to delete item: ' + err.message)
    }
  }

  // Developer Modifier: Revoke Staff
  const handleDeveloperDeleteStaff = async (staffId) => {
    if (!confirm('Developer override: Revoke this staff member?')) return
    try {
      await supabase.from('staff_users').delete().eq('id', staffId)
      setRestaurantStaff(prev => prev.filter(s => s.id !== staffId))
    } catch (err) {
      alert('Failed to revoke staff: ' + err.message)
    }
  }

  // INSTANT DELETE SINGLE RESTAURANT
  const handleDeleteRestaurant = async (id, name) => {
    if (!confirm(`Developer override: Delete restaurant "${name}" and all its related data?`)) return

    setRestaurants(prev => prev.filter(r => r.id !== id))
    setSelectedIds(prev => prev.filter(selectedId => selectedId !== id))
    if (activeRestaurant?.id === id) setActiveRestaurant(null)

    try {
      const { error } = await supabase.from('restaurants').delete().eq('id', id)
      if (error) throw new Error(error.message)
    } catch (err) {
      alert('Delete Failed: ' + err.message)
      fetchRestaurants()
    }
  }

  // INSTANT BULK DELETE
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return
    if (!confirm(`Developer override: Delete ${selectedIds.length} selected restaurant partners?`)) return

    const idsToDelete = [...selectedIds]
    setRestaurants(prev => prev.filter(r => !idsToDelete.includes(r.id)))
    setSelectedIds([])
    setActiveRestaurant(null)

    try {
      const { error } = await supabase.from('restaurants').delete().in('id', idsToDelete)
      if (error) throw new Error(error.message)
    } catch (err) {
      alert('Bulk Delete Failed: ' + err.message)
      fetchRestaurants()
    }
  }

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(filteredRestaurants.map(r => r.id))
    } else {
      setSelectedIds([])
    }
  }

  const handleToggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  const handleSignOut = () => {
    sessionStorage.removeItem('isSuperAdminAuthenticated')
    router.replace('/') // Cleanly destroys session and returns to landing page
  }

  if (!authorized) {
    return null // Renders nothing while validating security session
  }

  const filteredRestaurants = restaurants.filter(r => 
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.email.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const isAllSelected = filteredRestaurants.length > 0 && filteredRestaurants.every(r => selectedIds.includes(r.id))

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-neutral-800 pb-6">
          <div>
            <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-1 rounded-full uppercase font-extrabold tracking-widest">
              Developer Super Admin Mode ⚡
            </span>
            <h1 className="text-3xl font-black text-white mt-2">Master Control & Data Modifier</h1>
            <p className="text-xs text-neutral-400">Full root access to view, override, and modify all multi-tenant restaurant data.</p>
          </div>

          <div className="flex items-center space-x-3">
            {selectedIds.length > 0 && (
              <button 
                onClick={handleBulkDelete}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-lg shadow-red-600/20"
              >
                🗑️ Delete Selected ({selectedIds.length})
              </button>
            )}
            <button 
              onClick={fetchRestaurants}
              className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 px-4 py-2 rounded-xl text-xs font-bold transition"
            >
              🔄 Refresh Master DB
            </button>
            <button 
              onClick={handleSignOut}
              className="bg-red-600/10 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/20 px-4 py-2 rounded-xl text-xs font-bold transition"
            >
              Sign Out 🚪
            </button>
          </div>
        </div>

        {/* METRICS & SEARCH */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl">
            <p className="text-xs text-neutral-400 uppercase tracking-widest font-bold">Total Platform Partners</p>
            <p className="text-2xl font-black text-white font-mono mt-1">{restaurants.length}</p>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl">
            <p className="text-xs text-neutral-400 uppercase tracking-widest font-bold">Active Subscriptions</p>
            <p className="text-2xl font-black text-emerald-400 font-mono mt-1">
              {restaurants.filter(r => r.subscription_status === 'active').length}
            </p>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl flex items-center">
            <input 
              type="text" 
              placeholder="Global search partner name or email..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-xs focus:outline-none focus:border-red-500"
            />
          </div>
        </div>

        {/* LIVE CHAT SUPPORT CONSOLE */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 md:p-8 space-y-5 shadow-2xl">
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3 border-b border-neutral-800 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <h2 className="text-lg font-black text-white uppercase tracking-wider">Live Restaurant Support Chat</h2>
              </div>
              <p className="text-[10px] text-neutral-500 mt-1">
                Restaurants must request support first. Chat becomes live only after Admin accepts the request.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchSupportChatSessions}
              className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase"
            >
              ↻ Refresh Chats
            </button>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-5">
            <div className="space-y-3">
              <div className="bg-neutral-950 border border-yellow-500/20 rounded-2xl p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] uppercase tracking-widest font-black text-yellow-400">Pending Requests</p>
                  <span className="text-xs font-black text-white">{supportChatSessions.filter((item) => item.status === 'pending').length}</span>
                </div>
              </div>

              {supportChatSessions.length === 0 ? (
                <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-8 text-center">
                  <div className="text-3xl mb-2">💬</div>
                  <p className="text-xs font-black text-neutral-300">No support chat requests.</p>
                  <p className="text-[10px] text-neutral-600 mt-1">A restaurant request will appear here automatically.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                  {supportChatSessions.map((chat) => (
                    <button
                      type="button"
                      key={chat.id}
                      onClick={() => openSupportChat(chat)}
                      className={`w-full text-left bg-neutral-950 border rounded-2xl p-4 transition ${
                        selectedSupportSession?.id === chat.id
                          ? 'border-red-500/60 shadow-lg shadow-red-950/20'
                          : chat.status === 'pending'
                            ? 'border-yellow-500/30 hover:border-yellow-500/60'
                            : 'border-neutral-800 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-black text-white truncate">{chat.restaurant_name || 'Restaurant'}</p>
                          <p className="text-[10px] text-orange-400 font-mono mt-1">Code: {chat.restaurant_code || '-----'}</p>
                          <p className="text-[9px] text-neutral-600 mt-1">Requested {chat.requested_at ? new Date(chat.requested_at).toLocaleString('en-IN') : '--'}</p>
                        </div>
                        <span className={`text-[9px] uppercase font-black px-2 py-1 rounded-lg border whitespace-nowrap ${
                          chat.status === 'pending'
                            ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                            : chat.status === 'connected'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-neutral-800 text-neutral-500 border-neutral-700'
                        }`}>
                          {chat.status === 'connected' ? 'Live' : chat.status}
                        </span>
                      </div>

                      {chat.status === 'pending' && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <span className="bg-yellow-500/10 text-yellow-300 border border-yellow-500/20 rounded-xl py-2 text-center text-[10px] font-black">
                            📨 New Request
                          </span>
                          <span className="bg-neutral-800 text-neutral-300 rounded-xl py-2 text-center text-[10px] font-black">
                            Click to Open
                          </span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-neutral-950 border border-neutral-800 rounded-2xl overflow-hidden flex flex-col min-h-[520px]">
              {!selectedSupportSession ? (
                <div className="flex-1 flex items-center justify-center text-center p-8">
                  <div>
                    <div className="text-4xl mb-3">🛟</div>
                    <h3 className="text-sm font-black text-white">Select a support request</h3>
                    <p className="text-[10px] text-neutral-600 mt-1 max-w-sm">
                      Select a restaurant from the support inbox to accept the request and start live chat.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="p-4 border-b border-neutral-800 bg-neutral-900">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-white">{selectedSupportSession.restaurant_name || 'Restaurant'}</p>
                        <p className="text-[10px] text-orange-400 font-mono mt-1">Restaurant Code: {selectedSupportSession.restaurant_code || '-----'}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {selectedSupportSession.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => acceptSupportChat(selectedSupportSession)}
                            disabled={supportChatLoading}
                            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase"
                          >
                            {supportChatLoading ? 'Accepting...' : '✓ Accept Live Chat'}
                          </button>
                        )}
                        {selectedSupportSession.status === 'connected' && (
                          <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3 py-2 rounded-xl text-[10px] font-black uppercase">
                            🟢 Live Chat Connected
                          </span>
                        )}
                        {selectedSupportSession.status === 'connected' && (
                          <button
                            type="button"
                            onClick={() => closeSupportChat(selectedSupportSession)}
                            className="bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 px-3 py-2 rounded-xl text-[10px] font-black uppercase"
                          >
                            Close Chat
                          </button>
                        )}
                      </div>
                    </div>

                    {selectedSupportSession.status === 'pending' && (
                      <div className="mt-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
                        <p className="text-[10px] font-black uppercase text-yellow-400">Waiting for Admin acceptance</p>
                        <p className="text-[9px] text-yellow-200/60 mt-1">The restaurant cannot send chat messages until you accept this request.</p>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 p-4 overflow-y-auto space-y-3">
                    {supportChatMessages.length === 0 ? (
                      <p className="text-center text-xs text-neutral-600 mt-16">
                        {selectedSupportSession.status === 'connected' ? 'Live chat connected. Send the first message.' : 'No messages yet.'}
                      </p>
                    ) : (
                      supportChatMessages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.sender === 'admin' ? 'justify-end' : 'justify-start'}`}>
                          <div className="space-y-0.5 max-w-[78%]">
                            <p className="text-[9px] font-bold text-neutral-500 px-1">
                              {msg.sender === 'admin' ? 'You (Admin)' : 'Restaurant'}
                            </p>
                            <div className={`px-4 py-2.5 rounded-2xl text-xs leading-relaxed ${
                              msg.sender === 'admin'
                                ? 'bg-red-600 text-white rounded-br-none shadow-md'
                                : 'bg-neutral-800 text-neutral-200 rounded-bl-none border border-neutral-700'
                            }`}>
                              {msg.message}
                              {msg.created_at && (
                                <div className="text-[8px] opacity-50 mt-1">
                                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  <form onSubmit={sendAdminChatReply} className="flex gap-2 border-t border-neutral-800 p-3 bg-neutral-900">
                    <input
                      type="text"
                      placeholder={selectedSupportSession.status === 'connected' ? 'Type reply to restaurant...' : 'Accept the chat before replying...'}
                      value={adminReply}
                      onChange={(e) => setAdminReply(e.target.value)}
                      disabled={selectedSupportSession.status !== 'connected' || supportReplyLoading}
                      className="flex-1 min-w-0 bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-xs focus:outline-none focus:border-red-500 disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={selectedSupportSession.status !== 'connected' || supportReplyLoading || !adminReply.trim()}
                      className="bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black px-5 py-3 rounded-xl text-xs uppercase tracking-wider transition"
                    >
                      {supportReplyLoading ? 'Sending...' : 'Reply 🚀'}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>

        {/* DEEP INSPECTOR MODAL / DRAWER (IF ACTIVE RESTAURANT SELECTED) */}
        {activeRestaurant && (
          <div className="bg-neutral-900 border-2 border-red-500/50 rounded-3xl p-6 md:p-8 space-y-6 shadow-2xl relative">
            <div className="flex justify-between items-center border-b border-neutral-800 pb-4">
              <div>
                <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-3 py-1 rounded-full uppercase font-extrabold tracking-widest">
                  Developer Data Inspector
                </span>
                <h2 className="text-xl font-black text-white mt-1">Modifying: {activeRestaurant.name}</h2>
                <p className="text-[11px] text-neutral-400 font-mono">UUID: {activeRestaurant.id}</p>
              </div>
              <button 
                onClick={() => setActiveRestaurant(null)}
                className="bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold"
              >
                Close Inspector ✕
              </button>
            </div>

            {/* Quick Plan Override Modifier */}
            <div className="flex items-center justify-between bg-neutral-950 p-4 rounded-2xl border border-neutral-800 text-xs">
              <span className="font-bold text-neutral-300">Developer Tier Override:</span>
              <div className="flex space-x-2">
                {['Standard', 'Pro', 'Pro+'].map((tier) => (
                  <button 
                    key={tier}
                    onClick={() => handleUpdatePlan(activeRestaurant.id, tier)}
                    className={`px-3 py-1.5 rounded-xl font-black uppercase transition ${activeRestaurant.plan === tier ? 'bg-orange-500 text-white' : 'bg-neutral-900 text-neutral-400 hover:text-white'}`}
                  >
                    {tier}
                  </button>
                ))}
              </div>
            </div>

            {/* Inspector Tabs */}
            <div className="flex space-x-2 border-b border-neutral-800 pb-3">
              <button onClick={() => setInspectTab('menu')} className={`px-4 py-2 rounded-xl text-xs font-bold ${inspectTab === 'menu' ? 'bg-red-600 text-white' : 'bg-neutral-950 text-neutral-400'}`}>
                🍔 Menu Items ({restaurantMenu.length})
              </button>
              <button onClick={() => setInspectTab('staff')} className={`px-4 py-2 rounded-xl text-xs font-bold ${inspectTab === 'staff' ? 'bg-red-600 text-white' : 'bg-neutral-950 text-neutral-400'}`}>
                👥 Staff Credentials ({restaurantStaff.length})
              </button>
              <button onClick={() => setInspectTab('orders')} className={`px-4 py-2 rounded-xl text-xs font-bold ${inspectTab === 'orders' ? 'bg-red-600 text-white' : 'bg-neutral-950 text-neutral-400'}`}>
                🔥 Orders Queue ({restaurantOrders.length})
              </button>
            </div>

            {/* Inspector Tab Content */}
            <div className="bg-neutral-950 p-4 rounded-2xl border border-neutral-800 max-h-80 overflow-y-auto">
              {inspectTab === 'menu' && (
                <div className="space-y-2">
                  {restaurantMenu.length === 0 ? <p className="text-xs text-neutral-500">No menu items found.</p> : restaurantMenu.map(item => (
                    <div key={item.id} className="flex justify-between items-center text-xs bg-neutral-900 p-3 rounded-xl border border-neutral-800">
                      <div>
                        <span className="font-bold text-white">{item.name}</span>
                        <span className="text-emerald-400 font-mono ml-3">₹{item.price}</span>
                      </div>
                      <button onClick={() => handleDeveloperDeleteMenuItem(item.id)} className="text-red-400 hover:text-red-300 font-bold">Delete 🗑️</button>
                    </div>
                  ))}
                </div>
              )}

              {inspectTab === 'staff' && (
                <div className="space-y-2">
                  {restaurantStaff.length === 0 ? <p className="text-xs text-neutral-500">No staff accounts found.</p> : restaurantStaff.map(staff => (
                    <div key={staff.id} className="flex justify-between items-center text-xs bg-neutral-900 p-3 rounded-xl border border-neutral-800">
                      <div>
                        <span className="font-bold text-white">{staff.name}</span> ({staff.role})
                        <span className="text-orange-400 font-mono ml-3">ID: {staff.user_id} | Pass: {staff.password}</span>
                      </div>
                      <button onClick={() => handleDeveloperDeleteStaff(staff.id)} className="text-red-400 hover:text-red-300 font-bold">Revoke 🗑️</button>
                    </div>
                  ))}
                </div>
              )}

              {inspectTab === 'orders' && (
                <div className="space-y-2">
                  {restaurantOrders.length === 0 ? <p className="text-xs text-neutral-500">No orders found.</p> : restaurantOrders.map(order => (
                    <div key={order.id} className="flex justify-between items-center text-xs bg-neutral-900 p-3 rounded-xl border border-neutral-800">
                      <div>
                        <span className="font-bold text-white">Table {order.table_number}</span> ({order.status})
                        <span className="text-emerald-400 font-mono ml-3">₹{order.total_amount}</span>
                      </div>
                      <span className="text-neutral-500">{new Date(order.created_at).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* MASTER PARTNERS TABLE */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-800 text-[10px] text-neutral-400 uppercase tracking-widest bg-neutral-950/50">
                  <th className="p-4 w-12 text-center">
                    <input 
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleSelectAll}
                      className="w-4 h-4 accent-red-600 rounded cursor-pointer"
                    />
                  </th>
                  <th className="p-4 font-bold">Restaurant Name</th>
                  <th className="p-4 font-bold">Contact Info</th>
                  <th className="p-4 font-bold">Plan & Tier</th>
                  <th className="p-4 font-bold">Status</th>
                  <th className="p-4 font-bold text-right">Developer Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-neutral-400">Loading master database...</td>
                  </tr>
                ) : filteredRestaurants.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-neutral-400">No restaurant partners found.</td>
                  </tr>
                ) : (
                  filteredRestaurants.map((restaurant) => {
                    const isSelected = selectedIds.includes(restaurant.id)
                    return (
                      <tr key={restaurant.id} className={`hover:bg-neutral-800/35 transition ${isSelected ? 'bg-red-950/10' : ''}`}>
                        <td className="p-4 text-center">
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(restaurant.id)}
                            className="w-4 h-4 accent-red-600 rounded cursor-pointer"
                          />
                        </td>
                        <td className="p-4 font-bold text-white">
                          {restaurant.name}
                          <p className="text-[10px] text-neutral-500 font-mono mt-0.5">ID: {restaurant.id}</p>
                        </td>
                        <td className="p-4">
                          <p className="text-neutral-300">{restaurant.email}</p>
                          <p className="text-[10px] text-neutral-500 font-mono">+91 {restaurant.phone || 'N/A'}</p>
                        </td>
                        <td className="p-4">
                          <span className="bg-neutral-800 text-amber-400 px-2.5 py-1 rounded-lg text-[11px] font-black uppercase">
                            {restaurant.plan || 'Standard'}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {restaurant.subscription_status || 'Active'}
                          </span>
                        </td>
                        <td className="p-4 text-right space-x-2">
                          <button 
                            onClick={() => handleOpenInspector(restaurant)}
                            className="bg-orange-500/10 hover:bg-orange-500 text-orange-400 hover:text-white border border-orange-500/30 px-3 py-1.5 rounded-xl font-bold transition"
                          >
                            Manage Data ⚙️
                          </button>
                          <button 
                            onClick={() => router.push(`/dashboard/${restaurant.id}`)}
                            className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-3 py-1.5 rounded-xl font-bold transition"
                          >
                            Dashboard 👁️
                          </button>
                          <button 
                            onClick={() => handleDeleteRestaurant(restaurant.id, restaurant.name)}
                            className="bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white px-3 py-1.5 rounded-xl font-bold transition"
                          >
                            Delete 🗑️
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* WEBSITE STATUS TOGGLE SECTION (WORKING / NOT WORKING) */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl">
          <div className="space-y-1 text-center md:text-left">
            <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-3 py-1 rounded-full uppercase font-extrabold tracking-widest">
              Platform Maintenance Switch
            </span>
            <h2 className="text-lg font-black text-white mt-1">Website Operational Status</h2>
            <p className="text-xs text-neutral-400">
              Control whether the website is live (Working) or suspended/offline (Not Working) for public visitors.
            </p>
          </div>

          <div className="flex items-center space-x-3 bg-neutral-950 p-2 rounded-2xl border border-neutral-800">
            <button
              onClick={() => handleUpdateWebsiteStatus('Working')}
              disabled={updatingStatus}
              className={`px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition ${
                siteStatus === 'Working'
                  ? 'bg-emerald-500 text-neutral-950 shadow-lg shadow-emerald-500/20'
                  : 'bg-neutral-900 text-neutral-400 hover:text-white'
              }`}
            >
              🟢 Working
            </button>
            <button
              onClick={() => handleUpdateWebsiteStatus('Not Working')}
              disabled={updatingStatus}
              className={`px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition ${
                siteStatus === 'Not Working'
                  ? 'bg-red-600 text-white shadow-lg shadow-red-600/20'
                  : 'bg-neutral-900 text-neutral-400 hover:text-white'
              }`}
            >
              🔴 Not Working
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}