'use client'

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const SESSION_STORAGE_KEY = 'digital-dine-staff-session'

const EMPTY_DISH = {
  name: '', price: '', original_price: '', offer_price: '', category: '',
  description: '', image_url: '', food_type: 'veg', reorder_mode: 'auto', addons: ''
}
const EMPTY_OFFER = {
  title: '', description: '', discount_text: '', original_price: '',
  offer_price: '', offer_date: new Date().toLocaleDateString('en-CA'), image_url: ''
}

const money = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`

function Input({ label, value, onChange, type = 'text', placeholder = '' }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-black uppercase text-neutral-400">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500"
      />
    </div>
  )
}

function Stat({ title, value, accent = 'text-white' }) {
  return (
    <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
      <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">{title}</p>
      <p className={`mt-2 text-2xl font-black ${accent}`}>{value}</p>
    </div>
  )
}

function RestaurantChatWidget({ restaurantId }) {
  const AI_CATEGORIES = [
    '🔐 Login / Account',
    '🍔 Menu / Food Items',
    '🧾 Billing / GST',
    '💳 Razorpay / Payment',
    '📱 QR Menu / Ordering',
    '👨‍🍳 Kitchen / Orders',
    '👨‍💼 Waiter',
    '📦 Delivery',
    '💰 Subscription',
    '🐛 Technical Problem',
    '⚙️ Other',
  ]

  const [isOpen, setIsOpen] = useState(false)
  const [supportMode, setSupportMode] = useState('ai')
  const [session, setSession] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [aiMessages, setAiMessages] = useState([])
  const [aiIssueCategory, setAiIssueCategory] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const chatEndRef = useRef(null)
  const aiEndRef = useRef(null)
  const pollRef = useRef(null)
  const mountedRef = useRef(false)
  const sessionIdRef = useRef(null)
  const aiStartedRef = useRef(false)

  const mergeMessage = (message) => {
    if (!message?.id) return
    setMessages((current) => {
      if (current.some((item) => String(item.id) === String(message.id))) {
        return current
      }
      return [...current, message].sort(
        (a, b) =>
          new Date(a.created_at || 0).getTime() -
          new Date(b.created_at || 0).getTime()
      )
    })
  }

  const mergeAiMessage = (role, text) => {
    const clean = String(text || '').trim()
    if (!clean) return
    setAiMessages((current) => [
      ...current,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        role,
        text: clean,
      },
    ])
  }

  const loadSupportChat = async (createIfMissing = false) => {
    if (!restaurantId) return
    if (createIfMissing) setLoading(true)

    try {
      if (createIfMissing) {
        const { data: created, error: createError } = await supabase.rpc(
          'create_support_chat_session',
          { p_restaurant_id: String(restaurantId) }
        )

        if (createError) throw createError
        if (created?.success === false) {
          throw new Error(
            created?.message || 'Unable to start support chat.'
          )
        }

        if (created?.session) {
          sessionIdRef.current = String(created.session.id)
          setSession(created.session)
        }
      }

      const { data, error } = await supabase.rpc('get_support_chat_state', {
        p_restaurant_id: String(restaurantId),
      })

      if (error) throw error
      if (data?.success === false) {
        throw new Error(
          data?.message || 'Unable to load support chat.'
        )
      }

      const nextSession = data?.session || null
      sessionIdRef.current = nextSession?.id
        ? String(nextSession.id)
        : null

      setSession(nextSession)
      setMessages(Array.isArray(data?.messages) ? data.messages : [])

      if (nextSession?.ai_issue_category && !aiIssueCategory) {
        setAiIssueCategory(String(nextSession.ai_issue_category))
      }
    } catch (error) {
      console.error('Restaurant support chat error:', error)
    } finally {
      if (createIfMissing) setLoading(false)
    }
  }

  const startAiChat = () => {
    if (aiStartedRef.current) return

    aiStartedRef.current = true
    setAiMessages([
      {
        id: `ai-start-${Date.now()}`,
        role: 'assistant',
        text:
          "👋 Hi! I'm Digital Dining AI Support. I'll first understand your problem and try to guide you. Please choose the issue you are facing.",
      },
    ])
  }

  useEffect(() => {
    if (!isOpen || !restaurantId) return undefined

    mountedRef.current = true

    if (supportMode === 'ai') {
      startAiChat()
    }

    if (supportMode === 'human') {
      loadSupportChat(!sessionIdRef.current)
    } else if (sessionIdRef.current) {
      loadSupportChat(false)
    }

    const channel = supabase
      .channel(`restaurant-support-chat-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          if (!mountedRef.current) return

          if (
            payload?.new?.support_session_id &&
            sessionIdRef.current &&
            String(payload.new.support_session_id) !==
              String(sessionIdRef.current)
          ) {
            return
          }

          mergeMessage(payload.new)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'support_chat_sessions',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          if (sessionIdRef.current) {
            loadSupportChat(false)
          }
        }
      )
      .subscribe()

    pollRef.current = window.setInterval(() => {
      if (
        document.visibilityState === 'visible' &&
        sessionIdRef.current
      ) {
        loadSupportChat(false)
      }
    }, 2000)

    return () => {
      mountedRef.current = false

      if (pollRef.current) {
        window.clearInterval(pollRef.current)
        pollRef.current = null
      }

      supabase.removeChannel(channel)
    }
  }, [isOpen, restaurantId, supportMode])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    aiEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [aiMessages])

  const handleOpen = async () => {
    setIsOpen(true)
    setSupportMode(session?.status === 'connected' ? 'human' : 'ai')
  }

  const askAi = async (conversation, issueCategory, stage = 'conversation') => {
    setAiLoading(true)

    try {
      const response = await fetch('/api/ai-support-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: conversation.slice(-20).map((item) => ({
            role: item.role === 'assistant' ? 'assistant' : 'user',
            content: String(item.text || ''),
          })),
          issueCategory: String(issueCategory || ''),
          stage: String(stage || 'conversation'),
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(
          data?.message || 'AI support is temporarily unavailable.'
        )
      }

      const reply = String(data?.reply || '').trim()

      if (!reply) {
        throw new Error('AI support returned an empty response.')
      }

      mergeAiMessage('assistant', reply)
    } catch (error) {
      console.error('AI support error:', error)

      mergeAiMessage(
        'assistant',
        'I could not complete the AI support response right now. You can connect directly to Admin using the button below.'
      )
    } finally {
      setAiLoading(false)
    }
  }

  const handleAiCategory = async (category) => {
    if (aiLoading) return

    setAiIssueCategory(category)

    const nextMessages = [
      ...aiMessages,
      {
        role: 'user',
        text: category,
      },
    ]

    setAiMessages(nextMessages)

    await askAi(nextMessages, category, 'category_selected')
  }

  const handleAiSend = async (event) => {
    event.preventDefault()

    const text = newMessage.trim()
    if (!text || aiLoading) return

    const nextMessages = [
      ...aiMessages,
      {
        role: 'user',
        text,
      },
    ]

    setNewMessage('')
    setAiMessages(nextMessages)

    await askAi(nextMessages, aiIssueCategory)
  }

  const connectAiToAdmin = async () => {
    if (!restaurantId) return

    const transcript = aiMessages
      .slice(-30)
      .map((item) => ({
        role: item.role === 'assistant' ? 'assistant' : 'user',
        text: String(item.text || '').slice(0, 2000),
      }))

    const meaningfulUserMessages = transcript
      .filter((item) => item.role === 'user')
      .slice(-6)
      .map((item) => item.text)

    const aiSummary = [
      aiIssueCategory
        ? `Issue category: ${aiIssueCategory}`
        : 'Issue category: General Support',
      meaningfulUserMessages.length
        ? `Restaurant messages: ${meaningfulUserMessages.join(' | ')}`
        : 'The restaurant selected an issue category and requested Admin help.',
    ].join('\n')

    setLoading(true)

    try {
      const { data, error } = await supabase.rpc(
        'create_ai_support_escalation',
        {
          p_restaurant_id: String(restaurantId),
          p_issue_category: String(
            aiIssueCategory || '🤖 AI Support / General'
          ),
          p_ai_summary: aiSummary.slice(0, 4000),
          p_ai_transcript: transcript,
        }
      )

      if (error) throw error

      if (data?.success === false) {
        throw new Error(
          data?.message || 'Unable to connect to Admin.'
        )
      }

      const nextSession = data?.session || null
      if (!nextSession?.id) {
        throw new Error('Admin support session was not created.')
      }

      sessionIdRef.current = String(nextSession.id)
      setSession(nextSession)
      setMessages([])
      setSupportMode('human')

      await loadSupportChat(false)

      mergeAiMessage(
        'assistant',
        nextSession.status === 'connected'
          ? '🟢 Admin is already connected. You can continue in the Admin chat.'
          : '✅ Your AI support summary has been sent to Admin. Please wait for Admin to accept the live chat.'
      )
    } catch (error) {
      console.error('AI support escalation error:', error)

      alert(
        `Unable to connect to Admin: ${
          error?.message || 'Please try again.'
        }`
      )
    } finally {
      setLoading(false)
    }
  }

  const startHumanSupport = async () => {
    setSupportMode('human')
  }

  const handleSendMessage = async (event) => {
    event.preventDefault()

    const message = newMessage.trim()
    const sessionId = sessionIdRef.current

    if (!message || !restaurantId || !sessionId) return

    if (
      String(session?.status || '').toLowerCase() !==
      'connected'
    ) {
      alert('Please wait until Admin accepts the support chat.')
      return
    }

    setSending(true)

    try {
      const { data, error } = await supabase.rpc(
        'support_chat_send_message',
        {
          p_restaurant_id: String(restaurantId),
          p_session_id: String(sessionId),
          p_sender: 'restaurant',
          p_message: message,
        }
      )

      if (error) throw error

      if (data?.success === false) {
        throw new Error(
          data?.message || 'Unable to send message.'
        )
      }

      setNewMessage('')

      if (data?.message) {
        mergeMessage(data.message)
      }
    } catch (error) {
      console.error('Support message send error:', error)

      alert(
        `Unable to send message: ${
          error.message || 'Please try again.'
        }`
      )
    } finally {
      setSending(false)
    }
  }

  const status = String(session?.status || '').toLowerCase()
  const isConnected = status === 'connected'
  const isPending = status === 'pending'
  const isClosed = status === 'closed'

  return (
    <div className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-2 z-[60] max-w-[calc(100svw-1rem)] font-sans sm:bottom-6 sm:right-6">
      {!isOpen ? (
        <button
          onClick={handleOpen}
          className="bg-orange-500 hover:bg-orange-600 text-white font-black p-4 rounded-full shadow-2xl flex items-center space-x-2 transition transform hover:scale-105"
        >
          <span>💬</span>
          <span className="text-xs uppercase tracking-wider pr-1">
            Support Chat
          </span>
        </button>
      ) : (
        <div className="flex h-[560px] max-h-[70dvh] w-[calc(100svw-1rem)] max-w-[390px] flex-col overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900 shadow-2xl">
          <div className="bg-neutral-950 p-4 border-b border-neutral-800">
            <div className="flex justify-between items-start gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      supportMode === 'ai'
                        ? 'bg-violet-400 animate-pulse'
                        : isConnected
                          ? 'bg-emerald-500 animate-pulse'
                          : isPending
                            ? 'bg-yellow-400 animate-pulse'
                            : 'bg-neutral-600'
                    }`}
                  />
                  <h3 className="text-xs font-black text-white uppercase tracking-wider">
                    Digital Dining Support
                  </h3>
                </div>

                <p
                  className={`text-[10px] mt-1 font-bold ${
                    supportMode === 'ai'
                      ? 'text-violet-400'
                      : isConnected
                        ? 'text-emerald-400'
                        : isPending
                          ? 'text-yellow-400'
                          : 'text-neutral-500'
                  }`}
                >
                  {supportMode === 'ai'
                    ? '🤖 AI Support Assistant'
                    : loading
                      ? 'Connecting...'
                      : isConnected
                        ? '🟢 Live Chat Connected'
                        : isPending
                          ? '⏳ Waiting for Admin to Accept'
                          : isClosed
                            ? 'Chat closed'
                            : 'Admin Support'}
                </p>
              </div>

              <button
                onClick={() => setIsOpen(false)}
                className="text-neutral-400 hover:text-white font-bold text-sm px-2 py-1"
                aria-label="Close support chat"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <button
                type="button"
                onClick={() => setSupportMode('ai')}
                className={`rounded-xl py-2 text-[10px] font-black uppercase border transition ${
                  supportMode === 'ai'
                    ? 'bg-violet-500 text-white border-violet-400'
                    : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
                }`}
              >
                🤖 AI Assistant
              </button>

              <button
                type="button"
                onClick={startHumanSupport}
                className={`rounded-xl py-2 text-[10px] font-black uppercase border transition ${
                  supportMode === 'human'
                    ? 'bg-orange-500 text-white border-orange-400'
                    : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:text-white'
                }`}
              >
                👤 Admin Support
              </button>
            </div>
          </div>

          {supportMode === 'ai' ? (
            <>
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-neutral-950/50">
                {aiMessages.length === 0 ? (
                  <div className="text-center mt-12 text-xs text-neutral-500">
                    Starting AI support...
                  </div>
                ) : (
                  aiMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${
                        msg.role === 'user'
                          ? 'justify-end'
                          : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-xs leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-violet-500 text-white rounded-br-none'
                            : 'bg-neutral-800 text-neutral-200 rounded-bl-none border border-neutral-700'
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))
                )}

                {!aiIssueCategory && (
                  <div className="space-y-2 pt-2">
                    <p className="text-[9px] text-neutral-500 uppercase font-black tracking-wider">
                      Choose the issue you are facing
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {AI_CATEGORIES.map((category) => (
                        <button
                          type="button"
                          key={category}
                          onClick={() => handleAiCategory(category)}
                          disabled={aiLoading}
                          className="text-left bg-neutral-900 border border-neutral-800 hover:border-violet-500/50 text-neutral-300 px-3 py-2 rounded-xl text-[9px] font-bold disabled:opacity-50"
                        >
                          {category}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div ref={aiEndRef} />
              </div>

              <div className="border-t border-neutral-800 bg-neutral-950 p-3 space-y-2">
                <button
                  type="button"
                  onClick={connectAiToAdmin}
                  disabled={loading}
                  className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-black py-2.5 rounded-xl text-[10px] uppercase tracking-wider"
                >
                  {loading
                    ? 'Connecting...'
                    : '🛟 Connect to Admin'}
                </button>

                <form
                  onSubmit={handleAiSend}
                  className="flex space-x-2"
                >
                  <input
                    type="text"
                    placeholder={
                      aiLoading
                        ? 'AI is responding...'
                        : aiIssueCategory
                          ? 'Describe the problem...'
                          : 'Choose an issue first...'
                    }
                    value={newMessage}
                    onChange={(e) =>
                      setNewMessage(e.target.value)
                    }
                    disabled={aiLoading || !aiIssueCategory}
                    className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-violet-500 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={
                      aiLoading ||
                      !aiIssueCategory ||
                      !newMessage.trim()
                    }
                    className="bg-violet-500 hover:bg-violet-600 disabled:opacity-40 text-white font-black px-4 py-2.5 rounded-xl text-xs"
                  >
                    {aiLoading ? '...' : 'Send'}
                  </button>
                </form>
              </div>
            </>
          ) : (
            <>
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-neutral-950/50">
                {!isConnected && messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-center px-5">
                    <div>
                      <div className="text-4xl mb-3">
                        {isPending
                          ? '⏳'
                          : isClosed
                            ? '💬'
                            : '🛎️'}
                      </div>

                      <p className="text-sm font-black text-white">
                        {isPending
                          ? 'Support request sent'
                          : isClosed
                            ? 'Support chat is closed'
                            : 'Admin Support'}
                      </p>

                      <p className="text-[11px] text-neutral-500 mt-2 leading-relaxed">
                        {isPending
                          ? 'Your request is with Admin. The live chat becomes available after Admin accepts it.'
                          : isClosed
                            ? 'Open Support Chat again to create another request.'
                            : 'Opening Admin Support sends a support request to Admin.'}
                      </p>
                    </div>
                  </div>
                ) : messages.length === 0 ? (
                  <p className="text-center text-xs text-neutral-500 mt-12">
                    Live chat connected. Send a message to Admin.
                  </p>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${
                        msg.sender === 'restaurant'
                          ? 'justify-end'
                          : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-[78%] px-4 py-2.5 rounded-2xl text-xs leading-relaxed ${
                          msg.sender === 'restaurant'
                            ? 'bg-orange-500 text-white rounded-br-none'
                            : 'bg-neutral-800 text-neutral-200 rounded-bl-none border border-neutral-700'
                        }`}
                      >
                        <div>{msg.message}</div>
                        {msg.created_at && (
                          <div className="text-[8px] opacity-60 mt-1">
                            {new Date(
                              msg.created_at
                            ).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>

              <form
                onSubmit={handleSendMessage}
                className="p-3 bg-neutral-950 border-t border-neutral-800 flex space-x-2"
              >
                <input
                  type="text"
                  placeholder={
                    isConnected
                      ? 'Type your message...'
                      : 'Waiting for Admin acceptance...'
                  }
                  value={newMessage}
                  onChange={(e) =>
                    setNewMessage(e.target.value)
                  }
                  disabled={!isConnected || sending}
                  className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-orange-500 disabled:opacity-50"
                />

                <button
                  type="submit"
                  disabled={
                    !isConnected ||
                    sending ||
                    !newMessage.trim()
                  }
                  className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black px-4 py-2.5 rounded-xl text-xs transition"
                >
                  {sending ? '...' : 'Send'}
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function RestaurantManagerDashboard({ params }) {
  const routeParams = use(params)
  const restaurantId = routeParams?.restaurantId || routeParams?.id

  const [authenticated, setAuthenticated] = useState(false)
  const [manager, setManager] = useState(null)

  // Manager Profile
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [restaurantCode, setRestaurantCode] = useState('')
  const [loginUserId, setLoginUserId] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // /app staff session. The manager password is never stored in localStorage.
  const [sessionToken, setSessionToken] = useState('')
  const [sessionMode, setSessionMode] = useState(false)
  const [sessionChecking, setSessionChecking] = useState(true)

  const sessionTokenRef = useRef('')
  const sessionModeRef = useRef(false)
  const restaurantCodeRef = useRef('')
  const loginUserIdRef = useRef('')
  const loginPasswordRef = useRef('')

  const [restaurant, setRestaurant] = useState(null)
  const [menuItems, setMenuItems] = useState([])
  const [dailyOffers, setDailyOffers] = useState([])
  const [orders, setOrders] = useState([])
  const [restaurantTables, setRestaurantTables] = useState([])
  const [staffList, setStaffList] = useState([])
  const [activeTab, setActiveTab] = useState('home')
  const [dashboardMode, setDashboardMode] = useState('restaurant')
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')

  const [dish, setDish] = useState(EMPTY_DISH)
  const [editingDishId, setEditingDishId] = useState(null)
  const [savingDish, setSavingDish] = useState(false)

  const [offer, setOffer] = useState(EMPTY_OFFER)
  const [editingOfferId, setEditingOfferId] = useState(null)
  const [savingOffer, setSavingOffer] = useState(false)

  const [staffName, setStaffName] = useState('')
  const [staffUserId, setStaffUserId] = useState('')
  const [staffPassword, setStaffPassword] = useState('')
  const [staffRole, setStaffRole] = useState('waiter')
  const [savingStaff, setSavingStaff] = useState(false)

  const [reportTimeframe, setReportTimeframe] = useState('daily')
  const [swiggyDataInput, setSwiggyDataInput] = useState('')
  const [syncingSwiggy, setSyncingSwiggy] = useState(false)
  const [storeOpen, setStoreOpen] = useState(true)

  const notify = (message) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3500)
  }

  const clearSavedManagerSession = useCallback(() => {
    if (typeof window === 'undefined') return
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY)
    } catch (error) {
      console.error('Unable to clear manager session:', error)
    }
  }, [])

  const fetchDashboard = useCallback(async () => {
    if (!restaurantId) return

    const usingSession = Boolean(sessionModeRef.current && sessionTokenRef.current)
    const code = String(restaurantCodeRef.current || '').trim()
    const user = String(loginUserIdRef.current || '').trim().toLowerCase()
    const pass = String(loginPasswordRef.current || '').trim()

    if (!usingSession && (!code || !user || !pass)) return

    setLoading(true)
    try {
      let dashboardResult

      if (usingSession) {
        dashboardResult = await supabase.rpc('get_manager_dashboard_data_session', {
          p_session_token: sessionTokenRef.current,
        })
      } else {
        dashboardResult = await supabase.rpc('get_manager_dashboard_data', {
          p_restaurant_id: String(restaurantId),
          p_restaurant_code: code,
          p_user_id: user,
          p_password: pass,
        })
      }

      const { data, error } = dashboardResult
      if (error) throw error

      if (!data?.success) {
        if (usingSession) {
          clearSavedManagerSession()
          sessionTokenRef.current = ''
          sessionModeRef.current = false
          setSessionToken('')
          setSessionMode(false)
          setAuthenticated(false)
        }
        throw new Error(data?.message || 'Unable to load manager dashboard.')
      }

      if (data.restaurantId && String(data.restaurantId) !== String(restaurantId)) {
        throw new Error('This manager session belongs to another restaurant.')
      }

      setRestaurant(data.restaurant || null)
      setMenuItems(Array.isArray(data.menuItems) ? data.menuItems : [])
      setDailyOffers(Array.isArray(data.dailyOffers) ? data.dailyOffers : [])
      setOrders(Array.isArray(data.orders) ? data.orders : [])
      setStaffList(Array.isArray(data.staffList) ? data.staffList : [])
      setStoreOpen(data.restaurant?.is_open ?? true)

      let tableResponse
      if (usingSession) {
        tableResponse = await supabase.rpc('get_manager_table_inventory_session', {
          p_session_token: sessionTokenRef.current,
        })
      } else {
        tableResponse = await supabase.rpc('get_manager_table_inventory', {
          p_restaurant_id: String(restaurantId),
          p_restaurant_code: code,
          p_user_id: user,
          p_password: pass,
        })
      }

      const { data: tableResult, error: tableError } = tableResponse
      if (tableError) {
        console.error('Manager table inventory error:', tableError)
      } else if (tableResult?.success) {
        setRestaurantTables(Array.isArray(tableResult.tables) ? tableResult.tables : [])
      }
    } catch (error) {
      console.error('Manager dashboard loading error:', error)
      setNotice(`Loading issue: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }, [restaurantId, clearSavedManagerSession])

  const managerRpcAction = useCallback(async (action, payload = {}) => {
    const usingSession = Boolean(sessionModeRef.current && sessionTokenRef.current)
    const code = String(restaurantCodeRef.current || '').trim()
    const user = String(loginUserIdRef.current || '').trim().toLowerCase()
    const pass = String(loginPasswordRef.current || '').trim()

    if (!restaurantId || (!usingSession && (!code || !user || !pass))) {
      throw new Error('Manager session is missing. Please sign in again.')
    }

    let response
    if (usingSession) {
      response = await supabase.rpc('manager_action_session', {
        p_session_token: sessionTokenRef.current,
        p_action: action,
        p_payload: payload,
      })
    } else {
      response = await supabase.rpc('manager_action', {
        p_restaurant_id: String(restaurantId),
        p_restaurant_code: code,
        p_user_id: user,
        p_password: pass,
        p_action: action,
        p_payload: payload,
      })
    }

    const { data, error } = response
    if (error) throw error
    if (!data?.success) {
      if (usingSession) {
        clearSavedManagerSession()
        sessionTokenRef.current = ''
        sessionModeRef.current = false
        setSessionToken('')
        setSessionMode(false)
        setAuthenticated(false)
      }
      throw new Error(data?.message || 'Manager action failed.')
    }
    return data
  }, [restaurantId, clearSavedManagerSession])

  const handleLogin = async (event) => {
    event.preventDefault()
    if (!restaurantId || !restaurantCode.trim() || !loginUserId.trim() || !loginPassword.trim()) {
      alert('Enter the Restaurant Code, Manager User ID, and password.')
      return
    }

    setLoginLoading(true)
    try {
      const cleanCode = String(restaurantCode).trim()
      const cleanUser = String(loginUserId).trim().toLowerCase()
      const cleanPassword = String(loginPassword).trim()

      const { data, error } = await supabase.rpc('authenticate_staff_login', {
        p_restaurant_id: String(restaurantId),
        p_restaurant_code: cleanCode,
        p_user_id: cleanUser,
        p_password: cleanPassword,
        p_role: 'manager',
      })

      if (error) throw error
      if (!data?.success) throw new Error(data?.message || 'Invalid restaurant credentials.')
      if (String(data.restaurantId) !== String(restaurantId)) {
        throw new Error('These credentials do not belong to this restaurant.')
      }

      sessionTokenRef.current = ''
      sessionModeRef.current = false
      restaurantCodeRef.current = String(data.restaurantCode || cleanCode).trim()
      loginUserIdRef.current = cleanUser
      loginPasswordRef.current = cleanPassword

      setSessionToken('')
      setSessionMode(false)
      setManager(data.staff || null)
      setProfileName(String(data.staff?.name || data.staff?.user_id || ''))
      setRestaurantCode(restaurantCodeRef.current)
      setLoginUserId(cleanUser)
      setAuthenticated(true)

      await fetchDashboard()
    } catch (error) {
      console.error(error)
      setAuthenticated(false)
      alert(error.message || 'Unable to sign in.')
    } finally {
      setLoginLoading(false)
    }
  }

  // Restore the secure staff session created by /app.
  useEffect(() => {
    let active = true

    const restoreManagerSession = async () => {
      if (typeof window === 'undefined') return

      try {
        const rawSession = localStorage.getItem(SESSION_STORAGE_KEY)
        if (!rawSession) return

        let savedSession
        try {
          savedSession = JSON.parse(rawSession)
        } catch {
          clearSavedManagerSession()
          return
        }

        const token = String(savedSession?.sessionToken || '').trim()
        const role = String(savedSession?.role || '').trim().toLowerCase()
        const savedRestaurantId = String(savedSession?.restaurantId || '').trim()

        // Do not consume Waiter/Kitchen sessions or sessions for another restaurant.
        if (role !== 'manager' || savedRestaurantId !== String(restaurantId)) return
        if (!token) {
          clearSavedManagerSession()
          return
        }

        const { data, error } = await supabase.rpc('validate_staff_app_session', {
          p_session_token: token,
          p_required_role: 'manager',
        })

        if (error) throw error
        if (!data?.success) throw new Error(data?.message || 'Manager session expired.')
        if (String(data.restaurantId) !== String(restaurantId)) {
          throw new Error('This manager session belongs to another restaurant.')
        }
        if (!active) return

        const restoredCode = String(data.restaurantCode || savedSession.restaurantCode || '').trim()
        const restoredUser = String(data.userId || savedSession.userId || '').trim().toLowerCase()
        const restoredManager = savedSession?.staff || {
          user_id: restoredUser,
          name: savedSession?.staff?.name || restoredUser,
          role: 'manager',
          restaurant_id: String(restaurantId),
        }

        sessionTokenRef.current = token
        sessionModeRef.current = true
        restaurantCodeRef.current = restoredCode
        loginUserIdRef.current = restoredUser
        loginPasswordRef.current = ''

        setSessionToken(token)
        setSessionMode(true)
        setRestaurantCode(restoredCode)
        setLoginUserId(restoredUser)
        setLoginPassword('')
        setManager(restoredManager)
        setProfileName(String(restoredManager?.name || restoredUser))
        setAuthenticated(true)

        await fetchDashboard()
      } catch (error) {
        console.error('Manager session restore error:', error)
        clearSavedManagerSession()
        sessionTokenRef.current = ''
        sessionModeRef.current = false
        restaurantCodeRef.current = ''
        loginUserIdRef.current = ''
        loginPasswordRef.current = ''
        setSessionToken('')
        setSessionMode(false)
        setAuthenticated(false)
        setManager(null)
        setLoginPassword('')
      } finally {
        if (active) setSessionChecking(false)
      }
    }

    restoreManagerSession()
    return () => {
      active = false
    }
  }, [restaurantId, clearSavedManagerSession, fetchDashboard])

  useEffect(() => {
    if (!authenticated || !restaurantId) return undefined

    const channel = supabase
      .channel(`manager-live-orders-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          setOrders((current) => {
            if (current.some((order) => String(order.id) === String(payload.new.id))) {
              return current
            }
            return [payload.new, ...current]
          })
          setNotice('🔔 New order received')
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          setOrders((current) =>
            current.map((order) =>
              String(order.id) === String(payload.new.id) ? payload.new : order,
            ),
          )
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          setOrders((current) =>
            current.filter((order) => String(order.id) !== String(payload.old.id)),
          )
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('Live order subscription failed')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [authenticated, restaurantId])

  useEffect(() => {
    if (!authenticated) return undefined
    const interval = window.setInterval(fetchDashboard, 15000)
    return () => window.clearInterval(interval)
  }, [authenticated, fetchDashboard])

  // Subscription-wise feature control. plan_code is primary; legacy plan is fallback.
  const legacyPlan = String(restaurant?.plan || 'Standard')
  const legacyPlanCode =
    legacyPlan === 'Pro+'
      ? 'restaurant_resort_pro'
      : legacyPlan === 'Pro'
        ? 'restaurant_pro'
        : 'restaurant_standard'

  const currentPlanCode = String(restaurant?.plan_code || legacyPlanCode).toLowerCase()
  const PLAN_FEATURES = {
    restaurant_standard: { name: 'Restaurant Standard', legacyPlan: 'Standard', advanced: false, resort: false, advancedResort: false },
    restaurant_pro: { name: 'Restaurant Pro', legacyPlan: 'Pro', advanced: true, resort: false, advancedResort: false },
    restaurant_resort_standard: { name: 'Restaurant + Resort Standard', legacyPlan: 'Standard', advanced: false, resort: true, advancedResort: false },
    restaurant_resort_pro: { name: 'Restaurant + Resort Pro', legacyPlan: 'Pro+', advanced: true, resort: true, advancedResort: true },
  }
  const planFeatures = PLAN_FEATURES[currentPlanCode] || PLAN_FEATURES.restaurant_standard
  const currentPlan = planFeatures.legacyPlan
  const currentPlanDisplay = planFeatures.name
  const hasAdvancedAnalytics = planFeatures.advanced
  const hasAdvancedMenuControls = planFeatures.advanced
  const hasResortAccess = Boolean(planFeatures.resort)
  const hasAdvancedResort = Boolean(planFeatures.advancedResort)

  const planLimits = { Standard: 20, Pro: 50, 'Pro+': Infinity }
  const maxMenuAllowed = planLimits[currentPlan] ?? 20

  const getItemOrderCount = useCallback((item) => {
    return orders.reduce((total, order) => {
      if (order?.status === 'cancelled' || !Array.isArray(order?.items)) return total
      return total + order.items.reduce((count, orderedItem) => {
        const sameId = String(orderedItem?.id || '') === String(item?.id || '')
        const sameMenuId = String(orderedItem?.menu_item_id || '') === String(item?.id || '')
        const sameName = String(orderedItem?.name || '').trim().toLowerCase() === String(item?.name || '').trim().toLowerCase()
        return count + (sameId || sameMenuId || sameName ? Number(orderedItem?.qty || orderedItem?.quantity || 1) : 0)
      }, 0)
    }, 0)
  }, [orders])

  const automaticHighlyReorderedIds = useMemo(() => {
    const ranked = menuItems.map((item) => ({ id: item.id, count: getItemOrderCount(item) }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
    if (!ranked.length) return new Set()
    const topCount = Math.max(1, Math.ceil(ranked.length * 0.25))
    const threshold = ranked[topCount - 1]?.count || 0
    return new Set(ranked.filter((item) => item.count >= Math.max(5, threshold)).map((item) => item.id))
  }, [menuItems, getItemOrderCount])

  const isHighlyReordered = (item) => {
    if (item.reorder_mode === 'on') return true
    if (item.reorder_mode === 'off') return false
    return automaticHighlyReorderedIds.has(item.id)
  }

  const resetDish = () => {
    setDish(EMPTY_DISH)
    setEditingDishId(null)
  }

  const startEditDish = (item) => {
    setEditingDishId(item.id)
    setDish({
      name: item.name || '',
      price: item.price ?? '',
      original_price: item.original_price ?? '',
      offer_price: item.offer_price ?? '',
      category: item.category || '',
      description: item.description || '',
      image_url: item.image_url || '',
      food_type: item.food_type || (item.is_veg ? 'veg' : 'non-veg'),
      reorder_mode: item.reorder_mode || 'auto',
      addons: Array.isArray(item.addons) ? item.addons.join(', ') : ''
    })
    setActiveTab('menu')
  }

  const saveDish = async (event) => {
    event.preventDefault()
    const name = dish.name.trim()
    const price = Number(dish.price)
    if (!name || !Number.isFinite(price) || price <= 0) {
      alert('Enter a valid dish name and price.')
      return
    }
    if (!editingDishId && menuItems.length >= maxMenuAllowed) {
      alert(`Your ${currentPlan} plan allows ${maxMenuAllowed} menu items.`)
      return
    }

    const originalPrice = dish.original_price === '' ? null : Number(dish.original_price)
    const offerPrice = dish.offer_price === '' ? null : Number(dish.offer_price)
    if (originalPrice !== null && (!Number.isFinite(originalPrice) || originalPrice <= 0)) return alert('Enter a valid original price.')
    if (offerPrice !== null && (!Number.isFinite(offerPrice) || offerPrice <= 0)) return alert('Enter a valid offer price.')
    if (originalPrice !== null && offerPrice !== null && offerPrice >= originalPrice) return alert('Offer price must be lower than original price.')

    setSavingDish(true)
    const payload = {
      ...(editingDishId ? { id: editingDishId } : {}),
      name,
      price: offerPrice !== null ? offerPrice : price,
      original_price: originalPrice,
      offer_price: offerPrice,
      category: dish.category.trim() || 'Other',
      description: dish.description.trim(),
      image_url: dish.image_url.trim() || null,
      is_veg: dish.food_type === 'veg',
      food_type: dish.food_type,
      reorder_mode: dish.reorder_mode,
      addons: dish.addons.split(',').map((value) => value.trim()).filter(Boolean),
    }

    try {
      const result = await managerRpcAction('save_menu', payload)
      const saved = result.data
      if (editingDishId) setMenuItems((items) => items.map((item) => item.id === editingDishId ? saved : item))
      else setMenuItems((items) => [saved, ...items])
      resetDish()
      notify(editingDishId ? 'Dish updated successfully.' : 'Dish added successfully.')
    } catch (error) {
      console.error(error)
      alert(`Unable to save dish: ${error.message}`)
    } finally {
      setSavingDish(false)
    }
  }

  const deleteDish = async (item) => {
    if (!window.confirm(`Delete ${item.name}?`)) return
    try {
      await managerRpcAction('delete_menu', { id: item.id })
      setMenuItems((items) => items.filter((value) => value.id !== item.id))
      notify('Dish deleted.')
    } catch (error) {
      alert(`Unable to delete dish: ${error.message}`)
    }
  }

  const toggleAvailability = async (item) => {
    const next = item.is_available === false
    try {
      const result = await managerRpcAction('toggle_menu', { id: item.id, is_available: next })
      setMenuItems((items) => items.map((value) => value.id === item.id ? result.data : value))
    } catch (error) {
      alert(`Unable to update availability: ${error.message}`)
    }
  }

  const resetOffer = () => {
    setOffer({ ...EMPTY_OFFER, offer_date: new Date().toLocaleDateString('en-CA') })
    setEditingOfferId(null)
  }

  const saveOffer = async (event) => {
    event.preventDefault()
    if (!offer.title.trim() || !offer.offer_price || Number(offer.offer_price) <= 0) {
      alert('Enter an offer title and valid offer price.')
      return
    }

    setSavingOffer(true)
    const payload = {
      ...(editingOfferId ? { id: editingOfferId } : {}),
      title: offer.title.trim(),
      description: offer.description.trim(),
      discount_text: offer.discount_text.trim(),
      original_price: offer.original_price === '' ? null : Number(offer.original_price),
      offer_price: Number(offer.offer_price),
      offer_date: offer.offer_date,
      image_url: offer.image_url.trim() || null,
      is_active: true,
    }

    try {
      const result = await managerRpcAction('save_offer', payload)
      const saved = result.data
      if (editingOfferId) setDailyOffers((items) => items.map((item) => item.id === editingOfferId ? saved : item))
      else setDailyOffers((items) => [saved, ...items])
      resetOffer()
      notify(editingOfferId ? 'Offer updated.' : 'Offer created.')
    } catch (error) {
      console.error(error)
      alert(`Unable to save offer: ${error.message}`)
    } finally {
      setSavingOffer(false)
    }
  }

  const editOffer = (item) => {
    setEditingOfferId(item.id)
    setOffer({
      title: item.title || '',
      description: item.description || '',
      discount_text: item.discount_text || '',
      original_price: item.original_price ?? '',
      offer_price: item.offer_price ?? '',
      offer_date: item.offer_date || item.date || new Date().toLocaleDateString('en-CA'),
      image_url: item.image_url || ''
    })
  }

  const deleteOffer = async (item) => {
    if (!window.confirm(`Delete offer ${item.title}?`)) return
    try {
      await managerRpcAction('delete_offer', { id: item.id })
      setDailyOffers((items) => items.filter((value) => value.id !== item.id))
      notify('Offer deleted.')
    } catch (error) {
      alert(`Unable to delete offer: ${error.message}`)
    }
  }

  const toggleOffer = async (item) => {
    const next = item.is_active === false
    try {
      const result = await managerRpcAction('toggle_offer', { id: item.id, is_active: next })
      setDailyOffers((items) => items.map((value) => value.id === item.id ? result.data : value))
    } catch (error) {
      alert(`Unable to update offer: ${error.message}`)
    }
  }

  const saveStaff = async (event) => {
    event.preventDefault()
    const name = staffName.trim()
    const userId = staffUserId.trim().toLowerCase()
    const password = staffPassword.trim()
    if (!name || !userId || !password) return alert('Fill in all staff fields.')
    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(userId)) return alert('User ID must be 3–40 characters.')
    if (password.length < 4) return alert('Password/PIN must contain at least 4 characters.')

    setSavingStaff(true)
    try {
      const result = await managerRpcAction('create_staff', {
        name,
        user_id: userId,
        password,
        role: staffRole,
      })
      setStaffList((items) => [result.data, ...items])
      setStaffName('')
      setStaffUserId('')
      setStaffPassword('')
      notify(`${staffRole === 'waiter' ? 'Waiter' : 'Kitchen'} account created.`)
    } catch (error) {
      console.error(error)
      alert(`Unable to create staff account: ${error.message}`)
    } finally {
      setSavingStaff(false)
    }
  }

  const revokeStaff = async (staff) => {
    if (!window.confirm(`Revoke ${staff.name}'s account?`)) return
    try {
      await managerRpcAction('revoke_staff', { id: staff.id })
      setStaffList((items) => items.filter((item) => item.id !== staff.id))
      notify('Staff account revoked.')
    } catch (error) {
      alert(`Unable to revoke account: ${error.message}`)
    }
  }

  const updateOrderStatus = async (orderId, nextStatus) => {
    if (!orderId || !nextStatus) return
    try {
      const result = await managerRpcAction('update_order_status', { id: orderId, status: nextStatus })
      setOrders((items) => items.map((item) => String(item.id) === String(orderId) ? result.data : item))
      const selectedOrder = orders.find((item) => String(item.id) === String(orderId))
      notify(`Order #${selectedOrder?.order_number || String(orderId).slice(0, 8)} marked ${nextStatus}.`)
    } catch (error) {
      console.error('Order status update error:', error)
      alert(`Unable to update order: ${error.message || 'Unknown error'}`)
    }
  }

  const handleStoreToggle = async () => {
    const next = !storeOpen
    try {
      await managerRpcAction('toggle_store', { is_open: next })
      setStoreOpen(next)
      setRestaurant((value) => ({ ...value, is_open: next }))
      notify(next ? 'Restaurant is now open.' : 'Restaurant is now closed.')
    } catch (error) {
      alert(`Unable to update store status: ${error.message}`)
    }
  }

  const handleSwiggySync = async (event) => {
    event.preventDefault()
    if (!swiggyDataInput.trim()) return alert('Paste valid menu JSON data.')
    let items
    try {
      items = JSON.parse(swiggyDataInput)
      if (!Array.isArray(items)) throw new Error('JSON must be an array.')
    } catch (error) {
      return alert(`Invalid JSON: ${error.message}`)
    }

    setSyncingSwiggy(true)
    try {
      const rows = items.map((item) => ({
        name: String(item.name || '').trim(),
        price: Number(item.price || 0),
        category: item.category || 'Other',
        description: item.description || '',
        image_url: item.image_url || item.imageUrl || null,
        is_veg: Boolean(item.is_veg),
        food_type: item.food_type || (item.is_veg ? 'veg' : 'non-veg'),
        reorder_mode: item.reorder_mode || 'auto',
        addons: Array.isArray(item.addons) ? item.addons : [],
      })).filter((item) => item.name && item.price > 0)

      if (!rows.length) throw new Error('No valid menu items found.')
      const result = await managerRpcAction('import_menu', { items: rows })
      const imported = Array.isArray(result.data) ? result.data : []
      setMenuItems((current) => [...imported, ...current])
      setSwiggyDataInput('')
      notify(`${imported.length || rows.length} menu items imported.`)
    } catch (error) {
      console.error(error)
      alert(`Unable to sync menu: ${error.message}`)
    } finally {
      setSyncingSwiggy(false)
    }
  }

  const reportOrders = useMemo(() => {
    const now = new Date()
    const start = new Date(now)
    if (reportTimeframe === 'daily') start.setHours(0, 0, 0, 0)
    if (reportTimeframe === 'weekly') {
      const day = start.getDay()
      start.setDate(start.getDate() - (day === 0 ? 6 : day - 1))
      start.setHours(0, 0, 0, 0)
    }
    if (reportTimeframe === 'monthly') {
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
    }
    if (reportTimeframe === 'yearly') {
      start.setMonth(0, 1)
      start.setHours(0, 0, 0, 0)
    }
    return orders.filter((order) => order.status !== 'cancelled' && order.created_at && new Date(order.created_at) >= start)
  }, [orders, reportTimeframe])

  const reportStats = useMemo(() => {
    const sales = reportOrders.reduce((sum, order) => sum + Number(order.total_amount ?? order.total ?? 0), 0)
    return { orders: reportOrders.length, sales, average: reportOrders.length ? sales / reportOrders.length : 0 }
  }, [reportOrders])

  const hourlyData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, sales: 0 }))
    reportOrders.forEach((order) => {
      const hour = new Date(order.created_at).getHours()
      hours[hour].orders += 1
      hours[hour].sales += Number(order.total_amount ?? order.total ?? 0)
    })
    return hours.filter((item) => item.orders > 0)
  }, [reportOrders])

  const peakHour = useMemo(() => {
    if (!hourlyData.length) return null
    return [...hourlyData].sort((a, b) => b.orders - a.orders || b.sales - a.sales)[0]
  }, [hourlyData])

  const totalRevenue = useMemo(() => orders.filter((order) => order.status !== 'cancelled').reduce((sum, order) => sum + Number(order.total_amount ?? order.total ?? 0), 0), [orders])
  const todayOrders = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return orders.filter((order) => order.created_at && new Date(order.created_at) >= start && order.status !== 'cancelled')
  }, [orders])
  const activeOrders = useMemo(() => orders.filter((order) => !['completed', 'cancelled', 'delivered'].includes(String(order.status || '').toLowerCase())), [orders])

  const configuredTableNumbers = useMemo(() => [...new Set(
    restaurantTables.map((table, index) => String(table?.table_number ?? table?.number ?? table?.table_no ?? table?.name ?? (index + 1)).trim()).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })), [restaurantTables])

  const occupiedTableNumbers = useMemo(() => {
    const occupied = new Set()
    activeOrders.forEach((order) => {
      const number = String(order?.table_number ?? '').trim()
      if (!number) return
      const mode = String(order?.dining_mode ?? order?.order_type ?? 'dine-in').trim().toLowerCase()
      if (!['parcel', 'takeaway', 'take-away', 'delivery'].some((item) => mode.includes(item))) occupied.add(number)
    })
    return occupied
  }, [activeOrders])

  const occupiedTableCount = useMemo(() => configuredTableNumbers.filter((number) => occupiedTableNumbers.has(number)).length, [configuredTableNumbers, occupiedTableNumbers])
  const availableTableCount = Math.max(0, configuredTableNumbers.length - occupiedTableCount)

  const downloadReport = () => {
    const rows = [
      ['Restaurant', restaurant?.name || ''],
      ['Report Period', reportTimeframe],
      ['Orders', reportStats.orders],
      ['Sales', reportStats.sales.toFixed(2)],
      ['Average Order Value', reportStats.average.toFixed(2)],
      ['Peak Hour', peakHour ? `${String(peakHour.hour).padStart(2, '0')}:00` : 'N/A'],
      [],
      ['Order ID', 'Date & Time', 'Payment Mode', 'Status', 'Amount'],
      ...reportOrders.map((order) => [
        order.id,
        new Date(order.created_at).toLocaleString('en-IN'),
        order.payment_mode || '',
        order.status || '',
        Number(order.total_amount ?? order.total ?? 0).toFixed(2)
      ])
    ]
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `restaurant-manager-${reportTimeframe}-${new Date().toLocaleDateString('en-CA')}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }


  const saveManagerProfile = async (event) => {
    event.preventDefault()

    const cleanName = String(profileName || '').trim()

    if (cleanName.length < 2 || cleanName.length > 80) {
      alert('Manager name must be between 2 and 80 characters.')
      return
    }

    setProfileSaving(true)

    try {
      const usingSession = Boolean(sessionModeRef.current && sessionTokenRef.current)
      const response = usingSession
        ? await supabase.rpc('staff_update_profile_session', {
            p_session_token: sessionTokenRef.current,
            p_name: cleanName,
          })
        : await supabase.rpc('staff_update_profile', {
            p_restaurant_id: String(restaurantId),
            p_restaurant_code: String(restaurantCodeRef.current).trim(),
            p_user_id: String(loginUserIdRef.current).trim().toLowerCase(),
            p_password: String(loginPasswordRef.current).trim(),
            p_role: 'manager',
            p_name: cleanName,
          })

      const { data, error } = response

      if (error) throw error
      if (!data?.success) {
        throw new Error(data?.message || 'Unable to update profile.')
      }

      const updatedStaff = data.staff || { ...manager, name: cleanName }
      setManager(updatedStaff)
      setProfileName(String(updatedStaff.name || cleanName))
      setStaffList((current) =>
        current.map((item) =>
          String(item.id) === String(updatedStaff.id)
            ? { ...item, name: updatedStaff.name }
            : item
        )
      )
      setProfileOpen(false)
      notify('Profile updated successfully. ✅')
    } catch (error) {
      console.error('Manager profile update error:', error)
      alert(`Unable to update profile: ${error.message || 'Please try again.'}`)
    } finally {
      setProfileSaving(false)
    }
  }

  const logout = () => {
    if (sessionModeRef.current) clearSavedManagerSession()

    sessionTokenRef.current = ''
    sessionModeRef.current = false
    restaurantCodeRef.current = ''
    loginUserIdRef.current = ''
    loginPasswordRef.current = ''

    setSessionToken('')
    setSessionMode(false)
    setAuthenticated(false)
    setManager(null)
    setOrders([])
    setMenuItems([])
    setDailyOffers([])
    setRestaurantTables([])
    setStaffList([])
    setRestaurant(null)
    setRestaurantCode('')
    setLoginUserId('')
    setLoginPassword('')
    setProfileName('')
    setProfileOpen(false)
  }

  const mobileSection = String(activeTab || 'home')
  const moreSectionActive = ['staff', 'offers', 'settlements', 'swiggy-sync', 'resort'].includes(mobileSection)

  const statusClass = (status) => {
    const value = String(status || 'pending').toLowerCase()
    if (value === 'ready') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
    if (value === 'completed' || value === 'delivered') return 'border-sky-500/30 bg-sky-500/10 text-sky-300'
    if (value === 'cancelled') return 'border-red-500/30 bg-red-500/10 text-red-300'
    if (value === 'preparing') return 'border-violet-500/30 bg-violet-500/10 text-violet-300'
    if (value === 'confirmed') return 'border-blue-500/30 bg-blue-500/10 text-blue-300'
    return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
  }

  const MobileSectionTitle = ({ eyebrow, title, subtitle, action = null }) => (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-400">{eyebrow}</p>
        )}
        <h2 className="mt-1 text-xl font-black text-white">{title}</h2>
        {subtitle && <p className="mt-1 text-xs leading-relaxed text-neutral-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  )

  const MobileOrderCard = ({ order, compact = false }) => {
    const status = String(order?.status || 'pending').toLowerCase()
    const items = Array.isArray(order?.items) ? order.items : []
    const amount = Number(order?.total_amount ?? order?.total ?? 0)
    const displayNumber = order?.order_number || String(order?.id || '').slice(0, 8)
    const mode = String(order?.dining_mode || order?.order_type || 'dine-in')

    return (
      <article className="rounded-[26px] border border-neutral-800 bg-neutral-900 p-4 shadow-xl shadow-black/10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-black text-white">Order #{displayNumber}</h3>
              <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${statusClass(status)}`}>
                {status}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-neutral-500">
              {order?.created_at ? new Date(order.created_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : 'Time unavailable'}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">Total</p>
            <p className="mt-1 text-base font-black text-emerald-400">{money(amount)}</p>
          </div>
        </div>

        <div className="mt-3 grid min-w-0 grid-cols-2 gap-2">
          <div className="rounded-2xl bg-neutral-950 p-3">
            <p className="text-[9px] font-black uppercase text-neutral-600">Customer</p>
            <p className="mt-1 truncate text-xs font-bold text-neutral-200">{order?.customer_name || order?.name || 'Guest'}</p>
          </div>
          <div className="rounded-2xl bg-neutral-950 p-3">
            <p className="text-[9px] font-black uppercase text-neutral-600">Order Type</p>
            <p className="mt-1 truncate text-xs font-bold capitalize text-neutral-200">
              {mode}{order?.table_number ? ` · T${order.table_number}` : ''}
            </p>
          </div>
        </div>

        {!compact && (
          <>
            <div className="mt-3 space-y-2 rounded-2xl border border-neutral-800 bg-neutral-950/70 p-3">
              {items.length === 0 ? (
                <p className="text-xs text-neutral-600">No item details available.</p>
              ) : (
                items.slice(0, 8).map((item, index) => (
                  <div key={`${item?.id || item?.menu_item_id || item?.name || 'item'}-${index}`} className="flex items-start justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <p className="font-bold text-neutral-200">{Number(item?.qty || item?.quantity || 1)} × {item?.name || 'Item'}</p>
                      {item?.addons && <p className="mt-0.5 truncate text-[10px] text-neutral-600">{Array.isArray(item.addons) ? item.addons.join(', ') : String(item.addons)}</p>}
                    </div>
                    <span className="shrink-0 font-black text-neutral-400">{money(item?.price || 0)}</span>
                  </div>
                ))
              )}
              {items.length > 8 && <p className="text-[10px] font-bold text-neutral-600">+{items.length - 8} more items</p>}
            </div>

            <div className="mt-3">
              <label className="mb-1 block text-[9px] font-black uppercase tracking-wider text-neutral-500">Update status</label>
              <select
                value={status}
                onChange={(event) => updateOrderStatus(order.id, event.target.value)}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm font-bold text-white outline-none focus:border-orange-500"
              >
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="preparing">Preparing</option>
                <option value="ready">Ready</option>
                <option value="completed">Completed</option>
                <option value="delivered">Delivered</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </>
        )}
      </article>
    )
  }

  if (sessionChecking) {
    return (
      <main className="flex min-h-[100dvh] w-full max-w-full items-center justify-center overflow-x-hidden bg-neutral-950 p-4 text-neutral-100">
        <div className="w-full max-w-sm rounded-[30px] border border-neutral-800 bg-neutral-900 p-8 text-center shadow-2xl">
          <div className="mx-auto h-11 w-11 animate-spin rounded-full border-4 border-neutral-800 border-t-orange-500" />
          <h1 className="mt-5 text-lg font-black">Opening Manager App</h1>
          <p className="mt-2 text-xs text-neutral-500">Checking your secure Digital Dine staff session...</p>
        </div>
      </main>
    )
  }

  if (!authenticated) {
    return (
      <main className="flex min-h-[100dvh] w-full max-w-full items-center justify-center overflow-x-hidden bg-neutral-950 p-4 text-neutral-100">
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4 rounded-[32px] border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
          <div className="pb-2 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-orange-500 text-3xl shadow-lg shadow-orange-500/20">🧑‍💼</div>
            <h1 className="mt-4 text-2xl font-black">Manager App</h1>
            <p className="mt-1 text-xs text-neutral-500">Digital Dine mobile operations</p>
          </div>
          <input value={restaurantCode} onChange={(e) => setRestaurantCode(e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="5-digit Restaurant Code" inputMode="numeric" maxLength={5} required className="w-full rounded-2xl border border-orange-500/30 bg-neutral-950 px-4 py-3.5 text-sm font-mono tracking-widest text-white outline-none focus:border-orange-500" />
          <input value={loginUserId} onChange={(e) => setLoginUserId(e.target.value)} placeholder="Manager User ID" autoComplete="username" required className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3.5 text-sm text-white outline-none focus:border-orange-500" />
          <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="Password / PIN" autoComplete="current-password" required className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3.5 text-sm text-white outline-none focus:border-orange-500" />
          <button disabled={loginLoading} className="w-full rounded-2xl bg-orange-500 py-3.5 text-sm font-black uppercase text-white shadow-lg shadow-orange-500/20 disabled:opacity-50">
            {loginLoading ? 'Signing in...' : 'Open Manager App'}
          </button>
        </form>
      </main>
    )
  }

  return (
    // Mobile-only shell:
    // - 100dvh follows the real phone viewport height
    // - 100svw prevents horizontal overflow on small screens
    // - safe-area env() keeps controls clear of Android/iOS system areas
    <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-neutral-950 text-neutral-100">
      <div className="mx-auto min-h-[100dvh] w-full max-w-[480px] overflow-x-hidden bg-neutral-950 pb-[calc(7.25rem+env(safe-area-inset-bottom))]">
        <header className="sticky top-0 z-40 w-full border-b border-neutral-800/90 bg-neutral-950/95 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl sm:px-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-orange-400">Digital Dine · Manager</p>
              <h1 className="mt-1 truncate text-lg font-black text-white">{restaurant?.name || 'Restaurant'}</h1>
              <p className="mt-0.5 truncate text-[10px] text-neutral-500">{manager?.name || manager?.user_id} · {currentPlanDisplay}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={handleStoreToggle}
                className={`flex h-10 w-10 items-center justify-center rounded-2xl border text-sm ${storeOpen ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-red-500/30 bg-red-500/10'}`}
                aria-label={storeOpen ? 'Close store' : 'Open store'}
                title={storeOpen ? 'Store open' : 'Store closed'}
              >
                {storeOpen ? '🟢' : '🔴'}
              </button>
              <button
                type="button"
                onClick={fetchDashboard}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900 text-sm"
                aria-label="Refresh"
              >
                {loading ? '⏳' : '↻'}
              </button>
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900 text-sm"
                aria-label="Profile"
              >
                👤
              </button>
            </div>
          </div>
        </header>

        {notice && (
          <div className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+4.75rem)] z-[70] w-[calc(100svw-1rem)] max-w-[448px] -translate-x-1/2 rounded-2xl border border-emerald-500/20 bg-emerald-600 px-4 py-3 text-center text-xs font-bold text-white shadow-2xl">
            {notice}
          </div>
        )}

        <section className="min-w-0 space-y-5 px-3 py-4 sm:px-4">
          {mobileSection === 'home' && (
            <>
              <div className="overflow-hidden rounded-[30px] border border-orange-500/20 bg-gradient-to-br from-orange-500/20 via-neutral-900 to-neutral-900 p-5 shadow-xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-300">Today's Operations</p>
                    <h2 className="mt-2 text-2xl font-black text-white">{money(todayOrders.reduce((sum, order) => sum + Number(order.total_amount ?? order.total ?? 0), 0))}</h2>
                    <p className="mt-1 text-xs text-neutral-400">Revenue from today's non-cancelled orders</p>
                  </div>
                  <span className={`rounded-full border px-3 py-1.5 text-[10px] font-black ${storeOpen ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>
                    {storeOpen ? 'OPEN' : 'CLOSED'}
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-2">
                  <div className="rounded-2xl border border-neutral-800/80 bg-neutral-950/70 p-3">
                    <p className="text-[9px] font-black uppercase text-neutral-600">Orders</p>
                    <p className="mt-1 text-xl font-black text-white">{todayOrders.length}</p>
                  </div>
                  <div className="rounded-2xl border border-neutral-800/80 bg-neutral-950/70 p-3">
                    <p className="text-[9px] font-black uppercase text-neutral-600">Active</p>
                    <p className="mt-1 text-xl font-black text-orange-400">{activeOrders.length}</p>
                  </div>
                  <div className="rounded-2xl border border-neutral-800/80 bg-neutral-950/70 p-3">
                    <p className="text-[9px] font-black uppercase text-neutral-600">Tables Free</p>
                    <p className="mt-1 text-xl font-black text-emerald-400">{availableTableCount}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setActiveTab('live-orders')} className="rounded-[26px] border border-red-500/20 bg-red-500/5 p-4 text-left active:scale-[0.98]">
                  <div className="text-2xl">🔴</div>
                  <p className="mt-3 font-black text-white">Live Orders</p>
                  <p className="mt-1 text-[10px] text-neutral-500">{activeOrders.length} active right now</p>
                </button>
                <button type="button" onClick={() => setActiveTab('tables')} className="rounded-[26px] border border-emerald-500/20 bg-emerald-500/5 p-4 text-left active:scale-[0.98]">
                  <div className="text-2xl">🪑</div>
                  <p className="mt-3 font-black text-white">Tables</p>
                  <p className="mt-1 text-[10px] text-neutral-500">{availableTableCount}/{configuredTableNumbers.length} available</p>
                </button>
                <button type="button" onClick={() => setActiveTab('menu')} className="rounded-[26px] border border-amber-500/20 bg-amber-500/5 p-4 text-left active:scale-[0.98]">
                  <div className="text-2xl">🍔</div>
                  <p className="mt-3 font-black text-white">Menu</p>
                  <p className="mt-1 text-[10px] text-neutral-500">{menuItems.length} items</p>
                </button>
                <button type="button" onClick={() => setActiveTab('staff')} className="rounded-[26px] border border-sky-500/20 bg-sky-500/5 p-4 text-left active:scale-[0.98]">
                  <div className="text-2xl">👥</div>
                  <p className="mt-3 font-black text-white">Staff</p>
                  <p className="mt-1 text-[10px] text-neutral-500">{staffList.length} accounts</p>
                </button>
              </div>

              {hasResortAccess && (
                <button type="button" onClick={() => setActiveTab('resort')} className="w-full rounded-[28px] border border-sky-500/20 bg-gradient-to-r from-sky-500/10 to-violet-500/10 p-4 text-left active:scale-[0.99]">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-sky-300">Restaurant + Resort</p>
                      <h3 className="mt-1 text-lg font-black text-white">🏨 Open Resort Workspace</h3>
                      <p className="mt-1 text-[11px] text-neutral-500">Separate mobile workspace for resort operations.</p>
                    </div>
                    <span className="text-2xl text-neutral-500">›</span>
                  </div>
                </button>
              )}

              <div className="space-y-3">
                <MobileSectionTitle
                  eyebrow="Live"
                  title="Recent Active Orders"
                  subtitle="Updates are synchronized with the same manager backend."
                  action={<button type="button" onClick={() => setActiveTab('live-orders')} className="rounded-xl bg-neutral-900 px-3 py-2 text-[10px] font-black text-orange-300">View all</button>}
                />
                {activeOrders.length === 0 ? (
                  <div className="rounded-[26px] border border-neutral-800 bg-neutral-900 p-8 text-center">
                    <div className="text-3xl">✅</div>
                    <p className="mt-3 text-sm font-black text-white">No active orders</p>
                    <p className="mt-1 text-xs text-neutral-500">New QR orders will appear here automatically.</p>
                  </div>
                ) : (
                  activeOrders.slice(0, 3).map((order) => <MobileOrderCard key={order.id} order={order} compact />)
                )}
              </div>
            </>
          )}

          {mobileSection === 'live-orders' && (
            <div className="space-y-4">
              <MobileSectionTitle eyebrow="Real-time" title="Live Orders" subtitle="Manage order status with large mobile controls." />
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-3 text-center"><p className="text-lg font-black text-orange-300">{activeOrders.length}</p><p className="text-[9px] font-black uppercase text-neutral-600">Active</p></div>
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 text-center"><p className="text-lg font-black text-amber-300">{orders.filter((o) => String(o.status || 'pending').toLowerCase() === 'pending').length}</p><p className="text-[9px] font-black uppercase text-neutral-600">Pending</p></div>
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-center"><p className="text-lg font-black text-emerald-300">{orders.filter((o) => String(o.status || '').toLowerCase() === 'ready').length}</p><p className="text-[9px] font-black uppercase text-neutral-600">Ready</p></div>
              </div>
              {activeOrders.length === 0 ? (
                <div className="rounded-[26px] border border-neutral-800 bg-neutral-900 p-10 text-center text-sm text-neutral-500">No active orders.</div>
              ) : (
                activeOrders.map((order) => <MobileOrderCard key={order.id} order={order} />)
              )}
            </div>
          )}

          {mobileSection === 'tables' && (
            <div className="space-y-4">
              <MobileSectionTitle eyebrow="Floor" title="Table Availability" subtitle="Occupied status is calculated from active dine-in orders." />
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-3 text-center"><p className="text-lg font-black">{configuredTableNumbers.length}</p><p className="text-[9px] uppercase text-neutral-600">Total</p></div>
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-center"><p className="text-lg font-black text-emerald-300">{availableTableCount}</p><p className="text-[9px] uppercase text-neutral-600">Available</p></div>
                <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-3 text-center"><p className="text-lg font-black text-red-300">{occupiedTableCount}</p><p className="text-[9px] uppercase text-neutral-600">Occupied</p></div>
              </div>
              {configuredTableNumbers.length === 0 ? (
                <div className="rounded-[26px] border border-neutral-800 bg-neutral-900 p-10 text-center text-sm text-neutral-500">No registered table QR inventory.</div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {configuredTableNumbers.map((number) => {
                    const occupied = occupiedTableNumbers.has(number)
                    return (
                      <div key={number} className={`rounded-[26px] border p-5 text-center ${occupied ? 'border-red-500/20 bg-red-500/5' : 'border-emerald-500/20 bg-emerald-500/5'}`}>
                        <div className="text-3xl">{occupied ? '🔴' : '🟢'}</div>
                        <p className="mt-3 text-base font-black text-white">Table {number}</p>
                        <p className={`mt-1 text-[10px] font-black uppercase ${occupied ? 'text-red-300' : 'text-emerald-300'}`}>{occupied ? 'Occupied' : 'Available'}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {mobileSection === 'menu' && (
            <div className="space-y-4">
              <MobileSectionTitle eyebrow="Catalog" title="Menu Management" subtitle={`${menuItems.length}/${maxMenuAllowed === Infinity ? '∞' : maxMenuAllowed} items used`} />

              <form onSubmit={saveDish} className="space-y-3 rounded-[28px] border border-neutral-800 bg-neutral-900 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-white">{editingDishId ? 'Edit Dish' : 'Add Dish'}</h3>
                  {editingDishId && <button type="button" onClick={resetDish} className="rounded-xl bg-neutral-800 px-3 py-2 text-[10px] font-black text-neutral-300">Cancel</button>}
                </div>
                <Input label="Dish Name" value={dish.name} onChange={(value) => setDish({ ...dish, name: value })} placeholder="Chicken Biryani" />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Price" type="number" value={dish.price} onChange={(value) => setDish({ ...dish, price: value })} placeholder="299" />
                  <Input label="Category" value={dish.category} onChange={(value) => setDish({ ...dish, category: value })} placeholder="Main Course" />
                </div>
                <Input label="Description" value={dish.description} onChange={(value) => setDish({ ...dish, description: value })} placeholder="Dish description" />
                <Input label="Image URL" value={dish.image_url} onChange={(value) => setDish({ ...dish, image_url: value })} placeholder="https://..." />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[10px] font-black uppercase text-neutral-400">Food Type</label>
                    <select value={dish.food_type} onChange={(e) => setDish({ ...dish, food_type: e.target.value })} className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-xs text-white outline-none">
                      <option value="veg">Veg</option>
                      <option value="non-veg">Non-Veg</option>
                      <option value="egg">Egg</option>
                      <option value="beverage">Beverage</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <Input label="Add-ons" value={dish.addons} onChange={(value) => setDish({ ...dish, addons: value })} placeholder="Cheese, Extra gravy" />
                </div>
                {hasAdvancedMenuControls ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Input label="Original Price" type="number" value={dish.original_price} onChange={(value) => setDish({ ...dish, original_price: value })} placeholder="Optional" />
                      <Input label="Offer Price" type="number" value={dish.offer_price} onChange={(value) => setDish({ ...dish, offer_price: value })} placeholder="Optional" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-black uppercase text-neutral-400">Highly Reordered</label>
                      <select value={dish.reorder_mode} onChange={(e) => setDish({ ...dish, reorder_mode: e.target.value })} className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-xs text-white">
                        <option value="auto">Automatic</option>
                        <option value="on">Always On</option>
                        <option value="off">Off</option>
                      </select>
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 text-[10px] font-bold text-amber-300">Advanced pricing and Highly Reordered controls require Restaurant Pro.</div>
                )}
                <button disabled={savingDish} className="w-full rounded-2xl bg-orange-500 py-3 text-xs font-black uppercase text-white disabled:opacity-50">{savingDish ? 'Saving...' : editingDishId ? 'Update Dish' : 'Add Dish'}</button>
              </form>

              <div className="space-y-3">
                {menuItems.map((item) => (
                  <article key={item.id} className="rounded-[26px] border border-neutral-800 bg-neutral-900 p-4">
                    <div className="flex gap-3">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950">
                        {item.image_url ? <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-2xl">🍽️</div>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-black text-white">{item.name}</p>
                            <p className="mt-1 text-[10px] text-neutral-500">{item.category || 'Other'} · {item.food_type || (item.is_veg ? 'veg' : 'non-veg')}</p>
                          </div>
                          <p className="shrink-0 font-black text-emerald-400">{money(item.offer_price ?? item.price)}</p>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {isHighlyReordered(item) && <span className="rounded-full bg-violet-500/10 px-2 py-1 text-[9px] font-black text-violet-300">Highly Reordered</span>}
                          <span className={`rounded-full px-2 py-1 text-[9px] font-black ${item.is_available === false ? 'bg-red-500/10 text-red-300' : 'bg-emerald-500/10 text-emerald-300'}`}>{item.is_available === false ? 'Unavailable' : 'Available'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <button type="button" onClick={() => startEditDish(item)} className="rounded-xl border border-neutral-800 bg-neutral-950 py-2.5 text-[10px] font-black text-neutral-300">Edit</button>
                      <button type="button" onClick={() => toggleAvailability(item)} className="rounded-xl border border-neutral-800 bg-neutral-950 py-2.5 text-[10px] font-black text-neutral-300">{item.is_available === false ? 'Enable' : 'Disable'}</button>
                      <button type="button" onClick={() => deleteDish(item)} className="rounded-xl border border-red-500/20 bg-red-500/5 py-2.5 text-[10px] font-black text-red-300">Delete</button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {mobileSection === 'staff' && (
            <div className="space-y-4">
              <MobileSectionTitle eyebrow="Team" title="Waiter & Kitchen Staff" subtitle="Create and revoke operational accounts." />
              <form onSubmit={saveStaff} className="space-y-3 rounded-[28px] border border-neutral-800 bg-neutral-900 p-4">
                <Input label="Staff Name" value={staffName} onChange={setStaffName} placeholder="Staff name" />
                <Input label="User ID" value={staffUserId} onChange={setStaffUserId} placeholder="waiter01" />
                <Input label="Password / PIN" type="password" value={staffPassword} onChange={setStaffPassword} placeholder="Minimum 4 characters" />
                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase text-neutral-400">Role</label>
                  <select value={staffRole} onChange={(e) => setStaffRole(e.target.value)} className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs text-white">
                    <option value="waiter">Waiter</option>
                    <option value="kitchen">Kitchen</option>
                  </select>
                </div>
                <button disabled={savingStaff} className="w-full rounded-2xl bg-orange-500 py-3 text-xs font-black uppercase text-white disabled:opacity-50">{savingStaff ? 'Creating...' : 'Create Staff Account'}</button>
              </form>
              <div className="space-y-3">
                {staffList.map((staff) => (
                  <article key={staff.id} className="flex items-center justify-between gap-3 rounded-[24px] border border-neutral-800 bg-neutral-900 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-black text-white">{staff.name || staff.user_id}</p>
                      <p className="mt-1 text-[10px] text-neutral-500">{staff.user_id} · <span className="capitalize">{staff.role}</span></p>
                    </div>
                    <button type="button" onClick={() => revokeStaff(staff)} className="shrink-0 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-[10px] font-black text-red-300">Revoke</button>
                  </article>
                ))}
              </div>
            </div>
          )}

          {mobileSection === 'offers' && (
            <div className="space-y-4">
              <MobileSectionTitle eyebrow="Promotions" title="Offers of the Day" subtitle="Manage offers shown on the QR menu." />
              <form onSubmit={saveOffer} className="space-y-3 rounded-[28px] border border-neutral-800 bg-neutral-900 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-black text-white">{editingOfferId ? 'Edit Offer' : 'Create Offer'}</h3>
                  {editingOfferId && <button type="button" onClick={resetOffer} className="rounded-xl bg-neutral-800 px-3 py-2 text-[10px] font-black text-neutral-300">Cancel</button>}
                </div>
                <Input label="Title" value={offer.title} onChange={(value) => setOffer({ ...offer, title: value })} placeholder="Weekend Special" />
                <Input label="Description" value={offer.description} onChange={(value) => setOffer({ ...offer, description: value })} placeholder="Offer description" />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Original Price" type="number" value={offer.original_price} onChange={(value) => setOffer({ ...offer, original_price: value })} placeholder="299" />
                  <Input label="Offer Price" type="number" value={offer.offer_price} onChange={(value) => setOffer({ ...offer, offer_price: value })} placeholder="199" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Badge" value={offer.discount_text} onChange={(value) => setOffer({ ...offer, discount_text: value })} placeholder="33% OFF" />
                  <Input label="Date" type="date" value={offer.offer_date} onChange={(value) => setOffer({ ...offer, offer_date: value })} />
                </div>
                <Input label="Image URL" value={offer.image_url} onChange={(value) => setOffer({ ...offer, image_url: value })} placeholder="https://..." />
                <button disabled={savingOffer} className="w-full rounded-2xl bg-orange-500 py-3 text-xs font-black uppercase text-white disabled:opacity-50">{savingOffer ? 'Saving...' : editingOfferId ? 'Update Offer' : 'Publish Offer'}</button>
              </form>
              <div className="space-y-3">
                {dailyOffers.map((item) => (
                  <article key={item.id} className="rounded-[26px] border border-neutral-800 bg-neutral-900 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-black text-white">{item.title}</p>
                        <p className="mt-1 text-[10px] text-neutral-500">{item.offer_date || item.date || 'No date'} · {item.discount_text || 'Offer'}</p>
                      </div>
                      <p className="font-black text-emerald-400">{money(item.offer_price)}</p>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <button type="button" onClick={() => editOffer(item)} className="rounded-xl border border-neutral-800 bg-neutral-950 py-2.5 text-[10px] font-black">Edit</button>
                      <button type="button" onClick={() => toggleOffer(item)} className="rounded-xl border border-neutral-800 bg-neutral-950 py-2.5 text-[10px] font-black">{item.is_active === false ? 'Enable' : 'Disable'}</button>
                      <button type="button" onClick={() => deleteOffer(item)} className="rounded-xl border border-red-500/20 bg-red-500/5 py-2.5 text-[10px] font-black text-red-300">Delete</button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {mobileSection === 'settlements' && hasAdvancedAnalytics && (
            <div className="space-y-4">
              <MobileSectionTitle eyebrow="Pro Analytics" title="Reports" subtitle="Sales performance from your existing order data." />
              <div className="grid grid-cols-4 gap-2 rounded-2xl border border-neutral-800 bg-neutral-900 p-2">
                {['daily', 'weekly', 'monthly', 'yearly'].map((period) => (
                  <button key={period} type="button" onClick={() => setReportTimeframe(period)} className={`rounded-xl py-2 text-[9px] font-black uppercase ${reportTimeframe === period ? 'bg-orange-500 text-white' : 'text-neutral-500'}`}>{period}</button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-[24px] border border-neutral-800 bg-neutral-900 p-4"><p className="text-[9px] font-black uppercase text-neutral-600">Sales</p><p className="mt-2 text-xl font-black text-emerald-400">{money(reportStats.sales)}</p></div>
                <div className="rounded-[24px] border border-neutral-800 bg-neutral-900 p-4"><p className="text-[9px] font-black uppercase text-neutral-600">Orders</p><p className="mt-2 text-xl font-black text-white">{reportStats.orders}</p></div>
                <div className="rounded-[24px] border border-neutral-800 bg-neutral-900 p-4"><p className="text-[9px] font-black uppercase text-neutral-600">Average</p><p className="mt-2 text-xl font-black text-amber-400">{money(reportStats.average)}</p></div>
                <div className="rounded-[24px] border border-neutral-800 bg-neutral-900 p-4"><p className="text-[9px] font-black uppercase text-neutral-600">Peak Hour</p><p className="mt-2 text-xl font-black text-violet-300">{peakHour ? `${String(peakHour.hour).padStart(2, '0')}:00` : '—'}</p></div>
              </div>
              <button type="button" onClick={downloadReport} className="w-full rounded-2xl border border-orange-500/20 bg-orange-500/10 py-3 text-xs font-black text-orange-300">Download CSV Report</button>
              <div className="rounded-[28px] border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-neutral-500">Hourly Activity</p>
                <div className="mt-4 space-y-3">
                  {hourlyData.length === 0 ? <p className="text-xs text-neutral-600">No order activity in this period.</p> : hourlyData.map((item) => (
                    <div key={item.hour} className="flex items-center justify-between gap-3 rounded-2xl bg-neutral-950 p-3 text-xs"><span className="font-black text-neutral-300">{String(item.hour).padStart(2, '0')}:00</span><span className="text-neutral-500">{item.orders} orders</span><span className="font-black text-emerald-400">{money(item.sales)}</span></div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {mobileSection === 'settlements' && !hasAdvancedAnalytics && (
            <div className="rounded-[28px] border border-amber-500/20 bg-amber-500/5 p-6 text-center">
              <div className="text-3xl">🔒</div>
              <h2 className="mt-3 text-lg font-black text-white">Pro Analytics</h2>
              <p className="mt-2 text-xs text-neutral-500">Analytics and downloadable reports require Restaurant Pro or Resort Pro.</p>
            </div>
          )}

          {mobileSection === 'swiggy-sync' && (
            <div className="space-y-4">
              <MobileSectionTitle eyebrow="Import" title="Menu JSON Import" subtitle="Keeps the existing manager menu import workflow available in the mobile app." />
              <form onSubmit={handleSwiggySync} className="space-y-3 rounded-[28px] border border-neutral-800 bg-neutral-900 p-4">
                <textarea rows={12} value={swiggyDataInput} onChange={(e) => setSwiggyDataInput(e.target.value)} placeholder='[{"name":"Chicken Biryani","price":320,"category":"Main Course"}]' className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 p-4 font-mono text-xs text-white outline-none focus:border-orange-500" required />
                <button disabled={syncingSwiggy} className="w-full rounded-2xl bg-orange-500 py-3 text-xs font-black uppercase text-white disabled:opacity-50">{syncingSwiggy ? 'Importing...' : 'Import Menu'}</button>
              </form>
            </div>
          )}

          {mobileSection === 'resort' && hasResortAccess && (
            <div className="space-y-4">
              <MobileSectionTitle eyebrow="Resort Workspace" title="Resort Manager" subtitle="Separate from restaurant operations and visible only on Resort plans." />
              <div className="rounded-[28px] border border-sky-500/20 bg-gradient-to-br from-sky-500/10 to-violet-500/5 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-sky-300">{currentPlanDisplay}</p>
                <h3 className="mt-2 text-xl font-black text-white">🏨 {restaurant?.name || 'Resort'}</h3>
                <p className="mt-2 text-xs leading-relaxed text-neutral-400">This mobile UI is ready for the same resort data layer used by Digital Dining. No duplicate resort database should be created.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['🏨', 'Rooms', 'Inventory & status'],
                  ['📅', 'Bookings', 'Reservations'],
                  ['🧳', 'Guests', 'Stay information'],
                  ['🔑', 'Check-In', 'Arrivals'],
                  ['🚪', 'Check-Out', 'Departures'],
                  ['🧹', 'Housekeeping', 'Room readiness'],
                  ['💳', 'Billing', 'Stay payments'],
                  ['📊', 'Reports', hasAdvancedResort ? 'Advanced reports' : 'Standard reports'],
                ].map(([icon, title, subtitle]) => (
                  <div key={title} className="rounded-[24px] border border-neutral-800 bg-neutral-900 p-4">
                    <div className="text-2xl">{icon}</div>
                    <p className="mt-3 font-black text-white">{title}</p>
                    <p className="mt-1 text-[10px] text-neutral-600">{subtitle}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-relaxed text-amber-200">
                The current Manager source does not yet expose secure manager-session Resort CRUD RPCs, so these cards are UI-only until that existing Resort backend is connected for Manager access.
              </div>
            </div>
          )}

          {mobileSection === 'more' && (
            <div className="space-y-4">
              <MobileSectionTitle eyebrow="Manager" title="More Tools" subtitle="All secondary manager tools in one mobile-friendly menu." />
              <div className="overflow-hidden rounded-[28px] border border-neutral-800 bg-neutral-900">
                {[
                  ['👥', 'Staff Accounts', 'Manage waiter and kitchen logins', 'staff'],
                  ['🔥', 'Offers of the Day', 'QR-menu promotions', 'offers'],
                  ['📊', 'Analytics & Reports', hasAdvancedAnalytics ? 'Sales and CSV reports' : 'Pro plan feature', 'settlements'],
                  ['🟠', 'Menu Import', 'Import menu JSON', 'swiggy-sync'],
                  ...(hasResortAccess ? [['🏨', 'Resort Dashboard', 'Separate resort workspace', 'resort']] : []),
                ].map(([icon, title, subtitle, target]) => (
                  <button key={target} type="button" onClick={() => setActiveTab(target)} className="flex w-full items-center gap-3 border-b border-neutral-800 px-4 py-4 text-left last:border-b-0 active:bg-neutral-800">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-neutral-950 text-xl">{icon}</span>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-black text-white">{title}</span><span className="mt-0.5 block truncate text-[10px] text-neutral-500">{subtitle}</span></span>
                    <span className="text-xl text-neutral-700">›</span>
                  </button>
                ))}
              </div>

              <div className="rounded-[28px] border border-neutral-800 bg-neutral-900 p-4">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-neutral-600">Restaurant</p>
                <p className="mt-2 font-black text-white">{restaurant?.name || 'Restaurant'}</p>
                <p className="mt-1 text-[10px] font-mono text-neutral-500">Code: {restaurant?.restaurant_code || restaurantCode || '-----'}</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setProfileOpen(true)} className="rounded-2xl border border-neutral-800 bg-neutral-950 py-3 text-xs font-black text-neutral-300">Profile</button>
                  <button type="button" onClick={logout} className="rounded-2xl border border-red-500/20 bg-red-500/5 py-3 text-xs font-black text-red-300">Log Out</button>
                </div>
              </div>
            </div>
          )}
        </section>

        {profileOpen && (
          <div className="fixed inset-0 z-[80] flex min-h-[100dvh] w-full items-end justify-center overflow-x-hidden bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
            <div className="max-h-[92dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[32px] border border-neutral-800 bg-neutral-900 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[32px]">
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-neutral-700 sm:hidden" />
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-400">Manager Profile</p><h2 className="mt-1 text-xl font-black text-white">Account</h2></div>
                <button type="button" onClick={() => setProfileOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-2xl bg-neutral-950 text-neutral-400">✕</button>
              </div>
              <form onSubmit={saveManagerProfile} className="mt-5 space-y-4">
                <Input label="Manager Name" value={profileName} onChange={setProfileName} placeholder="Manager name" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3"><p className="text-[9px] font-black uppercase text-neutral-600">User ID</p><p className="mt-1 truncate text-xs font-black text-white">{manager?.user_id || loginUserId}</p></div>
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3"><p className="text-[9px] font-black uppercase text-neutral-600">Role</p><p className="mt-1 text-xs font-black capitalize text-white">{manager?.role || 'manager'}</p></div>
                </div>
                <button disabled={profileSaving} className="w-full rounded-2xl bg-orange-500 py-3 text-xs font-black uppercase text-white disabled:opacity-50">{profileSaving ? 'Saving...' : 'Save Profile'}</button>
              </form>
            </div>
          </div>
        )}

        <nav className="fixed bottom-0 left-1/2 z-50 w-[100svw] max-w-[480px] -translate-x-1/2 border-t border-neutral-800 bg-neutral-950/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
          <div className="grid grid-cols-5 gap-1">
            {[
              ['home', '⌂', 'Home'],
              ['live-orders', '▤', 'Orders'],
              ['tables', '▦', 'Tables'],
              ['menu', '☷', 'Menu'],
              ['more', '•••', 'More'],
            ].map(([id, icon, label]) => {
              const selected = id === 'more' ? moreSectionActive || mobileSection === 'more' : mobileSection === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`flex min-h-[58px] flex-col items-center justify-center rounded-2xl px-1 text-center transition active:scale-95 ${selected ? 'bg-orange-500/10 text-orange-400' : 'text-neutral-600'}`}
                >
                  <span className="text-lg font-black leading-none">{icon}</span>
                  <span className="mt-1 text-[9px] font-black uppercase tracking-wide">{label}</span>
                </button>
              )
            })}
          </div>
        </nav>

        <RestaurantChatWidget restaurantId={restaurantId} />
      </div>
    </main>
  )
}
