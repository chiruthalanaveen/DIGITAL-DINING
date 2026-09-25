'use client'

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ThemeToggle from '@/app/components/ThemeToggle'
import { supabase } from '@/lib/supabase'
import ResortManagement from '@/app/components/ResortManagement'

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
    <div className="fixed bottom-6 right-6 z-50 font-sans">
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
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-[min(390px,calc(100vw-2rem))] h-[560px] shadow-2xl flex flex-col overflow-hidden">
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


function DashboardEntryLoader({
  portalLabel = 'Digital Dining Portal',
  detail = 'Preparing your workspace...',
}) {
  return (
    <div className="dd-entry-screen fixed inset-0 z-[99999] flex min-h-screen items-center justify-center overflow-hidden bg-[#f7f7f8] px-5 text-neutral-900">
      <style jsx global>{`
        .dd-entry-screen {
          background:
            radial-gradient(circle at 50% 30%, rgba(249,115,22,.08), transparent 34%),
            #f7f7f8;
        }

        :root[data-theme='dark'] .dd-entry-screen {
          background:
            radial-gradient(circle at 50% 30%, rgba(249,115,22,.10), transparent 34%),
            #09090b;
          color: #f5f5f5;
        }

        .dd-entry-child {
          transform-box: fill-box;
          transform-origin: center;
          animation: dd-child-chase 1.05s ease-in-out infinite alternate;
        }

        .dd-entry-arm-front,
        .dd-entry-leg-back {
          transform-box: fill-box;
          transform-origin: top center;
          animation: dd-limb-forward .34s ease-in-out infinite alternate;
        }

        .dd-entry-arm-back,
        .dd-entry-leg-front {
          transform-box: fill-box;
          transform-origin: top center;
          animation: dd-limb-back .34s ease-in-out infinite alternate;
        }

        .dd-entry-ball {
          transform-box: fill-box;
          transform-origin: center;
          animation: dd-ball-bounce .7s ease-in-out infinite;
        }

        .dd-entry-shadow {
          animation: dd-shadow-pulse .7s ease-in-out infinite;
        }

        .dd-entry-progress {
          animation: dd-progress-4s 4s linear forwards;
          transform-origin: left center;
        }

        @keyframes dd-child-chase {
          from { transform: translate3d(-12px, 0, 0); }
          to { transform: translate3d(34px, -1px, 0); }
        }

        @keyframes dd-limb-forward {
          from { transform: rotate(22deg); }
          to { transform: rotate(-28deg); }
        }

        @keyframes dd-limb-back {
          from { transform: rotate(-24deg); }
          to { transform: rotate(30deg); }
        }

        @keyframes dd-ball-bounce {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
          45% { transform: translate3d(-8px, -22px, 0) rotate(130deg); }
          70% { transform: translate3d(-13px, -5px, 0) rotate(220deg); }
        }

        @keyframes dd-shadow-pulse {
          0%, 100% { transform: scaleX(1); opacity: .18; }
          45% { transform: scaleX(.72); opacity: .1; }
        }

        @keyframes dd-progress-4s {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }

        @media (prefers-reduced-motion: reduce) {
          .dd-entry-child,
          .dd-entry-arm-front,
          .dd-entry-arm-back,
          .dd-entry-leg-front,
          .dd-entry-leg-back,
          .dd-entry-ball,
          .dd-entry-shadow {
            animation: none !important;
          }

          .dd-entry-progress {
            animation-duration: 4s !important;
          }
        }
      `}</style>

      <div className="w-full max-w-md text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-500 text-sm font-black text-white shadow-lg shadow-orange-500/20">
          D
        </div>

        <div className="mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-orange-500">
          Digital Dining
        </div>

        <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
          Opening {portalLabel}
        </h1>

        <p className="mt-2 text-xs font-medium text-neutral-500">
          {detail}
        </p>

        <div className="relative mx-auto mt-7 h-[150px] w-full max-w-[360px] overflow-hidden rounded-[24px] border border-neutral-200 bg-white shadow-sm">
          <svg
            viewBox="0 0 360 150"
            className="h-full w-full"
            role="img"
            aria-label="A child running after a ball"
          >
            <defs>
              <linearGradient id="ddLoaderSky" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#fff7ed" />
                <stop offset="100%" stopColor="#ffffff" />
              </linearGradient>
              <linearGradient id="ddLoaderShirt" x1="0" x2="1">
                <stop offset="0%" stopColor="#fb923c" />
                <stop offset="100%" stopColor="#ea580c" />
              </linearGradient>
            </defs>

            <rect width="360" height="150" fill="url(#ddLoaderSky)" />
            <path d="M0 116 C70 109 134 121 205 115 C278 109 321 116 360 112 V150 H0 Z" fill="#f3f4f6" />
            <path d="M0 116 H360" stroke="#d4d4d8" strokeWidth="1" />

            <ellipse
              className="dd-entry-shadow"
              cx="154"
              cy="122"
              rx="35"
              ry="6"
              fill="#111827"
            />

            <g className="dd-entry-child">
              <circle cx="122" cy="48" r="13" fill="#b97852" />
              <path
                d="M110 43 C113 30 134 29 137 45 C132 39 124 37 116 39 Z"
                fill="#2b211b"
              />
              <path
                d="M132 45 C137 46 140 49 140 53"
                stroke="#2b211b"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx="127" cy="47" r="1.2" fill="#1f2937" />

              <rect
                x="111"
                y="61"
                width="28"
                height="39"
                rx="11"
                fill="url(#ddLoaderShirt)"
              />
              <path d="M115 98 H138 L134 111 H116 Z" fill="#1f2937" />

              <g className="dd-entry-arm-back">
                <path
                  d="M115 70 L94 85 L82 78"
                  fill="none"
                  stroke="#b97852"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>

              <g className="dd-entry-arm-front">
                <path
                  d="M136 70 L154 83 L169 75"
                  fill="none"
                  stroke="#b97852"
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>

              <g className="dd-entry-leg-back">
                <path
                  d="M120 107 L103 123 L89 122"
                  fill="none"
                  stroke="#b97852"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M87 122 H101"
                  stroke="#111827"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
              </g>

              <g className="dd-entry-leg-front">
                <path
                  d="M132 107 L147 122 L160 114"
                  fill="none"
                  stroke="#b97852"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M157 114 L170 116"
                  stroke="#111827"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
              </g>
            </g>

            <g className="dd-entry-ball">
              <circle cx="265" cy="107" r="15" fill="#ffffff" stroke="#111827" strokeWidth="1.5" />
              <path
                d="M265 92 L273 101 L269 111 L257 111 L253 101 Z"
                fill="#f97316"
              />
              <path
                d="M273 101 L279 96 M269 111 L277 119 M257 111 L251 120 M253 101 L247 96"
                stroke="#111827"
                strokeWidth="1.2"
              />
            </g>
          </svg>

          <div className="absolute bottom-3 left-4 right-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200">
              <div className="dd-entry-progress h-full w-full rounded-full bg-orange-500" />
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-center gap-2 text-[10px] font-bold text-neutral-500">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
          Secure workspace is loading · about 4 seconds
        </div>
      </div>
    </div>
  )
}

export default function RestaurantManagerDashboard({ params }) {
  const routeParams = use(params)
  const restaurantId = routeParams?.restaurantId || routeParams?.id

  const [authenticated, setAuthenticated] = useState(false)
  const [manager, setManager] = useState(null)
  const [entryLoading, setEntryLoading] = useState(false)
  const authenticatedOnceRef = useRef(false)

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
  const [activeTab, setActiveTab] = useState('settlements')
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

  useEffect(() => {
    if (!authenticated) {
      authenticatedOnceRef.current = false
      setEntryLoading(false)
      return undefined
    }

    if (authenticatedOnceRef.current) return undefined

    authenticatedOnceRef.current = true
    setEntryLoading(true)

    const timer = window.setTimeout(() => {
      setEntryLoading(false)
    }, 4000)

    return () => window.clearTimeout(timer)
  }, [authenticated])

  if (sessionChecking) {
    return (
      <DashboardEntryLoader
        portalLabel="Manager Portal"
        detail="Checking your secure Digital Dining staff session..."
      />
    )
  }

  if (!authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-4 text-neutral-100">
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4 rounded-3xl border border-neutral-800 bg-neutral-900 p-8 shadow-2xl">
          <div className="mb-6 text-center">
            <div className="mb-3 text-5xl">🧑‍💼</div>
            <h1 className="text-2xl font-black">Restaurant Manager</h1>
            <p className="mt-2 text-xs text-neutral-500">Sign in to manage restaurant operations</p>
          </div>
          <input value={restaurantCode} onChange={(e) => setRestaurantCode(e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="5-digit Restaurant Code" inputMode="numeric" maxLength={5} required className="w-full rounded-xl border border-orange-500/30 bg-neutral-950 px-4 py-3 text-sm font-mono tracking-widest text-white outline-none focus:border-orange-500" />
          <input value={loginUserId} onChange={(e) => setLoginUserId(e.target.value)} placeholder="Manager User ID" autoComplete="username" required className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-orange-500" />
          <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="Password / PIN" autoComplete="current-password" required className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-orange-500" />
          <button disabled={loginLoading} className="w-full rounded-xl bg-orange-500 py-3 text-sm font-black uppercase text-white disabled:opacity-50">
            {loginLoading ? 'Signing in...' : 'Open Manager Dashboard'}
          </button>
        </form>
      </main>
    )
  }

  if (entryLoading) {
    return (
      <DashboardEntryLoader
        portalLabel="Manager Portal"
        detail="Preparing live orders, tables, menu and staff tools..."
      />
    )
  }

  return (
    <main className="dd-light-dashboard dd-manager-dashboard min-h-screen bg-[#f5f6f8] p-3 text-neutral-900 sm:p-6">
      <style jsx global>{`

                /*
         * Dashboard shell only.
         * The existing ThemeToggle writes data-theme="light|dark" on <html>.
         * These rules keep the new sidebar layout while allowing both themes.
         */
        .dd-light-dashboard,
        .dd-dashboard-header,
        .dd-dashboard-sidebar {
          transition:
            background-color 70ms linear,
            border-color 70ms linear,
            color 70ms linear;
        }

        :root[data-theme='light'] .dd-light-dashboard {
          background: #f5f6f8 !important;
          color: #171717 !important;
        }

        :root[data-theme='dark'] .dd-light-dashboard {
          background: #09090b !important;
          color: #f5f5f5 !important;
        }

        :root[data-theme='light'] .dd-dashboard-header {
          background: rgba(255, 255, 255, 0.97) !important;
          border-color: #e5e7eb !important;
          box-shadow: 0 1px 0 rgba(17, 24, 39, 0.04) !important;
        }

        :root[data-theme='dark'] .dd-dashboard-header {
          background: rgba(17, 17, 19, 0.97) !important;
          border-color: #2a2a2e !important;
          box-shadow: 0 1px 0 rgba(255, 255, 255, 0.035) !important;
        }

        :root[data-theme='light'] .dd-dashboard-header [class~='text-white'] {
          color: #111827 !important;
        }

        :root[data-theme='dark'] .dd-light-dashboard [class~='bg-white'] {
          background-color: #111113 !important;
        }

        :root[data-theme='dark'] .dd-light-dashboard [class~='bg-neutral-50'] {
          background-color: #18181b !important;
        }

        :root[data-theme='dark'] .dd-light-dashboard [class~='border-neutral-200'],
        :root[data-theme='dark'] .dd-light-dashboard [class~='border-neutral-300'] {
          border-color: #2f3035 !important;
        }

        :root[data-theme='dark'] .dd-light-dashboard [class~='text-neutral-900'],
        :root[data-theme='dark'] .dd-light-dashboard [class~='text-neutral-800'],
        :root[data-theme='dark'] .dd-light-dashboard [class~='text-neutral-700'] {
          color: #f4f4f5 !important;
        }

        :root[data-theme='dark'] .dd-light-dashboard [class~='text-neutral-600'] {
          color: #a1a1aa !important;
        }

        :root[data-theme='dark'] .dd-light-dashboard input,
        :root[data-theme='dark'] .dd-light-dashboard select,
        :root[data-theme='dark'] .dd-light-dashboard textarea {
          color: #f4f4f5 !important;
        }

        :root[data-theme='dark'] .dd-light-dashboard option {
          background: #111113;
          color: #f4f4f5;
        }

        .dd-light-dashboard .rounded-3xl {
          border-radius: 18px !important;
        }

        .dd-light-dashboard .rounded-2xl {
          border-radius: 14px !important;
        }

        .dd-dashboard-sidebar {
          scrollbar-width: none;
        }

        .dd-dashboard-sidebar::-webkit-scrollbar {
          display: none;
        }

        .dd-dashboard-sidebar button {
          box-shadow: none !important;
        }

        :root[data-theme='light']
          .dd-dashboard-sidebar
          button:not([class*='bg-orange-500']) {
          background: transparent !important;
          border-color: transparent !important;
          color: #525252 !important;
        }

        :root[data-theme='light']
          .dd-dashboard-sidebar
          button[class*='bg-orange-500'] {
          background: #fff3e8 !important;
          border-color: transparent !important;
          color: #ea580c !important;
        }

        :root[data-theme='dark']
          .dd-dashboard-sidebar
          button:not([class*='bg-orange-500']) {
          background: transparent !important;
          border-color: transparent !important;
          color: #a1a1aa !important;
        }

        :root[data-theme='dark']
          .dd-dashboard-sidebar
          button[class*='bg-orange-500'] {
          background: rgba(249, 115, 22, 0.13) !important;
          border-color: rgba(249, 115, 22, 0.18) !important;
          color: #fb923c !important;
        }

        .dd-dashboard-intro {
          margin-bottom: 2px;
        }

        @media (min-width: 1024px) {
          .dd-owner-dashboard .dd-dashboard-main {
            max-width: none !important;
            margin-left: 0 !important;
            margin-right: 0 !important;
            padding-left: 244px !important;
            padding-right: 24px !important;
          }

          .dd-owner-dashboard .dd-dashboard-sidebar {
            position: fixed;
            left: 0;
            top: 82px;
            bottom: 0;
            z-index: 20;
            width: 220px;
            display: flex !important;
            flex-direction: column;
            gap: 4px !important;
            overflow-y: auto;
            border-right: 1px solid;
            border-bottom: 0 !important;
            padding: 18px 12px;
          }

          :root[data-theme='light']
            .dd-owner-dashboard
            .dd-dashboard-sidebar {
            background: #ffffff !important;
            border-right-color: #e5e7eb !important;
          }

          :root[data-theme='dark']
            .dd-owner-dashboard
            .dd-dashboard-sidebar {
            background: #111113 !important;
            border-right-color: #2a2a2e !important;
          }

          .dd-manager-dashboard {
            padding-left: 240px !important;
          }

          .dd-manager-dashboard .dd-manager-inner {
            max-width: none !important;
            margin: 0 !important;
          }

          .dd-manager-dashboard .dd-dashboard-header {
            margin-left: -240px;
            padding-left: 264px !important;
            padding-right: 24px !important;
          }

          .dd-manager-dashboard .dd-dashboard-sidebar {
            position: fixed;
            left: 0;
            top: 0;
            bottom: 0;
            z-index: 30;
            width: 220px;
            display: flex !important;
            flex-direction: column;
            gap: 4px !important;
            overflow-y: auto;
            border-right: 1px solid;
            border-bottom: 0 !important;
            padding: 84px 12px 18px;
          }

          :root[data-theme='light']
            .dd-manager-dashboard
            .dd-dashboard-sidebar {
            background: #ffffff !important;
            border-right-color: #e5e7eb !important;
          }

          :root[data-theme='dark']
            .dd-manager-dashboard
            .dd-dashboard-sidebar {
            background: #111113 !important;
            border-right-color: #2a2a2e !important;
          }

          .dd-manager-dashboard .dd-dashboard-sidebar::before {
            content: 'Digital Dining';
            position: absolute;
            left: 20px;
            top: 24px;
            font-size: 13px;
            font-weight: 900;
            letter-spacing: -0.01em;
          }

          :root[data-theme='light']
            .dd-manager-dashboard
            .dd-dashboard-sidebar::before {
            color: #111827;
          }

          :root[data-theme='dark']
            .dd-manager-dashboard
            .dd-dashboard-sidebar::before {
            color: #f4f4f5;
          }

          .dd-dashboard-sidebar button {
            width: 100%;
            justify-content: flex-start !important;
            text-align: left !important;
            border-radius: 12px !important;
            padding: 11px 12px !important;
            font-size: 11px !important;
            line-height: 1.3 !important;
            text-transform: none !important;
            letter-spacing: 0 !important;
          }
        }

        @media (max-width: 1023px) {
          .dd-dashboard-sidebar {
            display: flex;
            overflow-x: auto;
            gap: 8px;
            padding-bottom: 10px;
            border-bottom: 1px solid;
          }

          :root[data-theme='light'] .dd-dashboard-sidebar {
            border-bottom-color: #e5e7eb !important;
          }

          :root[data-theme='dark'] .dd-dashboard-sidebar {
            border-bottom-color: #2a2a2e !important;
          }

          .dd-dashboard-sidebar button {
            flex: 0 0 auto;
          }
        }
      `}</style>
      <div className="dd-manager-inner mx-auto max-w-7xl space-y-5">
        <header className="dd-dashboard-header flex flex-col justify-between gap-4 border-b border-neutral-200 bg-white px-4 py-4 shadow-sm lg:flex-row lg:items-center sm:px-6">
          <div>
            <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-orange-400">Restaurant Manager Portal</span>
            <h1 className="mt-3 text-2xl font-black sm:text-3xl">{restaurant?.name || 'Restaurant'} Manager Dashboard</h1>
            <p className="mt-1 text-xs text-neutral-500">Manage live orders, tables, menu and staff operations from one place.</p>
            <p className="mt-2 inline-flex rounded-lg border border-orange-500/20 bg-orange-500/10 px-3 py-1.5 text-[11px] font-black font-mono tracking-widest text-orange-300">Restaurant Code: {restaurant?.restaurant_code || restaurantCode || '-----'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ThemeToggle />
            <button onClick={handleStoreToggle} className={`rounded-xl px-4 py-2.5 text-xs font-black ${storeOpen ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>{storeOpen ? '🟢 Store Open' : '🔴 Store Closed'}</button>
            <button onClick={fetchDashboard} className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2.5 text-xs font-black">{loading ? 'Refreshing...' : '↻ Refresh'}</button>
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="rounded-xl border border-orange-500/20 bg-orange-500/10 px-4 py-2.5 text-xs font-black text-orange-300"
            >
              👤 Profile
            </button>
            <button onClick={logout} className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-xs font-black text-red-400">Log Out ⎋</button>
          </div>
        </header>

        {profileOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-orange-400">
                    Staff Account
                  </span>
                  <h2 className="mt-3 text-xl font-black text-white">Manager Profile</h2>
                  <p className="mt-1 text-xs text-neutral-500">
                    Update your display name. Login ID, role, and password remain unchanged.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setProfileOpen(false)}
                  className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-black text-neutral-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={saveManagerProfile} className="space-y-4">
                <div>
                  <label className="mb-1 block text-[10px] font-black uppercase text-neutral-400">Manager Name</label>
                  <input
                    type="text"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    maxLength={80}
                    autoComplete="name"
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-sm text-white outline-none focus:border-orange-500"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                    <p className="text-[10px] font-black uppercase text-neutral-500">User ID</p>
                    <p className="mt-1 break-all text-sm font-mono font-black text-white">{manager?.user_id || loginUserId}</p>
                  </div>
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                    <p className="text-[10px] font-black uppercase text-neutral-500">Role</p>
                    <p className="mt-1 text-sm font-black capitalize text-white">{manager?.role || 'manager'}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">Restaurant</p>
                  <p className="mt-1 text-sm font-black text-white">{restaurant?.name || 'Restaurant'}</p>
                  <p className="mt-2 text-[10px] font-mono text-neutral-500">Code: {restaurant?.restaurant_code || restaurantCode || '-----'}</p>
                </div>

                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setProfileOpen(false)} className="flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-xs font-black text-neutral-300">
                    Cancel
                  </button>
                  <button type="submit" disabled={profileSaving} className="flex-1 rounded-xl bg-orange-500 px-4 py-3 text-xs font-black text-white disabled:opacity-50">
                    {profileSaving ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {notice && <div className="fixed right-5 top-5 z-50 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-2xl">{notice}</div>}

        <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-2">
          <div className={`grid gap-2 ${hasResortAccess ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <button
              type="button"
              onClick={() => setDashboardMode('restaurant')}
              className={`rounded-2xl px-4 py-3 text-xs font-black uppercase transition ${dashboardMode === 'restaurant' ? 'bg-orange-500 text-white' : 'bg-neutral-950 text-neutral-400 hover:text-white'}`}
            >
              🍽️ Restaurant Dashboard
            </button>
            {hasResortAccess && (
              <button
                type="button"
                onClick={() => setDashboardMode('resort')}
                className={`rounded-2xl px-4 py-3 text-xs font-black uppercase transition ${dashboardMode === 'resort' ? 'bg-sky-600 text-white' : 'bg-neutral-950 text-neutral-400 hover:text-white'}`}
              >
                🏨 Resort Dashboard
              </button>
            )}
          </div>
        </div>

        {dashboardMode === 'resort' && hasResortAccess && (
          <ResortManagement
            restaurant={restaurant}
            planCode={currentPlanCode}
            advancedFeaturesEnabled={hasAdvancedResort}
          />
        )}

        {dashboardMode === 'restaurant' && (<>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat title="Total Revenue" value={money(totalRevenue)} />
          <Stat title="Orders Today" value={todayOrders.length} accent="text-emerald-400" />
          <Stat title="Active Orders" value={activeOrders.length} accent="text-orange-400" />
          <Stat title="Menu Items" value={`${menuItems.length}/${maxMenuAllowed === Infinity ? '∞' : maxMenuAllowed}`} accent="text-amber-400" />
          <Stat title="Partner Tier" value={currentPlanDisplay} accent="text-amber-400" />
        </div>

        <nav className="dd-dashboard-sidebar flex gap-2 overflow-x-auto border-b border-neutral-200 pb-3">
          {[
            ['live-orders', `▣ Live Orders (${activeOrders.length})`],
            ['tables', `⌁ Tables (${availableTableCount}/${configuredTableNumbers.length})`],
            ['settlements', '⌂ Dashboard & Reports'],
            ['menu', `≡ Menu (${menuItems.length})`],
            ['staff', `◎ Staff (${staffList.length})`],
            ['offers', `★ Offers (${dailyOffers.filter((item) => item.is_active !== false).length})`],
            ['swiggy-sync', '↻ Menu Import / Sync']
          ]
            .filter(([id]) => id !== 'settlements' || hasAdvancedAnalytics)
            .map(([id, label]) => (
            <button key={id} onClick={() => setActiveTab(id)} className={`whitespace-nowrap rounded-2xl border px-4 py-2.5 text-xs font-black uppercase ${activeTab === id ? 'border-orange-500 bg-orange-500 text-white' : 'border-neutral-800 bg-neutral-900 text-neutral-400'}`}>
              {label}
            </button>
          ))}
        </nav>

        {activeTab === 'tables' && (
          <section className="space-y-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat title="Total Tables" value={configuredTableNumbers.length} />
              <Stat title="Available Tables" value={`${availableTableCount}/${configuredTableNumbers.length}`} accent="text-emerald-400" />
              <Stat title="Occupied Tables" value={occupiedTableCount} accent="text-red-400" />
            </div>
            <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
              <h2 className="text-xl font-black">Table Status</h2>
              <p className="mt-1 text-xs text-neutral-500">A table is occupied while it has an active dine-in order.</p>
              {configuredTableNumbers.length === 0 ? (
                <p className="py-10 text-center text-sm text-neutral-500">No table QR codes have been registered by the restaurant owner.</p>
              ) : (
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                  {configuredTableNumbers.map((number) => {
                    const occupied = occupiedTableNumbers.has(number)
                    return <div key={number} className={`rounded-2xl border p-4 text-center ${occupied ? 'border-red-500/30 bg-red-500/10' : 'border-emerald-500/30 bg-emerald-500/10'}`}><div className="text-2xl">{occupied ? '🔴' : '🟢'}</div><p className="mt-2 font-black">Table {number}</p><p className={`mt-1 text-[10px] font-black uppercase ${occupied ? 'text-red-400' : 'text-emerald-400'}`}>{occupied ? 'Occupied' : 'Available'}</p></div>
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === 'live-orders' && (
          <section className="space-y-5">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <span className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-red-400">
                  Real-time Order Monitor
                </span>
                <h2 className="mt-3 text-2xl font-black">Live Orders</h2>
                <p className="mt-2 text-xs text-neutral-400">
                  New orders appear automatically without refreshing this page.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[10px] font-black text-emerald-300">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                  LIVE
                </span>
                <button
                  onClick={fetchDashboard}
                  className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2.5 text-xs font-black"
                >
                  ↻ Refresh
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat title="Active Orders" value={activeOrders.length} accent="text-orange-400" />
              <Stat title="Pending Orders" value={orders.filter((order) => String(order.status || 'pending').toLowerCase() === 'pending').length} accent="text-amber-400" />
              <Stat title="Ready Orders" value={orders.filter((order) => String(order.status || '').toLowerCase() === 'ready').length} accent="text-emerald-400" />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {activeOrders.map((order) => {
                const status = String(order.status || 'pending').toLowerCase()
                const orderItems = Array.isArray(order.items) ? order.items : []
                const orderAmount = Number(order.total_amount ?? order.total ?? 0)

                return (
                  <article
                    key={order.id}
                    className="rounded-3xl border border-orange-500/30 bg-neutral-900 p-5 shadow-lg shadow-orange-500/5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-black text-white">
                          Order #{String(order.id).slice(0, 8)}
                        </p>
                        <p className="mt-1 text-[11px] text-neutral-500">
                          {order.created_at
                            ? new Date(order.created_at).toLocaleString('en-IN')
                            : 'Time unavailable'}
                        </p>
                      </div>
                      <span className="rounded-full bg-orange-500/15 px-3 py-1.5 text-[10px] font-black uppercase text-orange-300">
                        {status}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/70 p-3 text-xs">
                      <div>
                        <p className="text-[10px] uppercase text-neutral-500">Customer</p>
                        <p className="mt-1 font-bold">{order.customer_name || order.name || 'Guest'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-neutral-500">Payment</p>
                        <p className="mt-1 font-bold">{order.payment_mode || order.payment_method || 'Not specified'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-neutral-500">Dining Mode</p>
                        <p className="mt-1 font-bold">{order.dining_mode || order.order_type || 'Dine-in'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-neutral-500">Total</p>
                        <p className="mt-1 font-black text-emerald-400">{money(orderAmount)}</p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-neutral-500">
                        Items
                      </p>
                      <div className="space-y-2">
                        {orderItems.length ? orderItems.map((item, index) => (
                          <div
                            key={`${order.id}-item-${index}`}
                            className="flex items-center justify-between gap-3 rounded-xl bg-neutral-950 px-3 py-2 text-xs"
                          >
                            <span className="font-semibold">
                              {item.qty || item.quantity || 1} × {item.name || item.title || 'Item'}
                            </span>
                            <span className="text-neutral-400">
                              {money(Number(item.price || 0) * Number(item.qty || item.quantity || 1))}
                            </span>
                          </div>
                        )) : (
                          <p className="text-xs text-neutral-500">Item details unavailable.</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      <label className="text-[10px] font-black uppercase text-neutral-500">Update status</label>
                      <select
                        value={order.status || 'pending'}
                        onChange={(event) => updateOrderStatus(order.id, event.target.value)}
                        className="flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-xs text-white"
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
                  </article>
                )
              })}
            </div>

            {!activeOrders.length && (
              <div className="rounded-3xl border border-dashed border-neutral-800 bg-neutral-900 p-14 text-center">
                <div className="text-5xl">🧾</div>
                <h3 className="mt-4 text-lg font-black">No active orders</h3>
                <p className="mt-2 text-xs text-neutral-500">
                  New customer orders will appear here instantly.
                </p>
              </div>
            )}
          </section>
        )}

        {activeTab === 'settlements' && hasAdvancedAnalytics && (
          <section className="space-y-5">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
              <div>
                <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-400">Restaurant Analytics</span>
                <h2 className="mt-3 text-2xl font-black">Sales & Order Reports</h2>
                <p className="mt-2 text-xs text-neutral-400">Review order volume, revenue, average order value, and order timing.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select value={reportTimeframe} onChange={(e) => setReportTimeframe(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-xs text-white">
                  <option value="daily">Today</option>
                  <option value="weekly">This Week</option>
                  <option value="monthly">This Month</option>
                  <option value="yearly">This Year</option>
                </select>
                <button onClick={downloadReport} className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-black">Generate CSV 📥</button>
                <button onClick={() => window.print()} className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2.5 text-xs font-black">Print 🖨️</button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat title="Orders Generated" value={reportStats.orders} />
              <Stat title="Sales Generated" value={money(reportStats.sales)} accent="text-emerald-400" />
              <Stat title="Average Order Value" value={money(reportStats.average)} accent="text-orange-400" />
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                <h3 className="font-black">Orders by Hour</h3>
                <p className="mt-1 text-xs text-neutral-500">Order activity during the selected period.</p>
                {!hourlyData.length ? <p className="py-12 text-center text-sm text-neutral-500">No orders in this period.</p> : (
                  <div className="mt-5 space-y-3">
                    {hourlyData.map((item) => {
                      const maximum = Math.max(...hourlyData.map((value) => value.orders), 1)
                      return (
                        <div key={item.hour}>
                          <div className="mb-1 flex justify-between text-xs"><span>{String(item.hour).padStart(2, '0')}:00–{String((item.hour + 1) % 24).padStart(2, '0')}:00</span><span>{item.orders} orders · {money(item.sales)}</span></div>
                          <div className="h-3 overflow-hidden rounded-full bg-neutral-950"><div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.max(5, (item.orders / maximum) * 100)}%` }} /></div>
                        </div>
                      )
                    })}
                  </div>
                )}
                {peakHour && <div className="mt-5 rounded-xl border border-orange-500/20 bg-orange-500/10 p-3 text-xs text-orange-300">Peak order time: <strong>{String(peakHour.hour).padStart(2, '0')}:00–{String((peakHour.hour + 1) % 24).padStart(2, '0')}:00</strong></div>}
              </div>

              <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                <h3 className="font-black">Order Report Details</h3>
                <div className="mt-4 space-y-3">
                  {reportOrders.slice(0, 20).map((order) => (
                    <div key={order.id} className="flex justify-between gap-3 border-b border-neutral-800 pb-3">
                      <div>
                        <p className="text-xs font-bold">Order #{String(order.id).slice(0, 8)}</p>
                        <p className="mt-1 text-[11px] text-neutral-500">{new Date(order.created_at).toLocaleString('en-IN')} · {order.payment_mode || 'Payment not specified'}</p>
                      </div>
                      <span className="text-xs font-black">{money(order.total_amount ?? order.total)}</span>
                    </div>
                  ))}
                  {!reportOrders.length && <p className="py-12 text-center text-sm text-neutral-500">No report records available.</p>}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
              <h3 className="font-black">Recent Orders & Status Management</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[650px] text-left text-xs">
                  <thead className="border-b border-neutral-800 text-neutral-500"><tr><th className="p-3">Order</th><th className="p-3">Date</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3">Update</th></tr></thead>
                  <tbody>
                    {orders.slice(0, 30).map((order) => (
                      <tr key={order.id} className="border-b border-neutral-800/70">
                        <td className="p-3 font-bold">#{String(order.id).slice(0, 8)}</td>
                        <td className="p-3 text-neutral-400">{order.created_at ? new Date(order.created_at).toLocaleString('en-IN') : '—'}</td>
                        <td className="p-3 font-black">{money(order.total_amount ?? order.total)}</td>
                        <td className="p-3">{order.status || 'pending'}</td>
                        <td className="p-3"><select value={order.status || 'pending'} onChange={(e) => updateOrderStatus(order.id, e.target.value)} className="rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs"><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="preparing">Preparing</option><option value="ready">Ready</option><option value="completed">Completed</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option></select></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!orders.length && <p className="py-10 text-center text-sm text-neutral-500">No orders found.</p>}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'menu' && (
          <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="h-fit space-y-4 rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
              <div className="flex items-center justify-between"><h2 className="font-black">{editingDishId ? 'Edit Dish' : 'Add New Dish'}</h2><span className="text-[10px] text-neutral-500">{menuItems.length}/{maxMenuAllowed === Infinity ? '∞' : maxMenuAllowed}</span></div>
              {!hasAdvancedMenuControls && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-[11px] font-bold text-amber-300">
                  🔒 Advanced pricing and Highly Reordered manual controls require Restaurant Pro or Restaurant + Resort Pro. Basic menu management remains available.
                </div>
              )}
              <form onSubmit={saveDish} className="space-y-3">
                <Input label="Dish Name" value={dish.name} onChange={(value) => setDish({ ...dish, name: value })} placeholder="Chicken Biryani" />
                <Input label="Price" type="number" value={dish.price} onChange={(value) => setDish({ ...dish, price: value })} placeholder="180" />
                <Input label="Original Price (Pro)" type="number" value={dish.original_price} onChange={(value) => hasAdvancedMenuControls && setDish({ ...dish, original_price: value })} placeholder={hasAdvancedMenuControls ? "Optional" : "Pro plan required"} />
                <Input label="Offer Price (Pro)" type="number" value={dish.offer_price} onChange={(value) => hasAdvancedMenuControls && setDish({ ...dish, offer_price: value })} placeholder={hasAdvancedMenuControls ? "Optional" : "Pro plan required"} />
                <Input label="Category" value={dish.category} onChange={(value) => setDish({ ...dish, category: value })} placeholder="Main Course" />
                <Input label="Image URL" value={dish.image_url} onChange={(value) => setDish({ ...dish, image_url: value })} placeholder="https://..." />
                <Input label="Add-ons comma separated" value={dish.addons} onChange={(value) => setDish({ ...dish, addons: value })} placeholder="Extra rice, Raita" />
                <div><label className="mb-1 block text-[10px] font-black uppercase text-neutral-400">Food Type</label><select value={dish.food_type} onChange={(e) => setDish({ ...dish, food_type: e.target.value })} className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-xs"><option value="veg">Veg</option><option value="non-veg">Non-Veg</option><option value="egg">Egg</option><option value="beverage">Beverage</option><option value="other">Other</option></select></div>
                <div><label className="mb-1 block text-[10px] font-black uppercase text-neutral-400">Highly Reordered</label><select value={dish.reorder_mode} onChange={(e) => hasAdvancedMenuControls && setDish({ ...dish, reorder_mode: e.target.value })} disabled={!hasAdvancedMenuControls} className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-xs disabled:opacity-50"><option value="auto">Automatic</option><option value="on">Always On</option><option value="off">Off</option></select></div>
                <div><label className="mb-1 block text-[10px] font-black uppercase text-neutral-400">Description</label><textarea rows={3} value={dish.description} onChange={(e) => setDish({ ...dish, description: e.target.value })} className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-xs" /></div>
                <div className="flex gap-2"><button disabled={savingDish} className="rounded-xl bg-orange-500 px-5 py-3 text-xs font-black">{savingDish ? 'Saving...' : editingDishId ? 'Update Dish' : 'Add Dish'}</button>{editingDishId && <button type="button" onClick={resetDish} className="rounded-xl bg-neutral-800 px-5 py-3 text-xs font-black">Cancel</button>}</div>
              </form>
            </div>

            <div className="grid grid-cols-1 gap-4 md:col-span-2 sm:grid-cols-2">
              {menuItems.map((item) => (
                <div key={item.id} className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                  {item.image_url && <img src={item.image_url} alt={item.name} className="h-36 w-full rounded-xl object-cover" />}
                  <div className="flex justify-between gap-3"><div><h3 className="font-black">{item.name}</h3><p className="text-[11px] text-neutral-500">{item.category || 'Other'} · {item.food_type || 'veg'}</p></div><span className="font-black text-orange-400">{money(item.offer_price ?? item.price)}</span></div>
                  {item.description && <p className="text-xs text-neutral-400">{item.description}</p>}
                  {isHighlyReordered(item) && <span className="inline-block rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-black text-amber-300">⭐ Highly Reordered</span>}
                  <div className="flex flex-wrap gap-2"><button onClick={() => startEditDish(item)} className="rounded-lg bg-neutral-800 px-3 py-2 text-[11px] font-bold">Edit</button><button onClick={() => toggleAvailability(item)} className={`rounded-lg px-3 py-2 text-[11px] font-bold ${item.is_available === false ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'}`}>{item.is_available === false ? 'Unavailable' : 'Available'}</button><button onClick={() => deleteDish(item)} className="rounded-lg bg-red-500/10 px-3 py-2 text-[11px] font-bold text-red-300">Delete</button></div>
                </div>
              ))}
              {!menuItems.length && <p className="py-12 text-center text-sm text-neutral-500">No menu items found.</p>}
            </div>
          </section>
        )}

        {activeTab === 'staff' && (
          <section className="space-y-5">
            <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
              <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-orange-400">Operational Staff</span>
              <h2 className="mt-3 text-xl font-black">Create Waiter and Kitchen Accounts</h2>
              <p className="mt-2 text-xs text-neutral-400">Manager account creation is intentionally unavailable here. This section is only for operational staff.</p>
              <div className="mt-4 inline-flex flex-col rounded-2xl border border-orange-500/20 bg-orange-500/10 px-4 py-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-orange-400">Restaurant Code</span>
                <span className="mt-1 font-mono text-2xl font-black tracking-[0.22em] text-white">{restaurant?.restaurant_code || restaurantCode || '-----'}</span>
              </div>
              <form onSubmit={saveStaff} className="mt-5 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Input label="Staff Name" value={staffName} onChange={setStaffName} placeholder="Staff name" />
                <Input label="User ID" value={staffUserId} onChange={setStaffUserId} placeholder="waiter01" />
                <Input label="Password / PIN" type="password" value={staffPassword} onChange={setStaffPassword} placeholder="Minimum 4 characters" />
                <div><label className="mb-1 block text-[10px] font-black uppercase text-neutral-400">Role</label><select value={staffRole} onChange={(e) => setStaffRole(e.target.value)} className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-xs"><option value="waiter">Waiter</option><option value="kitchen">Kitchen</option></select></div>
                <button disabled={savingStaff} className="rounded-xl bg-orange-500 px-4 py-3 text-xs font-black">{savingStaff ? 'Creating...' : 'Create Account'}</button>
              </form>
            </div>
            <div className="overflow-x-auto rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
              <table className="w-full min-w-[760px] text-left text-xs"><thead className="border-b border-neutral-800 text-neutral-500"><tr><th className="p-3">Name</th><th className="p-3">User ID</th><th className="p-3">Password / PIN</th><th className="p-3">Role</th><th className="p-3">Created</th><th className="p-3">Action</th></tr></thead><tbody>{staffList.map((staff) => <tr key={staff.id} className="border-b border-neutral-800/70"><td className="p-3 font-bold">{staff.name}</td><td className="p-3 font-mono">{staff.user_id}</td><td className="p-3 font-mono text-neutral-300">{staff.password || '••••••'}</td><td className="p-3 uppercase text-orange-400">{staff.role}</td><td className="p-3 text-neutral-500">{staff.created_at ? new Date(staff.created_at).toLocaleDateString('en-IN') : '—'}</td><td className="p-3"><button onClick={() => revokeStaff(staff)} className="rounded-lg bg-red-500/10 px-3 py-2 font-bold text-red-300">Revoke</button></td></tr>)}</tbody></table>
              {!staffList.length && <p className="py-10 text-center text-sm text-neutral-500">No waiter or kitchen accounts found.</p>}
            </div>
          </section>
        )}

        {activeTab === 'offers' && (
          <section className="space-y-5">
            <div><h2 className="text-xl font-black">🔥 Offers of the Day</h2><p className="mt-1 text-xs text-neutral-500">Create and maintain offers displayed on the QR menu.</p></div>
            <form onSubmit={saveOffer} className="grid grid-cols-1 gap-3 rounded-3xl border border-neutral-800 bg-neutral-900 p-5 sm:grid-cols-2 lg:grid-cols-4">
              <Input label="Offer Title" value={offer.title} onChange={(value) => setOffer({ ...offer, title: value })} placeholder="Biryani Special" />
              <Input label="Discount Text" value={offer.discount_text} onChange={(value) => setOffer({ ...offer, discount_text: value })} placeholder="20% OFF" />
              <Input label="Original Price" type="number" value={offer.original_price} onChange={(value) => setOffer({ ...offer, original_price: value })} placeholder="250" />
              <Input label="Offer Price" type="number" value={offer.offer_price} onChange={(value) => setOffer({ ...offer, offer_price: value })} placeholder="200" />
              <Input label="Offer Date" type="date" value={offer.offer_date} onChange={(value) => setOffer({ ...offer, offer_date: value })} />
              <Input label="Image URL" value={offer.image_url} onChange={(value) => setOffer({ ...offer, image_url: value })} placeholder="https://..." />
              <div className="sm:col-span-2"><label className="mb-1 block text-[10px] font-black uppercase text-neutral-400">Description</label><textarea rows={2} value={offer.description} onChange={(e) => setOffer({ ...offer, description: e.target.value })} className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-xs" /></div>
              <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4"><button disabled={savingOffer} className="rounded-xl bg-orange-500 px-5 py-3 text-xs font-black">{savingOffer ? 'Saving...' : editingOfferId ? 'Update Offer' : 'Create Offer'}</button>{editingOfferId && <button type="button" onClick={resetOffer} className="rounded-xl bg-neutral-800 px-5 py-3 text-xs font-black">Cancel</button>}</div>
            </form>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {dailyOffers.map((item) => <div key={item.id} className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">{item.image_url && <img src={item.image_url} alt={item.title} className="h-36 w-full rounded-xl object-cover" />}<div className="flex justify-between gap-3"><h3 className="font-black">{item.title}</h3><span className="font-black text-orange-400">{money(item.offer_price)}</span></div><p className="text-xs text-neutral-400">{item.description}</p><p className="text-[11px] text-neutral-500">{item.offer_date || '—'} {item.discount_text && `· ${item.discount_text}`}</p><div className="flex flex-wrap gap-2"><button onClick={() => editOffer(item)} className="rounded-lg bg-neutral-800 px-3 py-2 text-[11px] font-bold">Edit</button><button onClick={() => toggleOffer(item)} className={`rounded-lg px-3 py-2 text-[11px] font-bold ${item.is_active === false ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'}`}>{item.is_active === false ? 'Inactive' : 'Active'}</button><button onClick={() => deleteOffer(item)} className="rounded-lg bg-red-500/10 px-3 py-2 text-[11px] font-bold text-red-300">Delete</button></div></div>)}
              {!dailyOffers.length && <p className="py-12 text-center text-sm text-neutral-500">No offers found.</p>}
            </div>
          </section>
        )}

        {activeTab === 'swiggy-sync' && (
          <section className="mx-auto max-w-3xl space-y-5">
            <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
              <h2 className="text-xl font-black">🟠 Menu Import / Sync</h2>
              <p className="mt-2 text-xs text-neutral-400">Import menu JSON into your restaurant menu. This does not connect to or use Swiggy APIs.</p>
              <form onSubmit={handleSwiggySync} className="mt-5 space-y-4">
                <textarea rows={12} value={swiggyDataInput} onChange={(e) => setSwiggyDataInput(e.target.value)} placeholder={'[\n  {\n    "name": "Chicken Biryani",\n    "price": 320,\n    "category": "Main Course",\n    "is_veg": false,\n    "food_type": "non-veg",\n    "description": "Aromatic biryani"\n  }\n]'} className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-4 font-mono text-xs text-white outline-none focus:border-orange-500" />
                <button disabled={syncingSwiggy} className="rounded-xl bg-orange-500 px-5 py-3 text-xs font-black">{syncingSwiggy ? 'Importing...' : 'Import Menu JSON'}</button>
              </form>
            </div>
          </section>
        )}

        </>)}

        <footer className="border-t border-neutral-800 pt-5 text-center text-[10px] text-neutral-600">
          Manager access excludes payment gateway settings, tax settings, subscription, billing, and manager account creation. Those remain Owner-only.
        </footer>
      </div>
      <RestaurantChatWidget restaurantId={restaurantId} />
    </main>
  )
}
