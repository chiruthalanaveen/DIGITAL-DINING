'use client'
import ThemeToggle from '@/app/components/ThemeToggle'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ResortManagement from '@/app/components/ResortManagement'

// Real-Time Restaurant Chat Widget Component
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

function StaffLoginQrCard({ title, description, url, icon, restaurantCode }) {
  const qrUrl = `https://quickchart.io/qr?size=320&margin=2&text=${encodeURIComponent(url)}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      alert(`${title} URL copied.`)
    } catch (error) {
      console.error('Copy URL error:', error)
      window.prompt('Copy this URL:', url)
    }
  }

  const handleDownload = async () => {
    try {
      const response = await fetch(qrUrl)
      if (!response.ok) throw new Error('Unable to download QR code.')

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-login-qr.png`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (error) {
      console.error('QR download error:', error)
      window.open(qrUrl, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-3xl p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="text-3xl">{icon}</div>
        <div className="min-w-0">
          <h3 className="text-base font-black text-white">{title}</h3>
          <p className="text-xs text-neutral-400 mt-1">{description}</p>
        </div>
      </div>

      {restaurantCode && (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 text-center">
          <p className="text-[10px] uppercase tracking-wider text-orange-400 font-black">Restaurant Code</p>
          <p className="text-2xl font-black font-mono tracking-[0.3em] text-white mt-1">{restaurantCode}</p>
          <p className="text-[9px] text-neutral-500 mt-1">Staff must enter this code on the login screen.</p>
        </div>
      )}

      <div className="bg-white rounded-2xl p-3 w-fit mx-auto">
        <img
          src={qrUrl}
          alt={`${title} login QR code`}
          width="220"
          height="220"
          className="block w-[220px] h-[220px]"
          loading="lazy"
        />
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
        <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-black mb-1">
          Login URL
        </p>
        <p className="text-[11px] text-neutral-300 break-all select-all">{url}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="bg-orange-500 hover:bg-orange-600 text-white font-black py-3 rounded-xl text-xs transition"
        >
          📋 Copy URL
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="bg-neutral-800 hover:bg-neutral-700 text-white font-black py-3 rounded-xl text-xs transition"
        >
          ⬇️ Download QR
        </button>
      </div>
    </div>
  )
}

function SalesRevenueGraph({ data, formatCurrency, periodLabel }) {
  const width = 1000
  const height = 320
  const padding = { top: 24, right: 24, bottom: 58, left: 78 }
  const plotWidth = width - padding.left - padding.right
  const plotHeight = height - padding.top - padding.bottom
  const safeData = Array.isArray(data) && data.length ? data : [{ label: 'No data', revenue: 0 }]
  const maxRevenue = Math.max(...safeData.map((item) => Number(item.revenue || 0)), 1)
  const points = safeData.map((item, index) => {
    const x = safeData.length === 1
      ? padding.left + plotWidth / 2
      : padding.left + (index / (safeData.length - 1)) * plotWidth
    const y = padding.top + plotHeight - (Number(item.revenue || 0) / maxRevenue) * plotHeight
    return { ...item, x, y }
  })
  const polyline = points.map((point) => `${point.x},${point.y}`).join(' ')
  const labelStep = Math.max(1, Math.ceil(safeData.length / 8))
  const yTicks = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-emerald-400 font-black">Sales Graph</p>
          <h3 className="text-lg font-black text-white mt-1">Sales Generated</h3>
          <p className="text-xs text-neutral-500 mt-1">Revenue trend for {periodLabel}.</p>
        </div>
        <div className="sm:text-right">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-black">Period Total</p>
          <p className="text-xl font-black text-emerald-400">
            {formatCurrency(safeData.reduce((sum, item) => sum + Number(item.revenue || 0), 0))}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto" role="img" aria-label={`Sales generated graph for ${periodLabel}`}>
            {yTicks.map((tick) => {
              const y = padding.top + plotHeight - tick * plotHeight
              const value = maxRevenue * tick
              return (
                <g key={tick}>
                  <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="currentColor" className="text-neutral-800" strokeWidth="1" />
                  <text x={padding.left - 12} y={y + 4} textAnchor="end" fill="currentColor" className="text-neutral-500" fontSize="11">
                    {value >= 100000 ? `₹${(value / 100000).toFixed(1)}L` : value >= 1000 ? `₹${(value / 1000).toFixed(0)}k` : `₹${Math.round(value)}`}
                  </text>
                </g>
              )
            })}

            <polyline points={polyline} fill="none" stroke="currentColor" className="text-orange-500" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />

            {points.map((point, index) => (
              <g key={`${point.label}-${index}`}>
                <circle cx={point.x} cy={point.y} r="5" fill="currentColor" className="text-orange-400">
                  <title>{`${point.label}: ${formatCurrency(point.revenue)} · ${point.orders} order${point.orders === 1 ? '' : 's'}`}</title>
                </circle>
                {(index % labelStep === 0 || index === points.length - 1) && (
                  <text x={point.x} y={height - 24} textAnchor="middle" fill="currentColor" className="text-neutral-500" fontSize="10">
                    {point.label}
                  </text>
                )}
              </g>
            ))}
          </svg>
        </div>
      </div>

      <p className="text-[10px] text-neutral-500">Hover a point to see sales and order count for that period.</p>
    </div>
  )
}

export default function RestaurantDashboard() {
  const params = useParams()
  const restaurantId = String(params.id || params.restaurantId || '').trim()
  const router = useRouter()

  const [restaurant, setRestaurant] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)

  // Owner Profile
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileEmail, setProfileEmail] = useState('')
  const [profilePhone, setProfilePhone] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [menuItems, setMenuItems] = useState([])
  const [dailyOffers, setDailyOffers] = useState([])
  const [orders, setOrders] = useState([])
  const [restaurantTables, setRestaurantTables] = useState([])
  const [activeTab, setActiveTab] = useState('settlements')
  const [dashboardMode, setDashboardMode] = useState('restaurant')
  const [isStoreOpen, setIsStoreOpen] = useState(true)

  // Add Dish Form States
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [category, setCategory] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [description, setDescription] = useState('')
  const [foodType, setFoodType] = useState('veg')
  const [reorderMode, setReorderMode] = useState('auto')
  const [addons, setAddons] = useState([''])
  const [loading, setLoading] = useState(false)

  // Full menu item editing states
  const [editingMenuItemId, setEditingMenuItemId] = useState(null)
  const [editItemName, setEditItemName] = useState('')
  const [editItemPrice, setEditItemPrice] = useState('')
  const [editItemOriginalPrice, setEditItemOriginalPrice] = useState('')
  const [editItemOfferPrice, setEditItemOfferPrice] = useState('')
  const [editItemCategory, setEditItemCategory] = useState('')
  const [editItemDescription, setEditItemDescription] = useState('')
  const [editItemImageUrl, setEditItemImageUrl] = useState('')
  const [editItemFoodType, setEditItemFoodType] = useState('veg')
  const [editItemReorderMode, setEditItemReorderMode] = useState('auto')
  const [editItemAddons, setEditItemAddons] = useState([''])
  const [savingMenuItem, setSavingMenuItem] = useState(false)

  // Staff Management States
  const [staffList, setStaffList] = useState([])
  const [staffName, setStaffName] = useState('')
  const [staffUserId, setStaffUserId] = useState('')
  const [staffPassword, setStaffPassword] = useState('')
  const [staffRole, setStaffRole] = useState('waiter')
  const [addingStaff, setAddingStaff] = useState(false)

  // Tax & Packing Charge Configuration States
  const [sgstRate, setSgstRate] = useState(2.5)
  const [cgstRate, setCgstRate] = useState(2.5)
  const [packingCharge, setPackingCharge] = useState(20)
  const [savingTaxes, setSavingTaxes] = useState(false)

  // Inline Price Editing State (Pro+ Only)
  const [editingItemId, setEditingItemId] = useState(null)
  const [editPriceValue, setEditPriceValue] = useState('')

  // Payment Gateway Configuration States & Edit Toggle
  const [razorpayKeyId, setRazorpayKeyId] = useState('')
  const [razorpaySecret, setRazorpaySecret] = useState('')
  const [enableCounterPayment, setEnableCounterPayment] = useState(true)
  const [savingPayment, setSavingPayment] = useState(false)
  const [hasInitializedKeys, setHasInitializedKeys] = useState(false)
  const [isGatewayEditable, setIsGatewayEditable] = useState(false)
  const [showGatewayPasswordModal, setShowGatewayPasswordModal] = useState(false)
  const [gatewayPassword, setGatewayPassword] = useState('')
  const [verifyingGatewayPassword, setVerifyingGatewayPassword] = useState(false)

  // Swiggy Sync States (Pro & Pro+ Only)
  const [swiggyDataInput, setSwiggyDataInput] = useState('')
  const [syncingSwiggy, setSyncingSwiggy] = useState(false)

  // Reports Timeframe State
  const [reportTimeframe, setReportTimeframe] = useState('daily')

  // Billing & Bill Settings States
  const [selectedBillOrder, setSelectedBillOrder] = useState(null)
  const [billSearch, setBillSearch] = useState('')
  const [billDateFilter, setBillDateFilter] = useState('')
  const [billingRestaurantName, setBillingRestaurantName] = useState('')
  const [managerSignature, setManagerSignature] = useState('')
  const [restaurantLogo, setRestaurantLogo] = useState('')
  const [editingBillSettings, setEditingBillSettings] = useState(false)
  const [savingBillSettings, setSavingBillSettings] = useState(false)

  // Offers of the Day — restaurant dashboard only
  const [offerTitle, setOfferTitle] = useState('')
  const [offerDescription, setOfferDescription] = useState('')
  const [offerDiscountText, setOfferDiscountText] = useState('')
  const [offerOriginalPrice, setOfferOriginalPrice] = useState('')
  const [offerPrice, setOfferPrice] = useState('')
  const [offerDate, setOfferDate] = useState(new Date().toLocaleDateString('en-CA'))
  const [offerImageUrl, setOfferImageUrl] = useState('')
  const [savingOffer, setSavingOffer] = useState(false)
  const [editingOfferId, setEditingOfferId] = useState(null)

  // Audio Alarm Reference for Pro+ real-time order sound
  const audioRef = useRef(null)
  const prevOrdersLengthRef = useRef(0)

  // Kitchen and waiter alarm settings
  const [kitchenAlarmSound, setKitchenAlarmSound] = useState('kitchen-default')
  const [waiterAlarmSound, setWaiterAlarmSound] = useState('waiter-default')
  const [kitchenAlarmEnabled, setKitchenAlarmEnabled] = useState(true)
  const [waiterAlarmEnabled, setWaiterAlarmEnabled] = useState(true)
  const [kitchenAlarmVolume, setKitchenAlarmVolume] = useState(1)
  const [waiterAlarmVolume, setWaiterAlarmVolume] = useState(1)
  const [savingAlarmSettings, setSavingAlarmSettings] = useState(false)
  const [previewAudio, setPreviewAudio] = useState(null)

  // Prevent the 2-second dashboard refresh from overwriting alarm choices
  // while the owner is editing them.
  const alarmSettingsDirtyRef = useRef(false)

  const kitchenAlarmOptions = [
    { value: 'kitchen-default', label: 'Kitchen Default', src: '/sounds/kitchen-default.mp3' },
    { value: 'kitchen-1', label: 'Kitchen Sound 1', src: '/sounds/kitchen-1.mp3' },
    { value: 'kitchen-2', label: 'Kitchen Sound 2', src: '/sounds/kitchen-2.mp3' },
    { value: 'kitchen-3', label: 'Kitchen Sound 3', src: '/sounds/kitchen-3.mp3' },
    { value: 'kitchen-4', label: 'Kitchen Sound 4 — Double Bell', src: '/sounds/kitchen-4.mp3' },
    { value: 'kitchen-5', label: 'Kitchen Sound 5 — Fast Alert', src: '/sounds/kitchen-5.mp3' },
    { value: 'kitchen-6', label: 'Kitchen Sound 6 — Service Chime', src: '/sounds/kitchen-6.mp3' },
    { value: 'kitchen-7', label: 'Kitchen Sound 7 — Urgent Pulse', src: '/sounds/kitchen-7.mp3' },
    { value: 'kitchen-8', label: 'Kitchen Sound 8 — Triple Ding', src: '/sounds/kitchen-8.mp3' },
  ]

  const waiterAlarmOptions = [
    { value: 'waiter-default', label: 'Waiter Default', src: '/sounds/waiter-default.mp3' },
    { value: 'waiter-1', label: 'Waiter Sound 1', src: '/sounds/waiter-1.mp3' },
    { value: 'waiter-2', label: 'Waiter Sound 2', src: '/sounds/waiter-2.mp3' },
    { value: 'waiter-3', label: 'Waiter Sound 3', src: '/sounds/waiter-3.mp3' },
    { value: 'waiter-4', label: 'Waiter Sound 4', src: '/sounds/waiter-4.mp3' },
    { value: 'waiter-5', label: 'Waiter Sound 5 — Soft Ding', src: '/sounds/waiter-5.mp3' },
    { value: 'waiter-6', label: 'Waiter Sound 6 — Double Chime', src: '/sounds/waiter-6.mp3' },
    { value: 'waiter-7', label: 'Waiter Sound 7 — Ready Bell', src: '/sounds/waiter-7.mp3' },
    { value: 'waiter-8', label: 'Waiter Sound 8 — Pop Alert', src: '/sounds/waiter-8.mp3' },
    { value: 'waiter-9', label: 'Waiter Sound 9 — Quick Pulse', src: '/sounds/waiter-9.mp3' },
  ]

  // Subscription-wise feature control.
  // plan_code is the canonical plan value. Legacy `plan` is used only for old accounts.
  const legacyPlan = String(restaurant?.plan || 'Standard')
  const legacyPlanCode =
    legacyPlan === 'Pro+'
      ? 'restaurant_resort_pro'
      : legacyPlan === 'Pro'
        ? 'restaurant_pro'
        : 'restaurant_standard'

  const currentPlanCode = String(restaurant?.plan_code || legacyPlanCode).toLowerCase()

  const PLAN_FEATURES = {
    restaurant_standard: {
      code: 'restaurant_standard',
      name: 'Restaurant Standard',
      monthlyPrice: 799,
      advanced: false,
      resort: false,
      advancedResort: false,
      menuLimit: 50,
    },
    restaurant_pro: {
      code: 'restaurant_pro',
      name: 'Restaurant Pro',
      monthlyPrice: 1299,
      advanced: true,
      resort: false,
      advancedResort: false,
      menuLimit: Infinity,
    },
    restaurant_resort_standard: {
      code: 'restaurant_resort_standard',
      name: 'Restaurant + Resort Standard',
      monthlyPrice: 1999,
      advanced: false,
      resort: true,
      advancedResort: false,
      menuLimit: 50,
    },
    restaurant_resort_pro: {
      code: 'restaurant_resort_pro',
      name: 'Restaurant + Resort Pro',
      monthlyPrice: 2999,
      advanced: true,
      resort: true,
      advancedResort: true,
      menuLimit: Infinity,
    },
  }

  const planFeatures = PLAN_FEATURES[currentPlanCode] || PLAN_FEATURES.restaurant_standard
  const currentPlanDisplay = planFeatures.name
  const currentPlanMonthlyPrice = planFeatures.monthlyPrice

  // Base restaurant features are available on all four plans.
  // Pro-only restaurant features:
  const hasAdvancedAnalytics = planFeatures.advanced
  const hasManagerManagement = planFeatures.advanced
  const hasAdvancedMenuControls = planFeatures.advanced
  const hasRealtimeOrderAlarm = planFeatures.advanced

  // Resort features are available only on Restaurant + Resort plans.
  // Resort access follows the active subscription plan exactly.
  // A stale resort_enabled database flag must not unlock resort features on restaurant-only plans.
  const resortModuleEnabled = planFeatures.resort
  const hasAdvancedResortFeatures = planFeatures.advancedResort

  // Menu Management is included in all four plans. The feature matrix does not impose a plan-based menu-item limit.
  const maxMenuAllowed = Infinity

  // SECURITY: The restaurant ID in the URL is not authentication.
  // The authenticated Supabase user must own the dashboard being opened.
  useEffect(() => {
    let cancelled = false

    const verifyDashboardAccess = async () => {
      if (!restaurantId) {
        router.replace('/login')
        return
      }

      const {
        data: { user },
        error
      } = await supabase.auth.getUser()

      if (error || !user) {
        if (!cancelled) router.replace('/login')
        return
      }

      if (!cancelled) {
        setProfileName(
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          ''
        )
        setProfileEmail(user.email || '')
      }

      const { data: ownedRestaurant, error: ownershipError } = await supabase
        .from('restaurants')
        .select('id, owner_id')
        .eq('id', restaurantId)
        .eq('owner_id', user.id)
        .maybeSingle()

     if (ownershipError || !ownedRestaurant) {
  console.error('Dashboard ownership verification failed:', {
    restaurantId,
    userId: user?.id,
    ownershipError,
    ownedRestaurant,
  })

  if (!cancelled) {
    router.replace('/login')
  }

  return
}

      if (!cancelled) setAuthChecked(true)
    }

    verifyDashboardAccess()

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT' || !session?.user) {
          router.replace('/login')
        }
      }
    )

    return () => {
      cancelled = true
      authListener?.subscription?.unsubscribe()
    }
  }, [restaurantId, router])

  useEffect(() => {
    alarmSettingsDirtyRef.current = false
  }, [restaurantId])

  useEffect(() => {
    async function fetchDashboard() {
      if (!authChecked || !restaurantId) return

      const {
        data: { user },
        error: authError
      } = await supabase.auth.getUser()

      if (authError || !user) {
        router.replace('/login')
        return
      }

      const { data: ownedRestaurant, error: ownershipError } = await supabase
        .from('restaurants')
        .select('id, owner_id')
        .eq('id', restaurantId)
        .eq('owner_id', user.id)
        .maybeSingle()

      if (ownershipError || !ownedRestaurant) {
        console.error('Dashboard ownership check failed:', ownershipError)
        router.replace('/login')
        return
      }

      const { data: restData, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('id', restaurantId)
        .maybeSingle()

      if (error || !restData) {
        router.replace('/login')
        return
      }

      setRestaurant(restData)

      setProfilePhone(String(restData.phone || ''))

      // The dashboard polls every 2 seconds. Do not overwrite an in-progress
      // alarm edit with the previously saved database value.
      if (!alarmSettingsDirtyRef.current) {
        setKitchenAlarmSound(restData.kitchen_alarm_sound || 'kitchen-default')
        setWaiterAlarmSound(restData.waiter_alarm_sound || 'waiter-default')
        setKitchenAlarmEnabled(restData.kitchen_alarm_enabled ?? true)
        setWaiterAlarmEnabled(restData.waiter_alarm_enabled ?? true)
        setKitchenAlarmVolume(Number(restData.kitchen_alarm_volume ?? 1))
        setWaiterAlarmVolume(Number(restData.waiter_alarm_volume ?? 1))
      }

      setBillingRestaurantName((prev) =>
        prev || restData.billing_restaurant_name || restData.name || ''
      )
      setManagerSignature((prev) =>
        prev || restData.manager_signature || ''
      )
      setRestaurantLogo((prev) =>
        prev || restData.logo_url || ''
      )

      if (!hasInitializedKeys && !savingPayment) {
        const keyId = restData.razorpay_key_id || ''
        const keySec = restData.razorpay_secret || ''

        setRazorpayKeyId(keyId)
        setRazorpaySecret(keySec)
        setEnableCounterPayment(
          restData.enable_counter_payment ?? true
        )
        setSgstRate(restData.sgst_rate ?? 2.5)
        setCgstRate(restData.cgst_rate ?? 2.5)
        setPackingCharge(restData.packing_charge ?? 20)
        setHasInitializedKeys(true)

        if (keyId || keySec) {
          setIsGatewayEditable(false)
        } else {
          setIsGatewayEditable(true)
        }
      }

      const { data: menuData } = await supabase
        .from('menu_items')
        .select('*')
        .eq('restaurant_id', restaurantId)

      if (menuData) setMenuItems(menuData)

      const { data: staffData } = await supabase
        .from('staff_users')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })

      if (staffData) setStaffList(staffData)

      const { data: orderData } = await supabase
        .from('orders')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })

      const { data: tableData, error: tableError } = await supabase
        .from('tables')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('table_number', { ascending: true })

      if (tableError) {
        console.error('Table inventory loading error:', tableError)
      } else {
        setRestaurantTables(Array.isArray(tableData) ? tableData : [])
      }

      if (orderData) {
        if (
          hasRealtimeOrderAlarm &&
          orderData.length > prevOrdersLengthRef.current &&
          prevOrdersLengthRef.current > 0
        ) {
          if (audioRef.current) {
            audioRef.current
              .play()
              .catch((e) =>
                console.log('Audio play blocked:', e)
              )
          }
        }

        prevOrdersLengthRef.current = orderData.length
        setOrders(orderData)
      }
    }

    fetchDashboard()

    const interval = setInterval(fetchDashboard, 2000)

    return () => clearInterval(interval)
  }, [
    authChecked,
    restaurantId,
    router,
    currentPlanCode,
    hasInitializedKeys,
    savingPayment
  ])

  const configuredTableNumbers = [...new Set(
    restaurantTables
      .map((table, index) => String(table?.table_number ?? table?.number ?? table?.table_no ?? table?.name ?? (index + 1)).trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))

  const activeTableOrders = orders.filter((order) => {
    const status = String(order?.status || '').trim().toLowerCase()
    if (['completed', 'cancelled', 'delivered'].includes(status)) return false
    const tableNumber = String(order?.table_number ?? '').trim()
    if (!tableNumber) return false
    const diningMode = String(order?.dining_mode ?? order?.order_type ?? 'dine-in').trim().toLowerCase()
    return !['parcel', 'takeaway', 'take-away', 'delivery'].some((mode) => diningMode.includes(mode))
  })

  const occupiedTableNumbers = new Set(activeTableOrders.map((order) => String(order.table_number).trim()))
  const occupiedTableCount = configuredTableNumbers.filter((number) => occupiedTableNumbers.has(number)).length
  const availableTableCount = Math.max(0, configuredTableNumbers.length - occupiedTableCount)

  const updateOrderStatus = async (orderId, newStatus) => {
    setOrders(
      orders.map((o) =>
        o.id === orderId
          ? { ...o, status: newStatus }
          : o
      )
    )

    await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId)
  }

  const toggleItemAvailability = async (
    itemId,
    currentAvailability
  ) => {
    if (!hasAdvancedMenuControls) {
      alert(
        '🔒 Advanced menu controls are available on Restaurant Pro and Restaurant + Resort Pro.'
      )
      return
    }

    const updatedStatus = !currentAvailability

    setMenuItems(
      menuItems.map((item) =>
        item.id === itemId
          ? { ...item, is_available: updatedStatus }
          : item
      )
    )

    const { error } = await supabase
      .from('menu_items')
      .update({ is_available: updatedStatus })
      .eq('id', itemId)

    if (error) {
      alert(
        'Failed to update availability: ' + error.message
      )
    }
  }

  const handleSaveItemPrice = async (itemId) => {
    if (!hasAdvancedMenuControls) {
      alert(
        '🔒 Advanced menu pricing is available on Restaurant Pro and Restaurant + Resort Pro.'
      )
      setEditingItemId(null)
      return
    }

    const newPrice = parseFloat(editPriceValue)

    if (isNaN(newPrice) || newPrice <= 0) {
      alert('Please enter a valid price.')
      return
    }

    setMenuItems(
      menuItems.map((item) =>
        item.id === itemId
          ? { ...item, price: newPrice }
          : item
      )
    )

    setEditingItemId(null)

    const { error } = await supabase
      .from('menu_items')
      .update({ price: newPrice })
      .eq('id', itemId)

    if (error) {
      alert('Failed to update price: ' + error.message)
    } else {
      alert('Dish price modified successfully! ✅')
    }
  }

  // Calculates how many units of a menu item appear in orders.
  // Supports item.id, item.menu_item_id and item.name matching.
  const getItemOrderCount = (menuItem, orderList = orders) => {
    if (!menuItem || !Array.isArray(orderList)) return 0

    return orderList.reduce((total, order) => {
      if (
        order?.status === 'cancelled' ||
        !Array.isArray(order?.items)
      ) {
        return total
      }

      return (
        total +
        order.items.reduce((itemTotal, orderedItem) => {
          const sameId =
            orderedItem?.id &&
            menuItem?.id &&
            String(orderedItem.id) ===
              String(menuItem.id)

          const sameMenuItemId =
            orderedItem?.menu_item_id &&
            menuItem?.id &&
            String(orderedItem.menu_item_id) ===
              String(menuItem.id)

          const sameName =
            orderedItem?.name &&
            menuItem?.name &&
            String(orderedItem.name)
              .trim()
              .toLowerCase() ===
              String(menuItem.name)
                .trim()
                .toLowerCase()

          if (sameId || sameMenuItemId || sameName) {
            return (
              itemTotal +
              Number(
                orderedItem?.qty ||
                  orderedItem?.quantity ||
                  1
              )
            )
          }

          return itemTotal
        }, 0)
      )
    }, 0)
  }

  // Automatic badge:
  // - Looks at actual non-cancelled orders
  // - Considers the top 25% of ordered items
  // - Requires at least 5 units ordered
  const getAutomaticHighlyReorderedIds = (
    items = menuItems
  ) => {
    const ranked = items
      .map((item) => ({
        id: item.id,
        count: getItemOrderCount(item)
      }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)

    if (ranked.length === 0) return new Set()

    const topCount = Math.max(
      1,
      Math.ceil(ranked.length * 0.25)
    )

    const threshold =
      ranked[topCount - 1]?.count || 0

    return new Set(
      ranked
        .filter(
          (item) =>
            item.count >= Math.max(5, threshold)
        )
        .map((item) => item.id)
    )
  }

  const isItemHighlyReordered = (
    item,
    automaticIds
  ) => {
    if (!item) return false

    const mode = item.reorder_mode || 'auto'

    if (mode === 'on') return true

    if (mode === 'off') return false

    return automaticIds.has(item.id)
  }

  const getFoodTypeLabel = (type) => {
    const labels = {
      veg: 'Veg',
      'non-veg': 'Non-Veg',
      egg: 'Egg',
      beverage: 'Beverage',
      other: 'Other'
    }

    return labels[type] || 'Other'
  }

  const getFoodTypeClasses = (type) => {
    const classes = {
      veg: 'bg-emerald-500',
      'non-veg': 'bg-red-500',
      egg: 'bg-amber-400',
      beverage: 'bg-sky-400',
      other: 'bg-neutral-400'
    }

    return classes[type] || classes.other
  }

  const startEditingMenuItem = (item) => {
    setEditingMenuItemId(item.id)

    setEditItemName(item.name || '')
    setEditItemPrice(item.price ?? '')
    setEditItemOriginalPrice(item.original_price ?? '')
    setEditItemOfferPrice(item.offer_price ?? '')
    setEditItemCategory(item.category || '')
    setEditItemDescription(item.description || '')
    setEditItemImageUrl(item.image_url || '')

    setEditItemFoodType(
      item.food_type ||
        (item.is_veg ? 'veg' : 'non-veg')
    )

    setEditItemReorderMode(
      item.reorder_mode || 'auto'
    )

    setEditItemAddons(
      Array.isArray(item.addons) &&
        item.addons.length > 0
        ? item.addons
        : ['']
    )
  }

  const cancelEditingMenuItem = () => {
    setEditingMenuItemId(null)
    setEditItemName('')
    setEditItemPrice('')
    setEditItemOriginalPrice('')
    setEditItemOfferPrice('')
    setEditItemCategory('')
    setEditItemDescription('')
    setEditItemImageUrl('')
    setEditItemFoodType('veg')
    setEditItemReorderMode('auto')
    setEditItemAddons([''])
  }

  const handleSaveMenuItem = async (itemId) => {
    if (savingMenuItem) return

    if (!editItemName.trim()) {
      alert('Please enter an item name.')
      return
    }

    const parsedPrice = parseFloat(editItemPrice)
    const parsedOriginalPrice =
      editItemOriginalPrice === ''
        ? null
        : parseFloat(editItemOriginalPrice)
    const parsedOfferPrice =
      editItemOfferPrice === ''
        ? null
        : parseFloat(editItemOfferPrice)

    if (
      isNaN(parsedPrice) ||
      parsedPrice <= 0
    ) {
      alert('Please enter a valid price.')
      return
    }

    if (
      parsedOriginalPrice !== null &&
      (isNaN(parsedOriginalPrice) || parsedOriginalPrice <= 0)
    ) {
      alert('Please enter a valid original price.')
      return
    }

    if (
      parsedOfferPrice !== null &&
      (isNaN(parsedOfferPrice) || parsedOfferPrice <= 0)
    ) {
      alert('Please enter a valid offer price.')
      return
    }

    if (
      parsedOriginalPrice !== null &&
      parsedOfferPrice !== null &&
      parsedOfferPrice >= parsedOriginalPrice
    ) {
      alert('Offer price must be lower than the original price.')
      return
    }

    // The existing Pro+ price protection remains in place.
    // An offer also changes the effective customer price, so offer pricing
    // follows the same protection and does not bypass the existing plan rule.
    if (!hasAdvancedMenuControls) {
      const currentItem = menuItems.find(
        (item) => item.id === itemId
      )

      const currentOriginal =
        currentItem?.original_price == null
          ? null
          : Number(currentItem.original_price)
      const currentOffer =
        currentItem?.offer_price == null
          ? null
          : Number(currentItem.offer_price)

      const pricingChanged =
        currentItem &&
        (Number(currentItem.price) !== parsedPrice ||
          currentOriginal !== parsedOriginalPrice ||
          currentOffer !== parsedOfferPrice)

      if (pricingChanged) {
        alert(
          '🔒 Advanced price and offer modification is available on Restaurant Pro and Restaurant + Resort Pro.'
        )
        return
      }
    }

    // When an offer price is entered, that becomes the live menu price.
    // Otherwise the existing Price field remains the live customer price.
    const livePrice =
      parsedOfferPrice !== null
        ? parsedOfferPrice
        : parsedPrice

    setSavingMenuItem(true)

    const validEditAddons =
      editItemAddons.filter(
        (a) => a.trim() !== ''
      )

    const updatedData = {
      name: editItemName.trim(),
      price: livePrice,
      original_price: parsedOriginalPrice,
      offer_price: parsedOfferPrice,
      category: editItemCategory.trim(),
      description:
        editItemDescription.trim(),
      image_url:
        editItemImageUrl.trim(),
      is_veg:
        editItemFoodType === 'veg',
      food_type:
        editItemFoodType,
      reorder_mode:
        editItemReorderMode,
      addons: validEditAddons
    }

    const { data, error } = await supabase
      .from('menu_items')
      .update(updatedData)
      .eq('id', itemId)
      .select()
      .single()

    if (error) {
      alert(
        'Failed to update menu item: ' +
          error.message
      )
    } else {
      setMenuItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? data
            : item
        )
      )

      alert(
        'Menu item updated successfully! ✅'
      )

      cancelEditingMenuItem()
    }

    setSavingMenuItem(false)
  }

  const handleAddDish = async (e) => {
    e.preventDefault()

    if (!restaurant) return

    if (menuItems.length >= maxMenuAllowed) {
      alert(
        'Menu item limit reached.'
      )
      return
    }

    if (!name.trim()) {
      alert('Please enter the item name.')
      return
    }

    const parsedPrice = parseFloat(price)

    if (
      isNaN(parsedPrice) ||
      parsedPrice <= 0
    ) {
      alert('Please enter a valid price.')
      return
    }

    if (!category.trim()) {
      alert('Please enter a category.')
      return
    }

    setLoading(true)

    const validAddons =
      addons.filter((a) => a.trim() !== '')

    const newItem = {
      restaurant_id: restaurant.id,
      name: name.trim(),
      price: parsedPrice,
      category: category.trim(),
      image_url: imageUrl.trim(),
      description: description.trim(),
      is_veg: foodType === 'veg',
      food_type: foodType,
      reorder_mode: reorderMode,
      addons: validAddons,
      is_available: true
    }

    const {
      data,
      error
    } = await supabase
      .from('menu_items')
      .insert([newItem])
      .select()

    if (error) {
      alert(
        'Error adding item: ' +
          error.message
      )
    } else {
      alert(
        'Dish added to your live menu!'
      )

      setName('')
      setPrice('')
      setCategory('')
      setImageUrl('')
      setDescription('')
      setFoodType('veg')
      setReorderMode('auto')
      setAddons([''])

      if (data) {
        setMenuItems((prev) => [
          ...data,
          ...prev
        ])
      }
    }

    setLoading(false)
  }

  const handleCreateStaff = async (e) => {
    e.preventDefault()

    if (
      !staffName.trim() ||
      !staffUserId.trim() ||
      !staffPassword.trim()
    ) {
      alert(
        'Please fill out all staff credentials.'
      )
      return
    }

    setAddingStaff(true)

    try {
      const newStaff = {
        restaurant_id: restaurantId,
        name: staffName.trim(),
        user_id:
          staffUserId
            .trim()
            .toLowerCase(),
        password:
          staffPassword.trim(),
        role: staffRole,
        pin:
          staffPassword.trim(),
        is_active: true
      }

      const {
        data,
        error
      } = await supabase
        .from('staff_users')
        .insert([newStaff])
        .select()

      if (error) throw error

      alert(
        `${staffRole === 'waiter' ? 'Waiter' : staffRole === 'kitchen' ? 'Kitchen' : 'Restaurant Manager'} account created successfully! 🎉`
      )

      setStaffName('')
      setStaffUserId('')
      setStaffPassword('')

      if (data) {
        setStaffList((prev) => [
          ...data,
          ...prev
        ])
      }
    } catch (err) {
      alert(
        'Error creating staff account: ' +
          err.message
      )
    } finally {
      setAddingStaff(false)
    }
  }

  const handleDeleteStaff = async (
    staffId,
    name
  ) => {
    if (
      !confirm(
        `Are you sure you want to remove staff member "${name}"?`
      )
    ) {
      return
    }

    setStaffList((prev) =>
      prev.filter(
        (s) => s.id !== staffId
      )
    )

    try {
      const { error } =
        await supabase
          .from('staff_users')
          .delete()
          .eq('id', staffId)

      if (error) throw error

      alert(
        'Staff account revoked.'
      )
    } catch (err) {
      alert(
        'Failed to delete staff: ' +
          err.message
      )
    }
  }

  const handleSaveTaxSettings =
    async (e) => {
      e.preventDefault()

      setSavingTaxes(true)

      const taxData = {
        sgst_rate:
          parseFloat(sgstRate),
        cgst_rate:
          parseFloat(cgstRate),
        packing_charge:
          parseFloat(packingCharge)
      }

      const { error } =
        await supabase
          .from('restaurants')
          .update(taxData)
          .eq(
            'id',
            restaurantId
          )

      if (error) {
        alert(
          'Failed to save tax settings: ' +
            error.message
        )
      } else {
        setRestaurant((prev) => ({
          ...prev,
          ...taxData
        }))

        alert(
          'Tax & packing charges updated successfully! ✅'
        )
      }

      setSavingTaxes(false)
    }

  const handleSwiggySync = async (e) => {
    e.preventDefault()

    if (!hasAdvancedMenuControls) {
      alert(
        '🔒 Menu import/sync is available on Restaurant Pro and Restaurant + Resort Pro.'
      )
      return
    }

    if (!swiggyDataInput.trim()) {
      alert(
        'Please provide valid Swiggy menu export JSON data.'
      )
      return
    }

    setSyncingSwiggy(true)

    try {
      const parsedItems =
        JSON.parse(
          swiggyDataInput
        )

      if (!Array.isArray(parsedItems)) {
        throw new Error(
          'Input must be a JSON array of items.'
        )
      }

      const formattedItems =
        parsedItems.map(
          (item) => ({
            restaurant_id:
              restaurant.id,
            name:
              item.name ||
              'Swiggy Item',
            price: parseFloat(
              item.price || 100
            ),
            category:
              item.category ||
              'Swiggy Sync',
            image_url:
              item.image_url ||
              '',
            description:
              item.description ||
              '',
            is_veg:
              item.is_veg ??
              true,
            food_type:
              item.food_type ||
              (
                item.is_veg === false
                  ? 'non-veg'
                  : 'veg'
              ),
            reorder_mode:
              item.reorder_mode ||
              'auto',
            is_available:
              true
          })
        )

      const {
        data,
        error
      } = await supabase
        .from('menu_items')
        .insert(
          formattedItems
        )
        .select()

      if (error) {
        throw new Error(
          error.message
        )
      }

      alert(
        `Successfully synced ${formattedItems.length} items from Swiggy menu! ✅`
      )

      setSwiggyDataInput('')

      if (data) {
        setMenuItems((prev) => [
          ...data,
          ...prev
        ])
      }
    } catch (err) {
      alert(
        'Sync Failed: Make sure your input format is valid JSON. Error: ' +
          err.message
      )
    }

    setSyncingSwiggy(false)
  }

  const handleRequestGatewayEdit = () => {
    setGatewayPassword('')
    setShowGatewayPasswordModal(true)
  }

  const handleVerifyGatewayEditPassword = async (e) => {
    e.preventDefault()

    if (!gatewayPassword.trim()) {
      alert('Please enter your login password.')
      return
    }

    setVerifyingGatewayPassword(true)

    try {
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser()

      if (userError || !user?.email) {
        throw new Error('Your login session has expired. Please log in again.')
      }

      // Re-authenticate with the same email + password used for restaurant login.
      // This protects Razorpay credentials from being edited by someone who only
      // has access to an already-open dashboard tab.
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: gatewayPassword.trim()
      })

      if (authError) {
        throw new Error('Incorrect login password. Gateway credentials remain locked.')
      }

      setGatewayPassword('')
      setShowGatewayPasswordModal(false)
      setIsGatewayEditable(true)
    } catch (err) {
      alert(err?.message || 'Password verification failed.')
    } finally {
      setVerifyingGatewayPassword(false)
    }
  }

  const handleSavePaymentSettings =
    async (e) => {
      e.preventDefault()

      setSavingPayment(true)

      const updatedData = {
        razorpay_key_id:
          razorpayKeyId.trim(),
        razorpay_secret:
          razorpaySecret.trim(),
        enable_counter_payment:
          enableCounterPayment
      }

      const { error } =
        await supabase
          .from('restaurants')
          .update(updatedData)
          .eq(
            'id',
            restaurantId
          )

      if (error) {
        alert(
          'Failed to update payment settings: ' +
            error.message
        )
      } else {
        setRestaurant(
          (prev) => ({
            ...prev,
            ...updatedData
          })
        )

        setIsGatewayEditable(false)

        alert(
          'Payment settings saved successfully! ✅'
        )
      }

      setSavingPayment(false)
    }

  const resetOfferForm = () => {
    setOfferTitle('')
    setOfferDescription('')
    setOfferDiscountText('')
    setOfferOriginalPrice('')
    setOfferPrice('')
    setOfferDate(new Date().toLocaleDateString('en-CA'))
    setOfferImageUrl('')
    setEditingOfferId(null)
  }

  const handleOfferImageFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file for the offer.')
      e.target.value = ''
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('Please use an offer image smaller than 2 MB.')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') setOfferImageUrl(reader.result)
    }
    reader.onerror = () => alert('Could not read the offer image. Please try another image.')
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const startEditingOffer = (offer) => {
    setEditingOfferId(offer.id)
    setOfferTitle(offer.title || '')
    setOfferDescription(offer.description || '')
    setOfferDiscountText(offer.discount_text || '')
    setOfferOriginalPrice(offer.original_price ?? '')
    setOfferPrice(offer.offer_price ?? '')
    setOfferDate(offer.offer_date || new Date().toLocaleDateString('en-CA'))
    setOfferImageUrl(offer.image_url || '')
    setActiveTab('offers')
  }

  const handleSaveOffer = async (e) => {
    e.preventDefault()
    if (savingOffer) return
    if (!offerTitle.trim()) { alert('Please enter an offer title.'); return }
    if (!offerDate) { alert('Please select the offer date.'); return }
    const parsedOfferPrice = parseFloat(offerPrice)
    if (isNaN(parsedOfferPrice) || parsedOfferPrice < 0) { alert('Please enter a valid offer price.'); return }
    const parsedOriginal = offerOriginalPrice === '' ? null : parseFloat(offerOriginalPrice)
    if (parsedOriginal !== null && (isNaN(parsedOriginal) || parsedOriginal < 0)) { alert('Please enter a valid original price.'); return }
    setSavingOffer(true)
    const payload = {
      restaurant_id: restaurantId,
      title: offerTitle.trim(),
      description: offerDescription.trim(),
      discount_text: offerDiscountText.trim(),
      original_price: parsedOriginal,
      offer_price: parsedOfferPrice,
      offer_date: offerDate,
      image_url: offerImageUrl.trim(),
      is_active: true
    }
    try {
      let error
      let saved
      if (editingOfferId) {
        const result = await supabase.from('daily_offers').update(payload).eq('id', editingOfferId).eq('restaurant_id', restaurantId).select().maybeSingle()
        error = result.error
        saved = result.data
      } else {
        const result = await supabase.from('daily_offers').insert([payload]).select().single()
        error = result.error
        saved = result.data
      }
      if (error) throw error
      if (saved) setDailyOffers((prev) => editingOfferId ? prev.map((item) => item.id === editingOfferId ? saved : item) : [saved, ...prev])
      const wasEditing = Boolean(editingOfferId)
      resetOfferForm()
      alert(wasEditing ? 'Offer updated successfully! ✅' : 'Offer added successfully! ✅')
    } catch (error) {
      console.error('Offer save error:', error)
      alert('Failed to save offer: ' + error.message + '\n\nMake sure the daily_offers table has been created in Supabase.')
    } finally {
      setSavingOffer(false)
    }
  }

  const toggleOffer = async (offer) => {
    const nextActive = !offer.is_active
    const { data, error } = await supabase.from('daily_offers').update({ is_active: nextActive }).eq('id', offer.id).eq('restaurant_id', restaurantId).select().maybeSingle()
    if (error) { alert('Failed to update offer: ' + error.message); return }
    if (data) setDailyOffers((prev) => prev.map((item) => item.id === offer.id ? data : item))
  }

  const deleteOffer = async (offer) => {
    if (!window.confirm(`Delete the offer "${offer.title}"?`)) return
    const { error } = await supabase.from('daily_offers').delete().eq('id', offer.id).eq('restaurant_id', restaurantId)
    if (error) { alert('Failed to delete offer: ' + error.message); return }
    setDailyOffers((prev) => prev.filter((item) => item.id !== offer.id))
    if (editingOfferId === offer.id) resetOfferForm()
  }

  // ---------------------------------------------------------
  // ANALYTICS & REPORTING
  // ---------------------------------------------------------
  const REPORT_TIMEFRAMES = [
    { label: 'Today', value: 'daily' },
    { label: 'Week', value: 'weekly' },
    { label: 'Month', value: 'monthly' },
    { label: '3 Months', value: '3months' },
    { label: '6 Months', value: '6months' },
    { label: '1 Year', value: '1year' },
    { label: '2 Years', value: '2years' },
    { label: '3 Years', value: '3years' }
  ]

  const getReportRange = (frame) => {
    const now = new Date()
    const start = new Date(now)

    if (frame === 'daily') {
      start.setHours(0, 0, 0, 0)
    } else if (frame === 'weekly') {
      const day = start.getDay()
      const daysSinceMonday = day === 0 ? 6 : day - 1
      start.setDate(start.getDate() - daysSinceMonday)
      start.setHours(0, 0, 0, 0)
    } else if (frame === 'monthly') {
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
    } else if (frame === '3months') {
      start.setMonth(start.getMonth() - 3)
      start.setHours(0, 0, 0, 0)
    } else if (frame === '6months') {
      start.setMonth(start.getMonth() - 6)
      start.setHours(0, 0, 0, 0)
    } else if (frame === '1year') {
      start.setFullYear(start.getFullYear() - 1)
      start.setHours(0, 0, 0, 0)
    } else if (frame === '2years') {
      start.setFullYear(start.getFullYear() - 2)
      start.setHours(0, 0, 0, 0)
    } else if (frame === '3years') {
      start.setFullYear(start.getFullYear() - 3)
      start.setHours(0, 0, 0, 0)
    } else if (frame === 'yearly') {
      // Backward compatibility for any existing saved/old UI state.
      start.setFullYear(start.getFullYear() - 1)
      start.setHours(0, 0, 0, 0)
    }

    return { start, end: now }
  }

  const getReportPeriodLabel = (frame) =>
    REPORT_TIMEFRAMES.find((item) => item.value === frame)?.label || 'Selected Period'

  const reportRange = getReportRange(reportTimeframe)

  const reportOrders = orders.filter((order) => {
    if (!order?.created_at || String(order.status || '').toLowerCase() === 'cancelled') return false
    const createdAt = new Date(order.created_at)
    return createdAt >= reportRange.start && createdAt <= reportRange.end
  })

  const reportOrderCount = reportOrders.length

  const reportRevenue = reportOrders.reduce(
    (sum, order) => sum + Number(order.total_amount || 0),
    0
  )

  const reportAverageOrderValue = reportOrderCount
    ? reportRevenue / reportOrderCount
    : 0

  const hourlyReport = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    orders: 0,
    revenue: 0
  }))

  reportOrders.forEach((order) => {
    const hour = new Date(order.created_at).getHours()
    hourlyReport[hour].orders += 1
    hourlyReport[hour].revenue += Number(order.total_amount || 0)
  })

  const peakHour = hourlyReport.reduce(
    (peak, item) => item.orders > peak.orders ? item : peak,
    { hour: 0, orders: 0, revenue: 0 }
  )

  const formatHour = (hour) => {
    const suffix = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour % 12 || 12
    return `${displayHour}:00 ${suffix}`
  }

  const formatCurrency = (value) =>
    `₹${Number(value || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`

  const buildSalesGraphData = (frame, orderList) => {
    const range = getReportRange(frame)
    const buckets = []
    const bucketMap = new Map()

    const addBucket = (key, label) => {
      if (bucketMap.has(key)) return
      const bucket = { key, label, revenue: 0, orders: 0 }
      bucketMap.set(key, bucket)
      buckets.push(bucket)
    }

    if (frame === 'daily') {
      for (let hour = 0; hour < 24; hour += 1) {
        addBucket(String(hour), formatHour(hour))
      }
    } else if (frame === 'weekly') {
      const cursor = new Date(range.start)
      while (cursor <= range.end) {
        const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`
        addBucket(key, cursor.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }))
        cursor.setDate(cursor.getDate() + 1)
      }
    } else if (frame === 'monthly') {
      const cursor = new Date(range.start)
      while (cursor <= range.end) {
        const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`
        addBucket(key, cursor.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }))
        cursor.setDate(cursor.getDate() + 1)
      }
    } else {
      const cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1)
      const endMonth = new Date(range.end.getFullYear(), range.end.getMonth(), 1)
      while (cursor <= endMonth) {
        const key = `${cursor.getFullYear()}-${cursor.getMonth()}`
        addBucket(
          key,
          cursor.toLocaleDateString('en-IN', {
            month: 'short',
            year: buckets.length === 0 || cursor.getMonth() === 0 ? '2-digit' : undefined
          })
        )
        cursor.setMonth(cursor.getMonth() + 1)
      }
    }

    orderList.forEach((order) => {
      if (!order?.created_at || String(order.status || '').toLowerCase() === 'cancelled') return
      const createdAt = new Date(order.created_at)
      if (createdAt < range.start || createdAt > range.end) return

      let key
      if (frame === 'daily') {
        key = String(createdAt.getHours())
      } else if (frame === 'weekly' || frame === 'monthly') {
        key = `${createdAt.getFullYear()}-${createdAt.getMonth()}-${createdAt.getDate()}`
      } else {
        key = `${createdAt.getFullYear()}-${createdAt.getMonth()}`
      }

      const bucket = bucketMap.get(key)
      if (!bucket) return
      bucket.orders += 1
      bucket.revenue += Number(order.total_amount || 0)
    })

    return buckets
  }

  const salesGraphData = buildSalesGraphData(reportTimeframe, orders)

  const handleGenerateAnalyticsReport = () => {
    if (reportOrders.length === 0) {
      alert('There are no orders in the selected period to generate a report.')
      return
    }

    const rows = [
      ['Report Period', getReportPeriodLabel(reportTimeframe)],
      ['Generated At', new Date().toLocaleString('en-IN')],
      ['Total Orders', reportOrderCount],
      ['Total Revenue', reportRevenue.toFixed(2)],
      ['Average Order Value', reportAverageOrderValue.toFixed(2)],
      ['Peak Sales Hour', formatHour(peakHour.hour)],
      ['Peak Hour Orders', peakHour.orders],
      [],
      ['Order ID', 'Date', 'Time', 'Status', 'Payment Mode', 'Total Amount']
    ]

    reportOrders.forEach((order) => {
      const date = new Date(order.created_at)
      rows.push([
        order.id || '',
        date.toLocaleDateString('en-IN'),
        date.toLocaleTimeString('en-IN'),
        order.status || '',
        order.payment_mode || '',
        Number(order.total_amount || 0).toFixed(2)
      ])
    })

    const csv = rows
      .map((row) => row.map((cell) => {
        const value = String(cell ?? '')
        return `"${value.replace(/"/g, '""')}"`
      }).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `restaurant-${reportTimeframe}-report-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleReportTimeframeChange = (frame) => {
    setReportTimeframe(frame)
  }

  const handleUpgradePlan =
    (targetPlan) => {
      if (!restaurantId) {
        alert(
          'Restaurant ID is missing. Please log in again.'
        )
        return
      }

      const targetPlanDetails = PLAN_FEATURES[targetPlan]
      const targetPlanName = targetPlanDetails?.name || targetPlan

      const confirmation =
        window.confirm(
          `Change your subscription to ${targetPlanName}? You will be taken to the secure payment page to continue.`
        )

      if (!confirmation) return

      // Do not update the restaurant plan directly here.
      // The existing subscription page handles Razorpay payment first.
      // The selected plan is passed without changing the existing URL path.
      router.push(
        `/subscribe/${restaurantId}?plan=${encodeURIComponent(targetPlan)}`
      )
    }

  const getAlarmSource = (options, value) => {
    return options.find((option) => option.value === value)?.src || options[0].src
  }

  const handlePreviewAlarm = (src, volume = 1) => {
    try {
      if (previewAudio) {
        previewAudio.pause()
        previewAudio.currentTime = 0
      }

      const audio = new Audio(src)
      audio.volume = Math.min(1, Math.max(0, Number(volume) || 0))
      audio.play().catch((error) => console.error('Preview audio blocked:', error))
      setPreviewAudio(audio)
    } catch (error) {
      console.error('Alarm preview error:', error)
    }
  }

  const handleSaveAlarmSettings = async (event) => {
    event.preventDefault()
    if (!restaurantId || savingAlarmSettings) return

    setSavingAlarmSettings(true)

    try {
      const requestedKitchenSound = String(kitchenAlarmSound || 'kitchen-default')
      const requestedWaiterSound = String(waiterAlarmSound || 'waiter-default')
      const requestedKitchenVolume = Math.min(
        1,
        Math.max(0, Number(kitchenAlarmVolume) || 0)
      )
      const requestedWaiterVolume = Math.min(
        1,
        Math.max(0, Number(waiterAlarmVolume) || 0)
      )

      const { data, error } = await supabase.rpc(
        'save_owner_alarm_settings',
        {
          p_restaurant_id: restaurantId,
          p_kitchen_alarm_sound: requestedKitchenSound,
          p_waiter_alarm_sound: requestedWaiterSound,
          p_kitchen_alarm_enabled: Boolean(kitchenAlarmEnabled),
          p_waiter_alarm_enabled: Boolean(waiterAlarmEnabled),
          p_kitchen_alarm_volume: requestedKitchenVolume,
          p_waiter_alarm_volume: requestedWaiterVolume,
        }
      )

      if (error) throw error

      if (!data?.success) {
        throw new Error(
          data?.message || 'Alarm settings were not saved.'
        )
      }

      const savedKitchenSound = String(
        data?.kitchenAlarmSound || ''
      )
      const savedWaiterSound = String(
        data?.waiterAlarmSound || ''
      )

      if (
        savedKitchenSound !== requestedKitchenSound ||
        savedWaiterSound !== requestedWaiterSound
      ) {
        throw new Error(
          `Database verification failed. Kitchen saved as "${savedKitchenSound || 'empty'}" and Waiter saved as "${savedWaiterSound || 'empty'}".`
        )
      }

      setKitchenAlarmSound(savedKitchenSound)
      setWaiterAlarmSound(savedWaiterSound)
      setKitchenAlarmEnabled(
        data?.kitchenAlarmEnabled ?? Boolean(kitchenAlarmEnabled)
      )
      setWaiterAlarmEnabled(
        data?.waiterAlarmEnabled ?? Boolean(waiterAlarmEnabled)
      )
      setKitchenAlarmVolume(
        Number(data?.kitchenAlarmVolume ?? requestedKitchenVolume)
      )
      setWaiterAlarmVolume(
        Number(data?.waiterAlarmVolume ?? requestedWaiterVolume)
      )

      setRestaurant((current) =>
        current
          ? {
              ...current,
              kitchen_alarm_sound: savedKitchenSound,
              waiter_alarm_sound: savedWaiterSound,
              kitchen_alarm_enabled:
                data?.kitchenAlarmEnabled ?? Boolean(kitchenAlarmEnabled),
              waiter_alarm_enabled:
                data?.waiterAlarmEnabled ?? Boolean(waiterAlarmEnabled),
              kitchen_alarm_volume:
                Number(data?.kitchenAlarmVolume ?? requestedKitchenVolume),
              waiter_alarm_volume:
                Number(data?.waiterAlarmVolume ?? requestedWaiterVolume),
            }
          : current
      )

      alarmSettingsDirtyRef.current = false

      alert(
        `Alarm settings saved ✅\nKitchen: ${savedKitchenSound}\nWaiter: ${savedWaiterSound}`
      )
    } catch (error) {
      console.error('Alarm settings save error:', error)

      // Keep the owner's chosen values on screen after a failed save.
      // This avoids silently jumping back to Default.
      alarmSettingsDirtyRef.current = true

      alert(
        `Failed to save alarm settings: ${
          error?.message || 'Please try again.'
        }`
      )
    } finally {
      setSavingAlarmSettings(false)
    }
  }

  const handleTabSwitch = (tabId) => {
    const advancedTabs = ['settlements', 'staff', 'swiggy-sync', 'alarm-settings']

    if (advancedTabs.includes(tabId) && !planFeatures.advanced) {
      alert(
        `🔒 ${currentPlanDisplay} includes Basic Analytics, but this advanced dashboard feature requires Restaurant Pro or Restaurant + Resort Pro.`
      )
      return
    }

    if (tabId === 'resort' && !resortModuleEnabled) {
      alert('🔒 Resort Management is available only on Restaurant + Resort plans.')
      return
    }

    setActiveTab(tabId)
  }


  const saveOwnerProfile = async (event) => {
    event.preventDefault()

    const cleanName = String(profileName || '').trim()
    const cleanPhone = String(profilePhone || '').replace(/\D/g, '')

    if (!cleanName) {
      alert('Please enter your name.')
      return
    }

    if (cleanName.length < 2 || cleanName.length > 80) {
      alert('Name must be between 2 and 80 characters.')
      return
    }

    if (cleanPhone && cleanPhone.length !== 10) {
      alert('Please enter a valid 10-digit phone number.')
      return
    }

    setProfileSaving(true)

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError || !user) {
        throw new Error('Your login session has expired. Please sign in again.')
      }

      const { error: metadataError } = await supabase.auth.updateUser({
        data: {
          full_name: cleanName,
        },
      })

      if (metadataError) throw metadataError

      const { error: restaurantError } = await supabase
        .from('restaurants')
        .update({
          phone: cleanPhone || null,
        })
        .eq('id', restaurantId)
        .eq('owner_id', user.id)

      if (restaurantError) throw restaurantError

      setProfileName(cleanName)
      setProfilePhone(cleanPhone)
      setRestaurant((current) =>
        current ? { ...current, phone: cleanPhone || null } : current
      )
      setProfileOpen(false)

      alert('Profile updated successfully! ✅')
    } catch (error) {
      console.error('Owner profile update error:', error)
      alert(`Unable to update profile: ${error.message || 'Please try again.'}`)
    } finally {
      setProfileSaving(false)
    }
  }

  const handleLogout = async () => {
    try {
      localStorage.removeItem(
        'digital_dining_restaurant_id'
      )

      await supabase.auth.signOut()
    } finally {
      router.replace('/login')
    }
  }

  const formatBillDate = (dateValue) => {
    if (!dateValue) return '—'
    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) return '—'

    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  }

  const formatBillTime = (dateValue) => {
    if (!dateValue) return '—'
    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) return '—'

    return date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
  }

  const getBillNumber = (order) => {
    if (!order?.id) return 'BILL-000000'

    const compactId = String(order.id)
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(-8)
      .toUpperCase()

    return `BILL-${compactId.padStart(8, '0')}`
  }

  const getOrderItemQuantity = (item) =>
    Number(item?.qty ?? item?.quantity ?? 1) || 1

  const getOrderSubtotal = (order) => {
    if (!Array.isArray(order?.items)) return 0

    return order.items.reduce(
      (sum, item) =>
        sum +
        Number(item?.price || 0) * getOrderItemQuantity(item),
      0
    )
  }

  const handleSaveBillSettings = async (e) => {
    e.preventDefault()

    const restaurantName = billingRestaurantName.trim()

    if (!restaurantName) {
      alert('Please enter a restaurant name.')
      return
    }

    setSavingBillSettings(true)

    const updatedData = {
      name: restaurantName,
      billing_restaurant_name: restaurantName,
      manager_signature: managerSignature.trim(),
      logo_url: restaurantLogo.trim()
    }

    const { error } = await supabase
      .from('restaurants')
      .update(updatedData)
      .eq('id', restaurantId)

    if (error) {
      alert(
        'Failed to save bill settings: ' +
          error.message +
          '\n\nIf the error mentions a missing column, make sure the restaurants table has billing_restaurant_name, manager_signature, and logo_url columns.'
      )
    } else {
      setRestaurant((prev) => ({
        ...prev,
        ...updatedData
      }))
      setEditingBillSettings(false)
      alert('Bill settings saved successfully! ✅')
    }

    setSavingBillSettings(false)
  }

  const handleSignatureFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file for the manager signature.')
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('Please use a signature image smaller than 2 MB.')
      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setManagerSignature(reader.result)
        setEditingBillSettings(true)
      }
    }

    reader.readAsDataURL(file)
  }

  const handleRestaurantLogoFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file for the restaurant logo.')
      e.target.value = ''
      return
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('Please use a restaurant logo image smaller than 2 MB.')
      e.target.value = ''
      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setRestaurantLogo(reader.result)
        setEditingBillSettings(true)
      }
    }

    reader.onerror = () => {
      alert('Could not read the logo image. Please try another image.')
    }

    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const clearRestaurantLogo = () => {
    setRestaurantLogo('')
  }

  const clearManagerSignature = () => {
    setManagerSignature('')
  }

  const handlePrintBill = (order) => {
    if (!order) return

    setSelectedBillOrder(order)

    setTimeout(() => {
      window.print()
    }, 100)
  }

  const filteredBillingOrders = orders.filter((order) => {
    const search = billSearch.trim().toLowerCase()

    const matchesSearch =
      !search ||
      String(order.id || '').toLowerCase().includes(search) ||
      String(order.table_number || '').toLowerCase().includes(search) ||
      String(order.waiter_name || '').toLowerCase().includes(search)

    const matchesDate =
      !billDateFilter ||
      (order.created_at &&
        new Date(order.created_at)
          .toISOString()
          .slice(0, 10) === billDateFilter)

    return matchesSearch && matchesDate
  })

  const totalRevenue =
    orders.reduce(
      (sum, o) =>
        sum +
        (
          o.status !==
          'cancelled'
            ? Number(
                o.total_amount ||
                  0
              )
            : 0
        ),
      0
    )

  const activeOrders =
    orders.filter(
      (o) =>
        o.status === 'pending' ||
        o.status === 'preparing' ||
        o.status === 'ready'
    )

  const todayString =
    new Date()
      .toISOString()
      .split('T')[0]

  const todaysOrders =
    orders.filter(
      (o) =>
        o.created_at &&
        o.created_at.split(
          'T'
        )[0] === todayString
    )

  const automaticHighlyReorderedIds =
    getAutomaticHighlyReorderedIds(
      menuItems
    )

  if (!authChecked || !restaurant) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center text-white space-y-3">
        <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin"></div>

        <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
          Loading Partner Portal...
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans pb-16">
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }

          .print-bill,
          .print-bill * {
            visibility: visible !important;
          }

          .print-bill {
            position: absolute !important;
            inset: 0 !important;
            display: block !important;
            background: white !important;
            padding: 0 !important;
          }

          .print-bill-sheet {
            width: 100% !important;
            max-width: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }

          .no-print {
            display: none !important;
          }

          @page {
            margin: 10mm;
          }
        }
      `}</style>

      <audio
        ref={audioRef}
        src="/sounds/kitchen-default.mp3"
        preload="auto"
      />

      {/* Top Partner Header */}
      <header className="bg-neutral-900 border-b border-neutral-800 sticky top-0 z-30 px-6 py-4 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">

          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-white border border-neutral-700 overflow-hidden flex items-center justify-center font-black text-orange-500 text-xl shadow-lg shadow-orange-500/20">
              {restaurant.logo_url ? (
                <img
                  src={restaurant.logo_url}
                  alt={`${restaurant.name} logo`}
                  className="w-full h-full object-contain p-1 opacity-100"
                />
              ) : (
                restaurant.name.charAt(0).toUpperCase()
              )}
            </div>

            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-black text-white">
                  {restaurant.name}
                </h1>

                <button
                  onClick={() =>
                    setIsStoreOpen(
                      !isStoreOpen
                    )
                  }
                  className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center space-x-1 border ${
                    isStoreOpen
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-red-500/10 text-red-400 border-red-500/30'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isStoreOpen
                        ? 'bg-emerald-400 animate-pulse'
                        : 'bg-red-400'
                    }`}
                  ></span>

                  <span>
                    {isStoreOpen
                      ? 'Accepting Orders'
                      : 'Store Paused'}
                  </span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-0.5">
                <p className="text-[11px] text-neutral-400 font-mono">
                  Unique URL ID: {restaurant.id}
                </p>
                {restaurant.restaurant_code && (
                  <span className="text-[11px] font-black font-mono tracking-widest bg-orange-500/10 border border-orange-500/20 text-orange-300 px-2.5 py-1 rounded-lg">
                    Restaurant Code: {restaurant.restaurant_code}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <ThemeToggle />

            <button
              onClick={() => setProfileOpen(true)}
              className="bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center space-x-2 shadow"
              type="button"
            >
              <span>👤 Profile</span>
            </button>

            <button
              onClick={() =>
                router.push(
                  `/dashboard/${restaurant.id}/qr`
                )
              }
              className="bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center space-x-2 shadow"
            >
              <span>📷 Table QR Codes</span>
            </button>

            <button
              onClick={handleLogout}
              className="bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white font-bold px-4 py-2.5 rounded-xl text-xs transition shadow"
            >
              Log Out ⎋
            </button>
          </div>
        </div>

      </header>

      {profileOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-orange-400">
                  Account
                </span>
                <h2 className="mt-3 text-xl font-black text-white">Owner Profile</h2>
                <p className="mt-1 text-xs text-neutral-500">
                  Update your personal contact details. Login credentials remain unchanged.
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

            <form onSubmit={saveOwnerProfile} className="space-y-4">
              <div>
                <label className="mb-1 block text-[10px] font-black uppercase text-neutral-400">
                  Owner Name
                </label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  maxLength={80}
                  autoComplete="name"
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-sm text-white outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-black uppercase text-neutral-400">
                  Email Address
                </label>
                <input
                  type="email"
                  value={profileEmail}
                  readOnly
                  className="w-full cursor-not-allowed rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-sm text-neutral-500 outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-[10px] font-black uppercase text-neutral-400">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={profilePhone}
                  onChange={(e) =>
                    setProfilePhone(e.target.value.replace(/\D/g, '').slice(0, 10))
                  }
                  inputMode="numeric"
                  maxLength={10}
                  autoComplete="tel"
                  placeholder="10-digit mobile number"
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-sm text-white outline-none focus:border-orange-500"
                />
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Restaurant</p>
                <p className="mt-1 text-sm font-black text-white">{restaurant?.name || 'Restaurant'}</p>
                <p className="mt-2 text-[10px] font-mono text-neutral-500 break-all">
                  Restaurant ID: {restaurant?.id || restaurantId}
                </p>
                <p className="mt-1 text-[10px] font-black text-orange-400">
                  Plan: {currentPlanDisplay}
                </p>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setProfileOpen(false)}
                  className="flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-xs font-black text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="flex-1 rounded-xl bg-orange-500 px-4 py-3 text-xs font-black text-white disabled:opacity-50"
                >
                  {profileSaving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Container */}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-6 space-y-6">

        {/* Owner workspace switch. Existing restaurant features remain unchanged. */}
        <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-2">
          <div className={`grid gap-2 ${resortModuleEnabled ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <button
              type="button"
              onClick={() => setDashboardMode('restaurant')}
              className={`rounded-2xl px-4 py-3 text-xs font-black uppercase transition ${dashboardMode === 'restaurant' ? 'bg-orange-500 text-white' : 'bg-neutral-950 text-neutral-400 hover:text-white'}`}
            >
              🍽️ Restaurant Dashboard
            </button>
            {resortModuleEnabled && (
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

        {dashboardMode === 'resort' && resortModuleEnabled && (
          <ResortManagement
            restaurant={restaurant}
            planCode={currentPlanCode}
            advancedFeaturesEnabled={hasAdvancedResortFeatures}
          />
        )}

        {dashboardMode === 'restaurant' && (
          <div className="contents">
        {/* Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-3xl shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              Total Revenue
            </p>

            <p className="text-2xl font-black text-white mt-1">
              ₹{totalRevenue}
            </p>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-3xl shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              Orders Today
            </p>

            <p className="text-2xl font-black text-emerald-400 mt-1">
              {todaysOrders.length}
            </p>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-3xl shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              Live Kitchen Queue
            </p>

            <p className="text-2xl font-black text-orange-400 mt-1">
              {activeOrders.length}
            </p>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-3xl shadow-sm flex flex-col justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                Partner Tier
              </p>

              <p className="text-xl font-black text-amber-400 mt-0.5">
                {currentPlanDisplay}
              </p>
            </div>

            <p className="text-[10px] text-neutral-500 mt-1">
              ₹{currentPlanMonthlyPrice.toLocaleString('en-IN')} / month
            </p>

            <div className="grid grid-cols-1 gap-1.5 pt-3">
              {Object.values(PLAN_FEATURES)
                .filter((plan) => plan.code !== currentPlanCode)
                .map((plan) => (
                  <button
                    key={plan.code}
                    type="button"
                    onClick={() => handleUpgradePlan(plan.code)}
                    className="w-full bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white font-bold text-[10px] py-2 px-2 rounded-lg transition text-left"
                  >
                    {plan.name} · ₹{plan.monthlyPrice.toLocaleString('en-IN')}/mo
                  </button>
                ))}
            </div>
          </div>

          <div className="bg-neutral-900 border border-orange-500/20 p-5 rounded-3xl shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-orange-400">
              Restaurant Code
            </p>
            <p className="text-3xl font-black font-mono tracking-[0.2em] text-white mt-1">
              {restaurant.restaurant_code || '-----'}
            </p>
            <p className="text-[10px] text-neutral-500 mt-1">
              Use this code with the assigned staff username and password.
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-2 border-b border-neutral-800 pb-3 overflow-x-auto">
          {[
            {
              id: 'settlements',
              label: '📊 Analytics & Reports'
            },
            {
              id: 'menu',
              label: `🍔 Menu Catalog (${menuItems.length})`
            },
            {
              id: 'staff',
              label: `👥 Manager Management (${staffList.length})`
            },
            {
              id: 'staff-access',
              label: '📱 Staff Login QR'
            },
            {
              id: 'tables',
              label: `🪑 Tables (${availableTableCount}/${configuredTableNumbers.length})`
            },
            {
              id: 'taxes',
              label: `🧾 Taxes & Packing`
            },
            {
              id: 'billing',
              label: `🧾 Billing`
            },
            {
              id: 'offers',
              label: `🔥 Offers of the Day (${dailyOffers.filter((offer) => offer.is_active).length})`
            },
            {
              id: 'swiggy-sync',
              label: '🟠 Swiggy Sync'
            },
            {
              id: 'gateway',
              label: '💳 Payment Gateways'
            },
            {
              id: 'alarm-settings',
              label: '🔔 Alarm Settings'
            },
          ]
            .filter((tab) => {
              if (['staff', 'swiggy-sync', 'alarm-settings'].includes(tab.id)) {
                return planFeatures.advanced
              }
              return true
            })
            .map((tab) => (
            <button
              key={tab.id}
              onClick={() =>
                handleTabSwitch(tab.id)
              }
              className={`px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                  : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800 border border-neutral-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'tables' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5">
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-black">Total Tables</p>
                <p className="text-3xl font-black text-white mt-2">{configuredTableNumbers.length}</p>
              </div>
              <div className="bg-neutral-900 border border-emerald-500/20 rounded-3xl p-5">
                <p className="text-[10px] uppercase tracking-wider text-emerald-400 font-black">Available</p>
                <p className="text-3xl font-black text-emerald-400 mt-2">{availableTableCount}/{configuredTableNumbers.length}</p>
              </div>
              <div className="bg-neutral-900 border border-red-500/20 rounded-3xl p-5">
                <p className="text-[10px] uppercase tracking-wider text-red-400 font-black">Occupied</p>
                <p className="text-3xl font-black text-red-400 mt-2">{occupiedTableCount}</p>
              </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div>
                  <h2 className="text-lg font-black text-white">Restaurant Tables</h2>
                  <p className="text-xs text-neutral-500 mt-1">Only table QR codes registered from your Table QR page are counted.</p>
                </div>
                <button type="button" onClick={() => router.push(`/dashboard/${restaurantId}/qr`)} className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-xl text-xs font-black">📷 Manage Table QR Codes</button>
              </div>
              {configuredTableNumbers.length === 0 ? (
                <div className="text-center py-10 text-sm text-neutral-500">No table QR codes have been registered yet.</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  {configuredTableNumbers.map((number) => {
                    const occupied = occupiedTableNumbers.has(number)
                    return (
                      <div key={number} className={`rounded-2xl border p-4 text-center ${occupied ? 'border-red-500/30 bg-red-500/10' : 'border-emerald-500/30 bg-emerald-500/10'}`}>
                        <div className="text-2xl">{occupied ? '🔴' : '🟢'}</div>
                        <p className="font-black text-white mt-2">Table {number}</p>
                        <p className={`text-[10px] font-black uppercase mt-1 ${occupied ? 'text-red-400' : 'text-emerald-400'}`}>{occupied ? 'Occupied' : 'Available'}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: MENU CATALOG */}
        {activeTab === 'menu' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* ADD ITEM */}
            <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl space-y-4 md:col-span-1 h-fit">
              <div className="flex justify-between items-center">
                <h2 className="text-md font-black text-white">
                  Add New Dish
                </h2>

                <span className="text-[10px] text-neutral-400 font-bold">
                  {menuItems.length} items · Included in all plans
                </span>
              </div>

              <form
                onSubmit={handleAddDish}
                className="space-y-4"
              >

                {/* FOOD TYPE */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                    Food Type
                  </label>

                  <div className="grid grid-cols-2 gap-2 bg-neutral-950 p-2 rounded-xl border border-neutral-800">
                    {[
                      {
                        value: 'veg',
                        label: 'Veg',
                        dot: 'bg-emerald-500',
                        active:
                          'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      },
                      {
                        value: 'non-veg',
                        label:
                          'Non-Veg',
                        dot: 'bg-red-500',
                        active:
                          'bg-red-500/20 text-red-400 border-red-500/30'
                      },
                      {
                        value: 'egg',
                        label: 'Egg',
                        dot: 'bg-amber-400',
                        active:
                          'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      },
                      {
                        value:
                          'beverage',
                        label:
                          'Beverage',
                        dot: 'bg-sky-400',
                        active:
                          'bg-sky-500/20 text-sky-300 border-sky-500/30'
                      },
                      {
                        value: 'other',
                        label: 'Other',
                        dot: 'bg-neutral-400',
                        active:
                          'bg-neutral-500/20 text-neutral-200 border-neutral-500/30'
                      }
                    ].map(
                      (type) => (
                        <button
                          key={
                            type.value
                          }
                          type="button"
                          onClick={() =>
                            setFoodType(
                              type.value
                            )
                          }
                          className={`flex items-center justify-center space-x-1.5 py-2 rounded-lg text-xs font-bold transition border ${
                            foodType ===
                            type.value
                              ? type.active
                              : 'border-transparent text-neutral-500 hover:text-neutral-300'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${type.dot}`}
                          ></span>

                          <span>
                            {
                              type.label
                            }
                          </span>
                        </button>
                      )
                    )}
                  </div>

                  <p className="text-[10px] text-neutral-500 mt-2">
                    Use Beverage for water bottles, cool drinks, juices, soda, etc.
                  </p>
                </div>

                {/* NAME */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                    Item Name
                  </label>

                  <input
                    type="text"
                    placeholder="e.g. Paneer Tikka"
                    value={name}
                    onChange={(e) =>
                      setName(
                        e.target.value
                      )
                    }
                    required
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm"
                  />
                </div>

                {/* PRICE */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                    Price (₹)
                  </label>

                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 250"
                    value={price}
                    onChange={(e) =>
                      setPrice(
                        e.target.value
                      )
                    }
                    required
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm"
                  />
                </div>

                {/* CATEGORY */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                    Category
                  </label>

                  <input
                    type="text"
                    placeholder="e.g. Starter"
                    value={category}
                    onChange={(e) =>
                      setCategory(
                        e.target.value
                      )
                    }
                    required
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm"
                  />
                </div>

                {/* DESCRIPTION */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                    Item Description
                  </label>

                  <textarea
                    rows="3"
                    placeholder="e.g. Soft and fluffy bite-sized dumplings served with chutney."
                    value={description}
                    onChange={(e) =>
                      setDescription(
                        e.target.value
                      )
                    }
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm resize-none"
                  />
                </div>

                {/* HIGHLY REORDERED */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                    Highly Reordered
                  </label>

                  <select
                    value={
                      reorderMode
                    }
                    onChange={(e) =>
                      setReorderMode(
                        e.target.value
                      )
                    }
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm"
                  >
                    <option value="auto">
                      Auto — based on customer orders
                    </option>

                    <option value="on">
                      Always show 🔥 Highly Reordered
                    </option>

                    <option value="off">
                      Never show Highly Reordered
                    </option>
                  </select>

                  <p className="text-[10px] text-neutral-500 mt-1">
                    Auto uses actual order activity. You can override it with Always or Never.
                  </p>
                </div>

                {/* IMAGE */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                    Image URL
                  </label>

                  <input
                    type="url"
                    placeholder="https://..."
                    value={imageUrl}
                    onChange={(e) =>
                      setImageUrl(
                        e.target.value
                      )
                    }
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm"
                  />
                </div>

                {/* ADDONS */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] uppercase font-bold text-neutral-400">
                      Custom Add-ons (Unlimited)
                    </label>

                    <button
                      type="button"
                      onClick={() =>
                        setAddons([
                          ...addons,
                          ''
                        ])
                      }
                      className="text-[10px] font-bold text-orange-400 hover:underline"
                    >
                      + Add More Add-on
                    </button>
                  </div>

                  <div className="space-y-2">
                    {addons.map(
                      (
                        addon,
                        index
                      ) => (
                        <div
                          key={index}
                          className="flex space-x-2"
                        >
                          <input
                            type="text"
                            placeholder={`Add-on ${
                              index + 1
                            } (e.g. Extra Cheese)`}
                            value={addon}
                            onChange={(
                              e
                            ) => {
                              const newAddons =
                                [
                                  ...addons
                                ]

                              newAddons[
                                index
                              ] =
                                e.target.value

                              setAddons(
                                newAddons
                              )
                            }}
                            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white text-xs"
                          />

                          {addons.length >
                            1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setAddons(
                                  addons.filter(
                                    (
                                      _,
                                      i
                                    ) =>
                                      i !==
                                      index
                                  )
                                )
                              }
                              className="bg-neutral-800 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 px-3 py-2 rounded-xl text-xs font-bold transition"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3.5 rounded-xl text-sm shadow-lg shadow-orange-500/20"
                >
                  {loading
                    ? 'Publishing...'
                    : '+ Publish Dish'}
                </button>
              </form>
            </div>

            {/* ACTIVE CATALOG */}
            <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl md:col-span-2 space-y-4">

              <div className="flex justify-between items-center">
                <h2 className="text-md font-black text-white">
                  Active Catalog ({menuItems.length})
                </h2>

                {!hasAdvancedMenuControls && (
                  <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-lg">
                    🔒 Advanced menu controls require Restaurant Pro or Restaurant + Resort Pro
                  </span>
                )}
              </div>

              {menuItems.length ===
              0 ? (
                <p className="text-xs text-neutral-500 py-8">
                  No dishes added to your catalog yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {menuItems.map(
                    (item) => {
                      const orderCount =
                        getItemOrderCount(
                          item
                        )

                      const highlyReordered =
                        isItemHighlyReordered(
                          item,
                          automaticHighlyReorderedIds
                        )

                      const currentItemFoodType =
                        item.food_type ||
                        (
                          item.is_veg
                            ? 'veg'
                            : 'non-veg'
                        )

                      return (
                        <div
                          key={item.id}
                          className="bg-neutral-950 border border-neutral-800 p-4 rounded-2xl space-y-4"
                        >
                          {editingMenuItemId ===
                          item.id ? (
                            /* EDIT MODE */
                            <div className="space-y-4">

                              <div className="flex items-center justify-between">
                                <div>
                                  <h3 className="font-black text-white text-sm">
                                    Edit Menu Item
                                  </h3>

                                  <p className="text-[10px] text-neutral-500 mt-0.5">
                                    Update the details customers see on your menu.
                                  </p>
                                </div>

                                <button
                                  type="button"
                                  onClick={
                                    cancelEditingMenuItem
                                  }
                                  className="bg-neutral-800 hover:bg-neutral-700 text-neutral-400 px-3 py-1.5 rounded-lg text-xs font-bold transition"
                                >
                                  ✕ Close
                                </button>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                                {/* EDIT NAME */}
                                <div>
                                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                                    Item Name
                                  </label>

                                  <input
                                    type="text"
                                    value={
                                      editItemName
                                    }
                                    onChange={(
                                      e
                                    ) =>
                                      setEditItemName(
                                        e.target.value
                                      )
                                    }
                                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-white text-sm"
                                  />
                                </div>

                                {/* EDIT PRICING */}
                                <div className="sm:col-span-2 rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4 space-y-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <label className="text-[10px] uppercase font-black text-orange-400 block">
                                        Pricing & Offer
                                      </label>
                                      <p className="text-[10px] text-neutral-500 mt-1">
                                        Set the original price and a special offer price. The offer price becomes the live menu price.
                                      </p>
                                    </div>
                                    <span className="shrink-0 bg-orange-500/10 border border-orange-500/20 text-orange-400 px-2 py-1 rounded-lg text-[9px] font-black">
                                      {hasAdvancedMenuControls ? 'PRO PRICING' : 'PRO REQUIRED'}
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div>
                                      <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                                        Original Price (₹)
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={editItemOriginalPrice}
                                        onChange={(e) => {
                                          const value = e.target.value
                                          setEditItemOriginalPrice(value)

                                          // Keep the existing Price field in sync with an offer price.
                                          if (editItemOfferPrice === '' && value !== '') {
                                            setEditItemPrice(value)
                                          }
                                        }}
                                        disabled={!hasAdvancedMenuControls}
                                        placeholder="299"
                                        className={`w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-white text-sm ${
                                          !hasAdvancedMenuControls ? 'opacity-50 cursor-not-allowed' : ''
                                        }`}
                                      />
                                    </div>

                                    <div>
                                      <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                                        Offer Price (₹)
                                      </label>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={editItemOfferPrice}
                                        onChange={(e) => {
                                          const value = e.target.value
                                          setEditItemOfferPrice(value)
                                          if (value !== '') {
                                            setEditItemPrice(value)
                                          }
                                        }}
                                        disabled={!hasAdvancedMenuControls}
                                        placeholder="199"
                                        className={`w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-white text-sm ${
                                          !hasAdvancedMenuControls ? 'opacity-50 cursor-not-allowed' : ''
                                        }`}
                                      />
                                    </div>

                                    <div>
                                      <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                                        Discount
                                      </label>
                                      <div className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 min-h-[42px] flex items-center justify-between gap-2">
                                        <span className="text-white text-sm font-black">
                                          {(() => {
                                            const original = parseFloat(editItemOriginalPrice)
                                            const offer = parseFloat(editItemOfferPrice)
                                            if (original > 0 && offer >= 0 && offer < original) {
                                              return `${Math.round(((original - offer) / original) * 100)}% OFF`
                                            }
                                            return '—'
                                          })()}
                                        </span>
                                        <span className="text-[9px] text-neutral-500 font-bold">AUTO</span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-2 text-[10px]">
                                    <span className="text-neutral-500">Live customer price:</span>
                                    <span className="font-black text-emerald-400">
                                      ₹{Number(editItemOfferPrice || editItemPrice || 0).toFixed(2)}
                                    </span>
                                    {editItemOriginalPrice && editItemOfferPrice && Number(editItemOfferPrice) < Number(editItemOriginalPrice) && (
                                      <span className="line-through text-neutral-600">
                                        ₹{Number(editItemOriginalPrice).toFixed(2)}
                                      </span>
                                    )}
                                  </div>

                                  {!hasAdvancedMenuControls && (
                                    <p className="text-[9px] text-amber-400">
                                      🔒 Price, original price and offer price editing require Restaurant Pro or Restaurant + Resort Pro.
                                    </p>
                                  )}
                                </div>

                                {/* EXISTING PRICE — KEPT FOR BACKWARD COMPATIBILITY */}
                                <div>
                                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                                    Base Price (₹)
                                  </label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editItemPrice}
                                    onChange={(e) => setEditItemPrice(e.target.value)}
                                    disabled={!hasAdvancedMenuControls}
                                    className={`w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-white text-sm ${
                                      !hasAdvancedMenuControls ? 'opacity-50 cursor-not-allowed' : ''
                                    }`}
                                  />
                                  <p className="text-[9px] text-neutral-500 mt-1">
                                    Used when no offer price is set.
                                  </p>
                                </div>

                                {/* EDIT CATEGORY */}
                                <div>
                                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                                    Category
                                  </label>

                                  <input
                                    type="text"
                                    value={
                                      editItemCategory
                                    }
                                    onChange={(
                                      e
                                    ) =>
                                      setEditItemCategory(
                                        e.target.value
                                      )
                                    }
                                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-white text-sm"
                                  />
                                </div>

                                {/* EDIT FOOD TYPE */}
                                <div>
                                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                                    Food Type
                                  </label>

                                  <select
                                    value={
                                      editItemFoodType
                                    }
                                    onChange={(
                                      e
                                    ) =>
                                      setEditItemFoodType(
                                        e.target.value
                                      )
                                    }
                                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-white text-sm"
                                  >
                                    <option value="veg">
                                      🟢 Veg
                                    </option>

                                    <option value="non-veg">
                                      🔴 Non-Veg
                                    </option>

                                    <option value="egg">
                                      🥚 Egg
                                    </option>

                                    <option value="beverage">
                                      🥤 Beverage
                                    </option>

                                    <option value="cocktail">
                                      🍹 Cocktail
                                    </option>

                                    <option value="other">
                                      ⚪ Other
                                    </option>
                                  </select>
                                </div>
                              </div>

                              {/* EDIT DESCRIPTION */}
                              <div>
                                <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                                  Item Description
                                </label>

                                <textarea
                                  rows="3"
                                  value={
                                    editItemDescription
                                  }
                                  onChange={(
                                    e
                                  ) =>
                                    setEditItemDescription(
                                      e.target.value
                                    )
                                  }
                                  placeholder="Describe the dish for customers..."
                                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-white text-sm resize-none"
                                />
                              </div>

                              {/* EDIT HIGHLY REORDERED */}
                              <div>
                                <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                                  Highly Reordered
                                </label>

                                <select
                                  value={
                                    editItemReorderMode
                                  }
                                  onChange={(
                                    e
                                  ) =>
                                    setEditItemReorderMode(
                                      e.target.value
                                    )
                                  }
                                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-white text-sm"
                                >
                                  <option value="auto">
                                    Auto — based on customer orders
                                  </option>

                                  <option value="on">
                                    Always show 🔥 Highly Reordered
                                  </option>

                                  <option value="off">
                                    Never show Highly Reordered
                                  </option>
                                </select>

                                <p className="text-[10px] text-neutral-500 mt-1">
                                  Auto follows actual order activity. Always and Never let the restaurant override it.
                                </p>
                              </div>

                              {/* EDIT IMAGE */}
                              <div>
                                <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                                  Image URL
                                </label>

                                <input
                                  type="url"
                                  value={
                                    editItemImageUrl
                                  }
                                  onChange={(
                                    e
                                  ) =>
                                    setEditItemImageUrl(
                                      e.target.value
                                    )
                                  }
                                  placeholder="https://..."
                                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-white text-sm"
                                />
                              </div>

                              {/* EDIT ADDONS */}
                              <div>
                                <div className="flex justify-between items-center mb-1">
                                  <label className="text-[10px] uppercase font-bold text-neutral-400">
                                    Custom Add-ons
                                  </label>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditItemAddons(
                                        [
                                          ...editItemAddons,
                                          ''
                                        ]
                                      )
                                    }
                                    className="text-[10px] font-bold text-orange-400 hover:underline"
                                  >
                                    + Add More Add-on
                                  </button>
                                </div>

                                <div className="space-y-2">
                                  {editItemAddons.map(
                                    (
                                      addon,
                                      index
                                    ) => (
                                      <div
                                        key={
                                          index
                                        }
                                        className="flex space-x-2"
                                      >
                                        <input
                                          type="text"
                                          placeholder={`Add-on ${
                                            index +
                                            1
                                          }`}
                                          value={
                                            addon
                                          }
                                          onChange={(
                                            e
                                          ) => {
                                            const next =
                                              [
                                                ...editItemAddons
                                              ]

                                            next[
                                              index
                                            ] =
                                              e.target.value

                                            setEditItemAddons(
                                              next
                                            )
                                          }}
                                          className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-white text-xs"
                                        />

                                        {editItemAddons.length >
                                          1 && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setEditItemAddons(
                                                editItemAddons.filter(
                                                  (
                                                    _,
                                                    i
                                                  ) =>
                                                    i !==
                                                    index
                                                )
                                              )
                                            }
                                            className="bg-neutral-800 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 px-3 py-2 rounded-xl text-xs font-bold transition"
                                          >
                                            ✕
                                          </button>
                                        )}
                                      </div>
                                    )
                                  )}
                                </div>
                              </div>

                              {/* SAVE / CANCEL */}
                              <div className="flex space-x-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSaveMenuItem(
                                      item.id
                                    )
                                  }
                                  disabled={
                                    savingMenuItem
                                  }
                                  className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3 rounded-xl text-xs transition shadow-lg shadow-orange-500/20"
                                >
                                  {savingMenuItem
                                    ? 'Saving Changes...'
                                    : 'Save Item Changes 💾'}
                                </button>

                                <button
                                  type="button"
                                  onClick={
                                    cancelEditingMenuItem
                                  }
                                  disabled={
                                    savingMenuItem
                                  }
                                  className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-5 py-3 rounded-xl text-xs font-bold transition"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* DISPLAY MODE */
                            <>
                              <div className="flex items-start justify-between gap-4">

                                <div className="min-w-0 flex-1">

                                  <div className="flex items-center space-x-2 flex-wrap gap-y-1">

                                    <span
                                      className={`w-2.5 h-2.5 rounded-full ${getFoodTypeClasses(
                                        currentItemFoodType
                                      )}`}
                                    ></span>

                                    <h3 className="font-bold text-white text-sm">
                                      {
                                        item.name
                                      }
                                    </h3>

                                    {highlyReordered && (
                                      <span className="bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide">
                                        🔥 Highly Reordered
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1">

                                    {item.original_price != null &&
                                    item.offer_price != null &&
                                    Number(item.offer_price) < Number(item.original_price) ? (
                                      <>
                                        <span className="font-black text-emerald-400 text-sm">
                                          ₹{Number(item.offer_price).toFixed(2)}
                                        </span>
                                        <span className="text-neutral-600 line-through text-xs">
                                          ₹{Number(item.original_price).toFixed(2)}
                                        </span>
                                        <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full text-[9px] font-black">
                                          {Math.round(((Number(item.original_price) - Number(item.offer_price)) / Number(item.original_price)) * 100)}% OFF
                                        </span>
                                      </>
                                    ) : (
                                      <span className="font-black text-emerald-400 text-sm">
                                        ₹{Number(item.price).toFixed(2)}
                                      </span>
                                    )}

                                    <span className="text-neutral-600">
                                      •
                                    </span>

                                    <span className="text-xs text-orange-400">
                                      {
                                        item.category ||
                                        'General'
                                      }
                                    </span>

                                    <span className="text-neutral-600">
                                      •
                                    </span>

                                    <span className="text-[10px] font-bold uppercase text-neutral-500">
                                      {
                                        getFoodTypeLabel(
                                          currentItemFoodType
                                        )
                                      }
                                    </span>

                                    <span className="text-neutral-600">
                                      •
                                    </span>

                                    <span className="text-[10px] font-bold text-neutral-500">
                                      {
                                        orderCount
                                      }{' '}
                                      order
                                      {orderCount ===
                                      1
                                        ? ''
                                        : 's'}
                                    </span>
                                  </div>

                                  {item.description && (
                                    <p className="text-xs text-neutral-400 mt-2 max-w-2xl line-clamp-2">
                                      {
                                        item.description
                                      }
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center space-x-2 shrink-0">

                                  <button
                                    type="button"
                                    onClick={() =>
                                      startEditingMenuItem(
                                        item
                                      )
                                    }
                                    className="bg-orange-500/10 hover:bg-orange-500 text-orange-400 hover:text-white border border-orange-500/20 px-3 py-2 rounded-xl text-[10px] font-black transition"
                                  >
                                    ✏️ Edit Item
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleItemAvailability(
                                        item.id,
                                        item.is_available
                                      )
                                    }
                                    className={`w-12 h-6 flex items-center rounded-full p-1 transition cursor-pointer ${
                                      item.is_available
                                        ? 'bg-emerald-600 justify-end'
                                        : 'bg-neutral-700 justify-start'
                                    }`}
                                    aria-label="Toggle item availability"
                                  >
                                    <div className="bg-white w-4 h-4 rounded-full shadow-md transform transition"></div>
                                  </button>
                                </div>
                              </div>

                              <div className="flex items-center justify-between pt-2 border-t border-neutral-800">
                                <div className="flex items-center gap-2">

                                  <span
                                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${
                                      item.is_available
                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                    }`}
                                  >
                                    {item.is_available
                                      ? 'Available'
                                      : 'Out of Stock'}
                                  </span>

                                  <span className="text-[10px] text-neutral-500">
                                    Reorder:{' '}
                                    {item.reorder_mode ===
                                    'on'
                                      ? 'Always'
                                      : item.reorder_mode ===
                                        'off'
                                      ? 'Never'
                                      : 'Auto'}
                                  </span>
                                </div>

                                {!hasAdvancedMenuControls && (
                                  <span className="text-[9px] text-neutral-600">
                                    Price editing: Restaurant Pro / Restaurant + Resort Pro
                                  </span>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )
                    }
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: STAFF LOGIN QR CODES */}
        {activeTab === 'staff-access' && (
          <div className="space-y-6">
            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-xl">
              <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-3 py-1 rounded-full uppercase font-extrabold tracking-widest">
                Secure Restaurant Access
              </span>
              <h2 className="text-2xl font-black text-white mt-3">
                Staff Login QR Codes
              </h2>
              <p className="text-xs text-neutral-400 mt-2 max-w-3xl leading-relaxed">
                Generate and share separate login QR codes for your Manager, Kitchen,
                and Waiter pages. The QR code contains only this restaurant's URL.
                Staff must enter their own credentials, and the Kitchen and Waiter
                pages verify the restaurant and role before showing data.
              </p>
            </div>

            {!restaurantId ? (
              <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-2xl p-5 text-sm font-bold">
                Restaurant ID is missing. Please reopen the dashboard from your restaurant login.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <StaffLoginQrCard
                  title="Manager Login"
                  icon="👔"
                  description="Open the existing restaurant manager dashboard. Staff must enter this restaurant's code and manager credentials."
                  restaurantCode={restaurant?.restaurant_code}
                  url={`${typeof window !== 'undefined' ? window.location.origin : 'https://www.digitaldine-in.online'}/manager/${encodeURIComponent(restaurantId)}`}
                />
                <StaffLoginQrCard
                  title="Kitchen Login"
                  icon="👨‍🍳"
                  description="Kitchen staff enter the restaurant code, Kitchen username, and password and see only this restaurant's kitchen orders."
                  restaurantCode={restaurant?.restaurant_code}
                  url={`${typeof window !== 'undefined' ? window.location.origin : ''}/kitchen/${encodeURIComponent(restaurantId)}`}
                />
                <StaffLoginQrCard
                  title="Waiter Login"
                  icon="🧑‍🍽️"
                  description="Waiters enter the restaurant code, Waiter username, and password and see only this restaurant's menu and ready orders."
                  restaurantCode={restaurant?.restaurant_code}
                  url={`${typeof window !== 'undefined' ? window.location.origin : ''}/waiter/${encodeURIComponent(restaurantId)}`}
                />
              </div>
            )}

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 text-xs text-amber-200 leading-relaxed">
              <strong className="text-amber-100">Important:</strong> These QR codes do not
              store passwords. Do not share staff passwords. If a staff member is disabled
              in Staff Management, their login should no longer be permitted.
            </div>
          </div>
        )}

        {/* TAB 3: STAFF MANAGEMENT */}
        {activeTab === 'staff' && hasManagerManagement && (
          <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-3xl max-w-4xl mx-auto space-y-6 shadow-xl">

            <div className="border-b border-neutral-800 pb-4">
              <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-3 py-1 rounded-full uppercase font-extrabold tracking-widest">
                Restaurant Manager Access Control
              </span>

              <h2 className="text-xl font-black text-white mt-2">
                Restaurant Manager Login Credentials
              </h2>

              <p className="text-xs text-neutral-400">
                Create login accounts for Waiter, Kitchen, or Restaurant Manager staff. Each role opens its own dedicated portal.
              </p>
            </div>

            <form
              onSubmit={handleCreateStaff}
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end bg-neutral-950 p-4 rounded-2xl border border-neutral-800"
            >
              <div>
                <label className="text-[10px] font-bold text-neutral-400 block mb-1 uppercase">
                  Staff Name
                </label>

                <input
                  type="text"
                  placeholder="Rahul Kumar"
                  value={staffName}
                  onChange={(e) =>
                    setStaffName(
                      e.target.value
                    )
                  }
                  required
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-neutral-400 block mb-1 uppercase">
                  User ID
                </label>

                <input
                  type="text"
                  placeholder="waiter1"
                  value={staffUserId}
                  onChange={(e) =>
                    setStaffUserId(
                      e.target.value
                    )
                  }
                  required
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-neutral-400 block mb-1 uppercase">
                  Password / PIN
                </label>

                <input
                  type="text"
                  placeholder="Secret123"
                  value={
                    staffPassword
                  }
                  onChange={(e) =>
                    setStaffPassword(
                      e.target.value
                    )
                  }
                  required
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-neutral-400 block mb-1 uppercase">
                  Role
                </label>
                <select
                  value={staffRole}
                  onChange={(e) => setStaffRole(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-orange-500"
                >
                  <option value="waiter">Waiter</option>
                  <option value="kitchen">Kitchen</option>
                  <option value="manager">Restaurant Manager</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={addingStaff}
                className="bg-orange-500 hover:bg-orange-600 text-white font-black py-2.5 rounded-xl text-xs uppercase tracking-wider transition shadow-lg shadow-orange-500/20"
              >
                {addingStaff
                  ? 'Adding...'
                  : 'Create Login ➕'}
              </button>
            </form>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-neutral-800 text-[10px] text-neutral-400 uppercase tracking-widest bg-neutral-950/40">
                    <th className="p-3 font-bold">
                      Staff Name
                    </th>
                    <th className="p-3 font-bold">
                      Login User ID
                    </th>
                    <th className="p-3 font-bold">
                      Password / PIN
                    </th>
                    <th className="p-3 font-bold">
                      Role Portal
                    </th>
                    <th className="p-3 font-bold text-right">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-neutral-800/60 text-xs">
                  {staffList.length ===
                  0 ? (
                    <tr>
                      <td
                        colSpan="5"
                        className="p-6 text-center text-neutral-500"
                      >
                        No staff accounts created yet.
                      </td>
                    </tr>
                  ) : (
                    staffList.map(
                      (staff) => (
                        <tr
                          key={staff.id}
                          className="hover:bg-neutral-800/20 transition"
                        >
                          <td className="p-3 font-bold text-white">
                            {
                              staff.name
                            }
                          </td>

                          <td className="p-3 font-mono text-neutral-300">
                            {staff.user_id || staff.pin}
                          </td>

                          <td className="p-3 font-mono text-neutral-300">
                            {staff.password || staff.pin || '••••••'}
                          </td>

                          <td className="p-3">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                                staff.role ===
                                'manager'
                                  ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                                  : 'bg-neutral-500/10 text-neutral-400 border border-neutral-500/20'
                              }`}
                            >
                              {
                                staff.role
                              }
                            </span>
                          </td>

                          <td className="p-3 text-right space-x-2">
                            <button
                              onClick={() => {
                                const portalPath =
                                  staff.role === 'waiter'
                                    ? `/waiter/${restaurantId}`
                                    : staff.role === 'kitchen'
                                      ? `/kitchen/${restaurantId}`
                                      : `/manager/${restaurantId}`

                                window.open(portalPath, '_blank', 'noopener,noreferrer')
                              }}
                              className="bg-orange-500/10 hover:bg-orange-500 text-orange-400 hover:text-white border border-orange-500/20 px-3 py-1 rounded-lg font-bold transition"
                            >
                              {staff.role === 'waiter'
                                ? 'Open Waiter Portal ↗'
                                : staff.role === 'kitchen'
                                  ? 'Open Kitchen Portal ↗'
                                  : 'Open Manager Portal ↗'}
                            </button>

                            <button
                              onClick={() =>
                                handleDeleteStaff(
                                  staff.id,
                                  staff.name
                                )
                              }
                              className="bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white px-3 py-1 rounded-lg font-bold transition"
                            >
                              Revoke 🗑️
                            </button>
                          </td>
                        </tr>
                      )
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: TAX & PACKING CHARGES */}
        {activeTab ===
          'taxes' && (
          <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-3xl max-w-xl mx-auto space-y-6 shadow-xl">

            <div className="text-center space-y-2">
              <span className="text-[10px] font-extrabold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full uppercase tracking-widest">
                State Taxation & Fees
              </span>

              <h2 className="text-xl font-black text-white">
                Tax & Parcel Packing Settings
              </h2>

              <p className="text-xs text-neutral-400">
                Configure your local SGST, CGST, and parcel packing fees applied automatically across all membership tiers.
              </p>
            </div>

            <form
              onSubmit={
                handleSaveTaxSettings
              }
              className="space-y-4"
            >
              <div>
                <label className="text-xs font-bold text-neutral-300 block mb-1">
                  SGST Rate (%)
                </label>

                <input
                  type="number"
                  step="0.1"
                  value={sgstRate}
                  onChange={(e) =>
                    setSgstRate(
                      e.target.value
                    )
                  }
                  required
                  className="w-full bg-neutral-950 text-white font-mono text-xs border border-neutral-800 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-neutral-300 block mb-1">
                  CGST Rate (%)
                </label>

                <input
                  type="number"
                  step="0.1"
                  value={cgstRate}
                  onChange={(e) =>
                    setCgstRate(
                      e.target.value
                    )
                  }
                  required
                  className="w-full bg-neutral-950 text-white font-mono text-xs border border-neutral-800 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-neutral-300 block mb-1">
                  Parcel Packing Charge (₹)
                </label>

                <input
                  type="number"
                  step="1"
                  value={
                    packingCharge
                  }
                  onChange={(e) =>
                    setPackingCharge(
                      e.target.value
                    )
                  }
                  required
                  className="w-full bg-neutral-950 text-white font-mono text-xs border border-neutral-800 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500"
                />
              </div>

              <button
                type="submit"
                disabled={savingTaxes}
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3.5 rounded-xl text-xs transition shadow-lg shadow-orange-500/25 hover:opacity-95"
              >
                {savingTaxes
                  ? 'Saving Tax Configurations...'
                  : 'Save Tax Settings 💾'}
              </button>
            </form>
          </div>
        )}

        {/* TAB 5: BILLING */}
        {activeTab === 'billing' && (
          <div className="space-y-6">
            <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl shadow-xl">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <span className="text-[10px] font-extrabold text-orange-400 bg-orange-500/10 border border-orange-500/20 px-3 py-1 rounded-full uppercase tracking-widest">
                    Billing Center
                  </span>
                  <h2 className="text-xl font-black text-white mt-3">
                    Orders & Bills
                  </h2>
                  <p className="text-xs text-neutral-400 mt-1">
                    Generate a printable bill using the order's original date and time.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    value={billSearch}
                    onChange={(e) => setBillSearch(e.target.value)}
                    placeholder="Search order / table / waiter"
                    className="bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-orange-500"
                  />

                  <input
                    type="date"
                    value={billDateFilter}
                    onChange={(e) => setBillDateFilter(e.target.value)}
                    className="bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-orange-500"
                  />

                  {(billSearch || billDateFilter) && (
                    <button
                      type="button"
                      onClick={() => {
                        setBillSearch('')
                        setBillDateFilter('')
                      }}
                      className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-4 py-2.5 rounded-xl text-xs font-bold transition"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
                <div>
                  <h3 className="text-md font-black text-white">
                    Bill Header Settings
                  </h3>
                  <p className="text-[10px] text-neutral-500 mt-1">
                    This information appears on every generated bill.
                  </p>
                </div>

                {!editingBillSettings && (
                  <button
                    type="button"
                    onClick={() => setEditingBillSettings(true)}
                    className="bg-neutral-800 hover:bg-neutral-700 text-orange-400 border border-neutral-700 px-4 py-2.5 rounded-xl text-xs font-black transition"
                  >
                    ✏️ Edit Bill Details
                  </button>
                )}
              </div>

              {editingBillSettings ? (
                <form onSubmit={handleSaveBillSettings} className="space-y-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                      Restaurant Name on Bill
                    </label>
                    <input
                      type="text"
                      value={billingRestaurantName}
                      onChange={(e) =>
                        setBillingRestaurantName(e.target.value)
                      }
                      placeholder="Enter restaurant name"
                      required
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-2">
                      Restaurant Logo
                    </label>

                    <div className="bg-neutral-950 border border-dashed border-neutral-700 rounded-2xl p-4">
                      {restaurantLogo ? (
                        <div className="space-y-3">
                          <div className="bg-white rounded-xl p-4 flex items-center justify-center min-h-32">
                            <img
                              src={restaurantLogo}
                              alt={`${restaurant?.name || 'Restaurant'} logo preview`}
                              className="max-h-28 max-w-full object-contain opacity-100"
                            />
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <label className="cursor-pointer bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">
                              🔄 Replace Logo
                              <input
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                onChange={handleRestaurantLogoFile}
                                className="hidden"
                              />
                            </label>

                            <button
                              type="button"
                              onClick={clearRestaurantLogo}
                              className="bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/20 px-4 py-2.5 rounded-xl text-xs font-bold transition"
                            >
                              🗑️ Remove Logo
                            </button>
                          </div>
                        </div>
                      ) : (
                        <label className="cursor-pointer block text-center py-8">
                          <div className="text-3xl mb-2">🖼️</div>
                          <p className="text-xs font-bold text-white">
                            Upload Restaurant Logo
                          </p>
                          <p className="text-[10px] text-neutral-500 mt-1">
                            PNG, JPG, WEBP or SVG image, maximum 2 MB
                          </p>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/svg+xml"
                            onChange={handleRestaurantLogoFile}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-2">
                      Manager Signature
                    </label>

                    <div className="bg-neutral-950 border border-dashed border-neutral-700 rounded-2xl p-4">
                      {managerSignature ? (
                        <div className="space-y-3">
                          <div className="bg-white rounded-xl p-4 flex items-center justify-center min-h-32">
                            <img
                              src={managerSignature}
                              alt="Manager signature preview"
                              className="max-h-24 max-w-full object-contain"
                            />
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <label className="cursor-pointer bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition">
                              🔄 Replace Signature
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleSignatureFile}
                                className="hidden"
                              />
                            </label>

                            <button
                              type="button"
                              onClick={clearManagerSignature}
                              className="bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white border border-red-500/20 px-4 py-2.5 rounded-xl text-xs font-bold transition"
                            >
                              🗑️ Remove Signature
                            </button>
                          </div>
                        </div>
                      ) : (
                        <label className="cursor-pointer block text-center py-8">
                          <div className="text-3xl mb-2">✍️</div>
                          <p className="text-xs font-bold text-white">
                            Upload Manager Signature
                          </p>
                          <p className="text-[10px] text-neutral-500 mt-1">
                            PNG/JPG image, maximum 2 MB
                          </p>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleSignatureFile}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={savingBillSettings}
                      className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3 rounded-xl text-xs transition disabled:opacity-50"
                    >
                      {savingBillSettings
                        ? 'Saving...'
                        : 'Save Bill Settings 💾'}
                    </button>

                    <button
                      type="button"
                      disabled={savingBillSettings}
                      onClick={() => {
                        setBillingRestaurantName(
                          restaurant?.billing_restaurant_name ||
                            restaurant?.name ||
                            ''
                        )
                        setManagerSignature(
                          restaurant?.manager_signature || ''
                        )
                        setRestaurantLogo(
                          restaurant?.logo_url || ''
                        )
                        setEditingBillSettings(false)
                      }}
                      className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-5 py-3 rounded-xl text-xs font-bold transition"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4">
                    <p className="text-[10px] uppercase font-bold text-neutral-500 mb-2">
                      Restaurant Logo
                    </p>
                    {restaurantLogo ? (
                      <div className="bg-white rounded-xl p-2 h-20 flex items-center justify-center">
                        <img
                          src={restaurantLogo}
                          alt={`${restaurant.name} logo`}
                          className="max-h-16 max-w-full object-contain opacity-100"
                        />
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-500">
                        No logo configured
                      </p>
                    )}
                  </div>

                  <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4">
                    <p className="text-[10px] uppercase font-bold text-neutral-500">
                      Restaurant Name
                    </p>
                    <p className="text-white font-black text-base mt-1">
                      {billingRestaurantName || restaurant.name}
                    </p>
                  </div>

                  <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4">
                    <p className="text-[10px] uppercase font-bold text-neutral-500 mb-2">
                      Manager Signature
                    </p>
                    {managerSignature ? (
                      <div className="bg-white rounded-xl p-2 inline-flex min-h-16 min-w-40 items-center justify-center">
                        <img
                          src={managerSignature}
                          alt="Manager signature"
                          className="max-h-14 max-w-48 object-contain"
                        />
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-500">
                        No signature configured
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-xl">
              <div className="p-6 border-b border-neutral-800 flex items-center justify-between">
                <div>
                  <h3 className="text-md font-black text-white">
                    Orders Available for Billing
                  </h3>
                  <p className="text-[10px] text-neutral-500 mt-1">
                    {filteredBillingOrders.length} order
                    {filteredBillingOrders.length === 1 ? '' : 's'} found
                  </p>
                </div>
              </div>

              {filteredBillingOrders.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="text-4xl mb-3">🧾</div>
                  <p className="text-sm font-bold text-white">
                    No matching orders
                  </p>
                  <p className="text-xs text-neutral-500 mt-1">
                    Try another date or search term.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-neutral-800">
                  {filteredBillingOrders.map((order) => (
                    <div
                      key={order.id}
                      className="p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4 hover:bg-neutral-800/20 transition"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2.5 py-1 rounded-lg text-[10px] font-black">
                            {getBillNumber(order)}
                          </span>

                          <span className="bg-neutral-800 text-neutral-300 px-2.5 py-1 rounded-lg text-[10px] font-bold">
                            Table {order.table_number || '1'}
                          </span>

                          <span className="text-[10px] text-neutral-500 uppercase font-bold">
                            {order.status || 'pending'}
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-4 mt-2 text-[11px] text-neutral-400">
                          <span>
                            📅 {formatBillDate(order.created_at)}
                          </span>
                          <span>
                            🕒 {formatBillTime(order.created_at)}
                          </span>
                          <span>
                            💳 {order.payment_mode || 'Online'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-[10px] uppercase font-bold text-neutral-500">
                            Total
                          </p>
                          <p className="text-lg font-black text-emerald-400">
                            ₹{Number(order.total_amount || 0).toFixed(2)}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handlePrintBill(order)}
                          className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-xl text-xs font-black transition shadow-lg shadow-orange-500/20"
                        >
                          🧾 Generate Bill
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: SWIGGY SYNC */}
        {activeTab ===
          'swiggy-sync' && (
          <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-3xl max-w-xl mx-auto space-y-6 shadow-xl">

            <div className="space-y-2 text-center">
              <span className="text-[10px] font-extrabold text-orange-400 bg-orange-500/10 border border-orange-500/20 px-3 py-1 rounded-full uppercase tracking-widest">
                Swiggy Integration
              </span>

              <h2 className="text-xl font-black text-white">
                Sync Swiggy Menu Directly
              </h2>
            </div>

            <form
              onSubmit={
                handleSwiggySync
              }
              className="space-y-4"
            >
              <div>
                <label className="text-xs font-bold text-neutral-300 block mb-1">
                  Swiggy Menu JSON Data
                </label>

                <textarea
                  rows="6"
                  placeholder={`[
  {
    "name": "Chicken Biryani",
    "price": 320,
    "category": "Main Course",
    "is_veg": false,
    "description": "Aromatic basmati rice with tender chicken.",
    "food_type": "non-veg",
    "reorder_mode": "auto"
  }
]`}
                  value={
                    swiggyDataInput
                  }
                  onChange={(e) =>
                    setSwiggyDataInput(
                      e.target.value
                    )
                  }
                  className="w-full bg-neutral-950 text-white font-mono text-xs border border-neutral-800 rounded-xl p-4 focus:outline-none focus:border-orange-500"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={
                  syncingSwiggy
                }
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3.5 rounded-xl text-xs transition shadow-lg shadow-orange-500/25 hover:opacity-95"
              >
                {syncingSwiggy
                  ? 'Syncing Menu Items...'
                  : 'Sync Swiggy Menu Now 🔄'}
              </button>
            </form>
          </div>
        )}

        {/* TAB: OFFERS OF THE DAY */}
        {activeTab === 'offers' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl shadow-xl h-fit">
              <div className="flex items-center justify-between mb-5">
                <div><span className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Restaurant Advertising</span><h2 className="text-xl font-black text-white mt-2">{editingOfferId ? 'Edit Offer' : 'Add Offer of the Day'} 🔥</h2></div><span className="text-2xl">🎁</span>
              </div>
              <form onSubmit={handleSaveOffer} className="space-y-4">
                <div><label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Offer Title</label><input value={offerTitle} onChange={(e) => setOfferTitle(e.target.value)} placeholder="Weekend Biryani Special" className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-xs focus:outline-none focus:border-orange-500" /></div>
                <div><label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Description</label><textarea value={offerDescription} onChange={(e) => setOfferDescription(e.target.value)} rows={3} placeholder="Chicken biryani + soft drink at a special price" className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-xs focus:outline-none focus:border-orange-500 resize-none" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Original Price</label><input type="number" min="0" step="0.01" value={offerOriginalPrice} onChange={(e) => setOfferOriginalPrice(e.target.value)} placeholder="299" className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-xs focus:outline-none focus:border-orange-500" /></div>
                  <div><label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Offer Price *</label><input type="number" min="0" step="0.01" value={offerPrice} onChange={(e) => setOfferPrice(e.target.value)} placeholder="199" className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-xs focus:outline-none focus:border-orange-500" required /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Discount Badge</label><input value={offerDiscountText} onChange={(e) => setOfferDiscountText(e.target.value)} placeholder="33% OFF" className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-xs focus:outline-none focus:border-orange-500" /></div>
                  <div><label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Offer Date *</label><input type="date" value={offerDate} onChange={(e) => setOfferDate(e.target.value)} className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-xs focus:outline-none focus:border-orange-500" required /></div>
                </div>
                <div><label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Offer Image</label><div className="bg-neutral-950 border border-dashed border-neutral-700 rounded-2xl p-3">{offerImageUrl ? <div className="space-y-3"><img src={offerImageUrl} alt="Offer preview" className="w-full h-32 object-cover rounded-xl" /><div className="flex gap-2"><label className="cursor-pointer bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-2 rounded-xl text-[10px] font-bold">Replace Image<input type="file" accept="image/*" onChange={handleOfferImageFile} className="hidden" /></label><button type="button" onClick={() => setOfferImageUrl('')} className="bg-red-500/10 text-red-400 px-3 py-2 rounded-xl text-[10px] font-bold">Remove</button></div></div> : <label className="cursor-pointer block text-center py-5"><div className="text-3xl mb-2">🖼️</div><p className="text-xs font-bold text-white">Upload Offer Image</p><p className="text-[10px] text-neutral-500 mt-1">PNG, JPG, WEBP or SVG, maximum 2 MB</p><input type="file" accept="image/*" onChange={handleOfferImageFile} className="hidden" /></label>}</div></div>
                <div className="flex gap-2"><button type="submit" disabled={savingOffer} className="flex-1 bg-gradient-to-r from-orange-500 to-red-500 text-white font-black py-3 rounded-xl text-xs shadow-lg shadow-orange-500/20">{savingOffer ? 'Saving...' : editingOfferId ? 'Update Offer 💾' : 'Publish Offer 🚀'}</button>{editingOfferId && <button type="button" onClick={resetOfferForm} className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-4 py-3 rounded-xl text-xs font-bold">Cancel</button>}</div>
              </form>
            </div>
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-gradient-to-r from-red-600 via-orange-500 to-amber-400 p-6 rounded-3xl shadow-xl"><p className="text-[10px] uppercase tracking-widest font-black text-white/80">Customer Preview</p><h3 className="text-2xl font-black text-white mt-1">🔥 Offers of the Day</h3><p className="text-xs text-white/80 mt-1">Only active offers with today's date are advertised on the QR menu.</p></div>
              <div className="bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden"><div className="p-5 border-b border-neutral-800 flex items-center justify-between"><div><h3 className="font-black text-white">Your Offers</h3><p className="text-[10px] text-neutral-500 mt-1">Manage everything shown in the QR menu advertising area.</p></div><span className="text-xs font-black text-orange-400">{dailyOffers.length} total</span></div>
                {dailyOffers.length === 0 ? <div className="p-12 text-center"><div className="text-5xl">🎁</div><p className="text-white font-bold mt-3">No offers yet</p><p className="text-xs text-neutral-500 mt-1">Create an offer from the form to advertise it to QR customers.</p></div> : <div className="p-4 space-y-3">{dailyOffers.map((offer) => <div key={offer.id} className="bg-neutral-950 border border-neutral-800 rounded-2xl p-3 flex gap-3 items-center"><div className="w-20 h-20 rounded-xl overflow-hidden bg-neutral-900 shrink-0">{offer.image_url ? <img src={offer.image_url} alt={offer.title} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-3xl">🎁</div>}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2 flex-wrap"><h4 className="font-black text-white text-sm">{offer.title}</h4><span className={`text-[9px] font-black px-2 py-1 rounded-full ${offer.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-neutral-800 text-neutral-500'}`}>{offer.is_active ? 'ACTIVE' : 'HIDDEN'}</span></div><p className="text-[10px] text-neutral-500 mt-1">{offer.offer_date}{offer.discount_text ? ` • ${offer.discount_text}` : ''}</p><div className="flex items-center gap-2 mt-1">{offer.original_price != null && <span className="text-[10px] text-neutral-600 line-through">₹{Number(offer.original_price).toFixed(2)}</span>}<span className="text-sm font-black text-orange-400">₹{Number(offer.offer_price).toFixed(2)}</span></div></div><div className="flex flex-col gap-2"><button type="button" onClick={() => startEditingOffer(offer)} className="bg-blue-500/10 text-blue-400 px-3 py-2 rounded-lg text-[10px] font-bold">Edit</button><button type="button" onClick={() => toggleOffer(offer)} className="bg-neutral-800 text-neutral-300 px-3 py-2 rounded-lg text-[10px] font-bold">{offer.is_active ? 'Hide' : 'Show'}</button><button type="button" onClick={() => deleteOffer(offer)} className="bg-red-500/10 text-red-400 px-3 py-2 rounded-lg text-[10px] font-bold">Delete</button></div></div>)}</div>}
              </div>
            </div>
          </div>
        )}

        {/* TAB: ALARM SETTINGS */}
        {activeTab === 'alarm-settings' && hasRealtimeOrderAlarm && (
          <form
            onSubmit={handleSaveAlarmSettings}
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
          >
            <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl shadow-xl space-y-5">
              <div>
                <span className="text-[10px] font-extrabold text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-full uppercase tracking-widest">Kitchen</span>
                <h2 className="text-xl font-black text-white mt-3">Kitchen Alarm Sound</h2>
                <p className="text-xs text-neutral-400 mt-1">Used by the Kitchen/KDS page when a new order arrives.</p>
              </div>

              <label className="flex items-center justify-between gap-4 bg-neutral-950 border border-neutral-800 rounded-2xl p-4">
                <span>
                  <span className="block text-sm font-bold text-white">Enable Kitchen Alarm</span>
                  <span className="block text-[11px] text-neutral-500 mt-1">Allow sound notifications in the kitchen.</span>
                </span>
                <input type="checkbox" checked={kitchenAlarmEnabled} onChange={(e) => { alarmSettingsDirtyRef.current = true; setKitchenAlarmEnabled(e.target.checked) }} className="h-5 w-5 accent-orange-500" />
              </label>

              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-300">Select Kitchen Sound</label>
                <select value={kitchenAlarmSound} onChange={(e) => { alarmSettingsDirtyRef.current = true; setKitchenAlarmSound(e.target.value) }} className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-orange-500">
                  {kitchenAlarmOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold text-neutral-300"><span>Kitchen Volume</span><span>{Math.round(kitchenAlarmVolume * 100)}%</span></div>
                <input type="range" min="0" max="1" step="0.05" value={kitchenAlarmVolume} onChange={(e) => { alarmSettingsDirtyRef.current = true; setKitchenAlarmVolume(Number(e.target.value)) }} className="w-full accent-orange-500" />
              </div>

              <button type="button" onClick={() => handlePreviewAlarm(getAlarmSource(kitchenAlarmOptions, kitchenAlarmSound), kitchenAlarmVolume)} className="w-full bg-neutral-950 border border-neutral-700 hover:border-orange-500 text-white font-bold py-3 rounded-xl text-xs">▶ Preview Kitchen Sound</button>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl shadow-xl space-y-5">
              <div>
                <span className="text-[10px] font-extrabold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full uppercase tracking-widest">Waiter</span>
                <h2 className="text-xl font-black text-white mt-3">Waiter Alarm Sound</h2>
                <p className="text-xs text-neutral-400 mt-1">Used by the Waiter page when an order becomes ready.</p>
              </div>

              <label className="flex items-center justify-between gap-4 bg-neutral-950 border border-neutral-800 rounded-2xl p-4">
                <span>
                  <span className="block text-sm font-bold text-white">Enable Waiter Alarm</span>
                  <span className="block text-[11px] text-neutral-500 mt-1">Allow sound notifications for ready orders.</span>
                </span>
                <input type="checkbox" checked={waiterAlarmEnabled} onChange={(e) => { alarmSettingsDirtyRef.current = true; setWaiterAlarmEnabled(e.target.checked) }} className="h-5 w-5 accent-orange-500" />
              </label>

              <div className="space-y-2">
                <label className="text-xs font-bold text-neutral-300">Select Waiter Sound</label>
                <select value={waiterAlarmSound} onChange={(e) => { alarmSettingsDirtyRef.current = true; setWaiterAlarmSound(e.target.value) }} className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-orange-500">
                  {waiterAlarmOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold text-neutral-300"><span>Waiter Volume</span><span>{Math.round(waiterAlarmVolume * 100)}%</span></div>
                <input type="range" min="0" max="1" step="0.05" value={waiterAlarmVolume} onChange={(e) => { alarmSettingsDirtyRef.current = true; setWaiterAlarmVolume(Number(e.target.value)) }} className="w-full accent-orange-500" />
              </div>

              <button type="button" onClick={() => handlePreviewAlarm(getAlarmSource(waiterAlarmOptions, waiterAlarmSound), waiterAlarmVolume)} className="w-full bg-neutral-950 border border-neutral-700 hover:border-orange-500 text-white font-bold py-3 rounded-xl text-xs">▶ Preview Waiter Sound</button>
            </div>

            <div className="lg:col-span-2 flex justify-end">
              <button type="submit" disabled={savingAlarmSettings} className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-black px-8 py-3 rounded-xl text-xs uppercase tracking-wider">{savingAlarmSettings ? 'Saving...' : 'Save Alarm Settings 🔔'}</button>
            </div>
          </form>
        )}

        {/* TAB 6: PAYMENT GATEWAYS */}
        {activeTab ===
          'gateway' && (
          <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-3xl max-w-xl mx-auto space-y-6 shadow-xl">

            <div className="space-y-2 text-center">
              <span className="text-[10px] font-extrabold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full uppercase tracking-widest">
                Gateway Configurations
              </span>

              <h2 className="text-xl font-black text-white">
                Manage Your Payment Gateways
              </h2>

              <p className="text-xs text-neutral-400">
                Configure your individual Razorpay credentials securely.
              </p>
            </div>

            {!isGatewayEditable ? (
              <div className="space-y-4 bg-neutral-950 p-6 rounded-2xl border border-neutral-800 text-center">

                <div
                  className={`flex items-center justify-center space-x-2 font-bold text-xs py-2 rounded-xl border ${
                    razorpayKeyId.trim() && razorpaySecret.trim()
                      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                      : 'text-red-400 bg-red-500/10 border-red-500/20'
                  }`}
                >
                  <span>
                    {razorpayKeyId.trim() && razorpaySecret.trim()
                      ? '🟢 Razorpay Connected'
                      : '🔴 Razorpay Not Connected'}
                  </span>
                </div>

                <div className="space-y-3 text-left">

                  <div>
                    <label className="text-[10px] uppercase font-bold text-neutral-500 block">
                      Razorpay Key ID
                    </label>

                    <p className="font-mono text-xs text-white bg-neutral-900 p-2.5 rounded-xl border border-neutral-800">
                      {razorpayKeyId
                        ? razorpayKeyId
                        : 'Not Configured'}
                    </p>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-neutral-500 block">
                      Razorpay Key Secret
                    </label>

                    <p className="font-mono text-xs text-white bg-neutral-900 p-2.5 rounded-xl border border-neutral-800">
                      {razorpaySecret
                        ? '••••••••••••••••••••••••'
                        : 'Not Configured'}
                    </p>
                  </div>

                  <div className="flex justify-between items-center text-xs bg-neutral-900 p-3 rounded-xl border border-neutral-800">
                    <span className="text-neutral-400 font-bold">
                      Pay at Counter (Cash):
                    </span>

                    <span
                      className={`font-bold uppercase ${
                        enableCounterPayment
                          ? 'text-emerald-400'
                          : 'text-red-400'
                      }`}
                    >
                      {enableCounterPayment
                        ? 'Enabled ✅'
                        : 'Disabled ❌'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleRequestGatewayEdit}
                  className="w-full bg-neutral-800 hover:bg-neutral-700 text-orange-400 font-black py-3 rounded-xl text-xs uppercase tracking-wider transition border border-neutral-700 mt-2"
                >
                  🔐 Edit Gateway Credentials
                </button>
              </div>
            ) : (
              <form
                onSubmit={
                  handleSavePaymentSettings
                }
                className="space-y-4"
              >

                <div>
                  <label className="text-xs font-bold text-neutral-300 block mb-1">
                    Razorpay Key ID
                  </label>

                  <input
                    type="text"
                    placeholder="rzp_live_xxxxxxxxxx"
                    value={
                      razorpayKeyId
                    }
                    onChange={(e) =>
                      setRazorpayKeyId(
                        e.target.value
                      )
                    }
                    className="w-full bg-neutral-950 text-white font-mono text-xs border border-neutral-800 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-neutral-300 block mb-1">
                    Razorpay Key Secret
                  </label>

                  <input
                    type="password"
                    placeholder="enter_secret_key"
                    value={
                      razorpaySecret
                    }
                    onChange={(e) =>
                      setRazorpaySecret(
                        e.target.value
                      )
                    }
                    className="w-full bg-neutral-950 text-white font-mono text-xs border border-neutral-800 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div className="flex items-center justify-between bg-neutral-950 p-4 rounded-2xl border border-neutral-800">
                  <div>
                    <p className="text-xs font-bold text-white">
                      Enable "Pay at Counter"
                    </p>

                    <p className="text-[10px] text-neutral-400">
                      Allow customers to choose cash or offline payments.
                    </p>
                  </div>

                  <input
                    type="checkbox"
                    checked={
                      enableCounterPayment
                    }
                    onChange={(e) =>
                      setEnableCounterPayment(
                        e.target.checked
                      )
                    }
                    className="w-5 h-5 accent-orange-500 rounded cursor-pointer"
                  />
                </div>

                <div className="flex space-x-2">

                  <button
                    type="submit"
                    disabled={
                      savingPayment
                    }
                    className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3.5 rounded-xl text-xs transition shadow-lg shadow-orange-500/25 hover:opacity-95"
                  >
                    {savingPayment
                      ? 'Saving...'
                      : 'Save & Lock Gateway 💾'}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setIsGatewayEditable(
                        false
                      )
                    }
                    className="bg-neutral-800 hover:bg-neutral-700 text-neutral-400 px-4 py-3.5 rounded-xl text-xs font-bold transition"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {showGatewayPasswordModal && (
          <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-2xl">
              <div className="text-center space-y-2 mb-6">
                <div className="text-4xl">🔐</div>
                <h3 className="text-lg font-black text-white">Verify Your Password</h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Enter the same password you use to sign in to your restaurant dashboard before editing Razorpay credentials.
                </p>
              </div>

              <form onSubmit={handleVerifyGatewayEditPassword} className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-2">
                    Login Password
                  </label>
                  <input
                    type="password"
                    autoFocus
                    autoComplete="current-password"
                    value={gatewayPassword}
                    onChange={(e) => setGatewayPassword(e.target.value)}
                    placeholder="Enter your login password"
                    disabled={verifyingGatewayPassword}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 disabled:opacity-50"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={verifyingGatewayPassword}
                    className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-black py-3 rounded-xl text-xs uppercase tracking-wider transition disabled:opacity-50"
                  >
                    {verifyingGatewayPassword ? 'Verifying...' : 'Verify & Continue 🔓'}
                  </button>

                  <button
                    type="button"
                    disabled={verifyingGatewayPassword}
                    onClick={() => {
                      setGatewayPassword('')
                      setShowGatewayPasswordModal(false)
                    }}
                    className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-4 py-3 rounded-xl text-xs font-bold transition disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB 7: ANALYTICS & REPORTS */}
        {activeTab === 'settlements' && (
          hasAdvancedAnalytics ? (
          <div className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
              <div>
                <span className="text-[10px] font-extrabold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full uppercase tracking-widest">
                  Restaurant Analytics
                </span>
                <h2 className="text-2xl font-black text-white mt-3">
                  Sales & Order Reports
                </h2>
                <p className="text-xs text-neutral-400 mt-2">
                  Review order volume, revenue, average order value, and the time of day when orders sell most.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleGenerateAnalyticsReport}
                  className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-3 rounded-xl text-xs font-black transition"
                >
                  Generate CSV Report 📥
                </button>
                <button
                  onClick={() => window.print()}
                  className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-3 rounded-xl text-xs font-black transition"
                >
                  Print Report 🖨️
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
              {REPORT_TIMEFRAMES.map(({ label, value: frame }) => {
                const range = getReportRange(frame)
                const periodOrders = orders.filter((order) => {
                  if (!order?.created_at || order.status === 'cancelled') return false
                  const createdAt = new Date(order.created_at)
                  return createdAt >= range.start && createdAt <= range.end
                })
                const periodRevenue = periodOrders.reduce(
                  (sum, order) => sum + Number(order.total_amount || 0),
                  0
                )

                return (
                  <button
                    key={frame}
                    onClick={() => handleReportTimeframeChange(frame)}
                    className={`text-left p-4 rounded-2xl border transition ${
                      reportTimeframe === frame
                        ? 'bg-orange-500/15 border-orange-500/60'
                        : 'bg-neutral-900 border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <p className="text-[10px] uppercase tracking-wider text-neutral-400 font-black">
                      {label}
                    </p>
                    <p className="text-2xl font-black text-white mt-2">
                      {periodOrders.length}
                    </p>
                    <p className="text-xs text-emerald-400 font-bold mt-1">
                      {formatCurrency(periodRevenue)} sales
                    </p>
                  </button>
                )
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-black">
                  Selected Period Orders
                </p>
                <p className="text-3xl font-black text-white mt-2">
                  {reportOrderCount}
                </p>
              </div>
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-black">
                  Selected Period Sales
                </p>
                <p className="text-3xl font-black text-emerald-400 mt-2">
                  {formatCurrency(reportRevenue)}
                </p>
              </div>
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-black">
                  Average Order Value
                </p>
                <p className="text-3xl font-black text-orange-400 mt-2">
                  {formatCurrency(reportAverageOrderValue)}
                </p>
              </div>
            </div>

            <SalesRevenueGraph
              data={salesGraphData}
              formatCurrency={formatCurrency}
              periodLabel={getReportPeriodLabel(reportTimeframe)}
            />

            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="text-lg font-black text-white">
                    What time do customers order most?
                  </h3>
                  <p className="text-xs text-neutral-500 mt-1">
                    Hourly order generation for the selected {reportTimeframe} period.
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-[10px] uppercase text-neutral-500 font-black">Peak Hour</p>
                  <p className="text-lg font-black text-amber-400">
                    {peakHour.orders > 0 ? formatHour(peakHour.hour) : 'No orders'}
                  </p>
                  <p className="text-[10px] text-neutral-500">
                    {peakHour.orders} order{peakHour.orders === 1 ? '' : 's'}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {hourlyReport.map((item) => {
                  const maxOrders = Math.max(...hourlyReport.map((hour) => hour.orders), 1)
                  const width = `${Math.max((item.orders / maxOrders) * 100, item.orders ? 5 : 0)}%`

                  return (
                    <div key={item.hour} className="grid grid-cols-[72px_1fr_80px] items-center gap-3 text-xs">
                      <span className="text-neutral-400 font-mono">{formatHour(item.hour)}</span>
                      <div className="h-5 bg-neutral-950 rounded-lg overflow-hidden border border-neutral-800">
                        <div
                          className="h-full bg-orange-500 rounded-lg transition-all"
                          style={{ width }}
                        />
                      </div>
                      <span className="text-right text-neutral-300 font-bold">
                        {item.orders} · {formatCurrency(item.revenue)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6">
              <h3 className="text-lg font-black text-white">Report Summary</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
                <div>
                  <p className="text-[10px] uppercase text-neutral-500 font-black">Period</p>
                  <p className="text-sm font-bold text-white mt-1">{getReportPeriodLabel(reportTimeframe)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-neutral-500 font-black">Orders Generated</p>
                  <p className="text-sm font-bold text-white mt-1">{reportOrderCount}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-neutral-500 font-black">Sales Generated</p>
                  <p className="text-sm font-bold text-emerald-400 mt-1">{formatCurrency(reportRevenue)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-neutral-500 font-black">Report Status</p>
                  <p className="text-sm font-bold text-emerald-400 mt-1">Ready to export</p>
                </div>
              </div>
            </div>
          </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6">
                <span className="text-[10px] font-extrabold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full uppercase tracking-widest">
                  Basic Analytics
                </span>
                <h2 className="text-2xl font-black text-white mt-3">Restaurant Overview</h2>
                <p className="text-xs text-neutral-400 mt-2">
                  Basic analytics are included with {currentPlanDisplay}.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
                  <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-5">
                    <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-black">Orders Today</p>
                    <p className="text-3xl font-black text-white mt-2">{todaysOrders.length}</p>
                  </div>
                  <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-5">
                    <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-black">Revenue Today</p>
                    <p className="text-3xl font-black text-emerald-400 mt-2">₹{totalRevenue}</p>
                  </div>
                  <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-5">
                    <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-black">Live Kitchen Queue</p>
                    <p className="text-3xl font-black text-orange-400 mt-2">{activeOrders.length}</p>
                  </div>
                </div>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/20 rounded-3xl p-6">
                <h3 className="text-lg font-black text-white">Advanced Analytics & Reports</h3>
                <p className="text-xs text-neutral-300 mt-2">
                  CSV reports, period reports, average order value, peak-hour analysis and advanced reporting are available with Restaurant Pro or Restaurant + Resort Pro.
                </p>
                <button
                  type="button"
                  onClick={() => handleUpgradePlan(planFeatures.resort ? 'restaurant_resort_pro' : 'restaurant_pro')}
                  className="mt-4 bg-orange-500 hover:bg-orange-600 text-white px-5 py-3 rounded-xl text-xs font-black transition"
                >
                  Upgrade for Advanced Analytics 🚀
                </button>
              </div>
            </div>
          )
        )}

          </div>
        )}
      </main>

      {/* Printable Bill */}
      {selectedBillOrder && (
        <div className="print-bill fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4">
          <div className="print-bill-sheet bg-white text-black w-full max-w-md rounded-xl shadow-2xl overflow-hidden">
            <div className="p-6">
              <div className="text-center border-b border-neutral-300 pb-4">
                {restaurantLogo && (
                  <img
                    src={restaurantLogo}
                    alt={`${restaurant.name} logo`}
                    className="h-16 max-w-48 object-contain mx-auto mb-2 opacity-100"
                  />
                )}
                <h2 className="text-2xl font-black uppercase tracking-wide">
                  {billingRestaurantName || restaurant.name}
                </h2>
                <p className="text-[11px] text-neutral-500 mt-1">
                  DIGITAL DINING
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] mt-4 pb-4 border-b border-neutral-300">
                <div>
                  <strong>Bill No:</strong> {getBillNumber(selectedBillOrder)}
                </div>
                <div className="text-right">
                  <strong>Order No:</strong>{' '}
                  {String(selectedBillOrder.id).slice(-8).toUpperCase()}
                </div>
                <div>
                  <strong>Date:</strong>{' '}
                  {formatBillDate(selectedBillOrder.created_at)}
                </div>
                <div className="text-right">
                  <strong>Time:</strong>{' '}
                  {formatBillTime(selectedBillOrder.created_at)}
                </div>
                <div>
                  <strong>Table:</strong>{' '}
                  {selectedBillOrder.table_number || '1'}
                </div>
                <div className="text-right">
                  <strong>Payment:</strong>{' '}
                  {selectedBillOrder.payment_mode || 'Online'}
                </div>
                {selectedBillOrder.waiter_name && (
                  <div className="col-span-2">
                    <strong>Waiter:</strong>{' '}
                    {selectedBillOrder.waiter_name}
                  </div>
                )}
              </div>

              <table className="w-full text-[11px] mt-4">
                <thead>
                  <tr className="border-b border-neutral-300">
                    <th className="text-left py-2">Item</th>
                    <th className="text-center py-2">Qty</th>
                    <th className="text-right py-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(selectedBillOrder.items) &&
                    selectedBillOrder.items.map((item, index) => {
                      const quantity = getOrderItemQuantity(item)
                      const amount =
                        Number(item?.price || 0) * quantity

                      return (
                        <tr key={index} className="border-b border-neutral-200">
                          <td className="py-2 pr-2">
                            {item?.name || 'Item'}
                          </td>
                          <td className="py-2 text-center">
                            {quantity}
                          </td>
                          <td className="py-2 text-right">
                            ₹{amount.toFixed(2)}
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>

              <div className="mt-4 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span>Items Subtotal</span>
                  <span>
                    ₹{getOrderSubtotal(selectedBillOrder).toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between font-black text-base border-t border-neutral-300 pt-2 mt-2">
                  <span>Grand Total</span>
                  <span>
                    ₹{Number(selectedBillOrder.total_amount || 0).toFixed(2)}
                  </span>
                </div>

                <p className="text-[9px] text-neutral-500 mt-1">
                  Grand total uses the final amount stored on the order, including applicable taxes and packing charges.
                </p>
              </div>

              <div className="mt-8 text-center">
                {managerSignature ? (
                  <img
                    src={managerSignature}
                    alt="Manager signature"
                    className="max-h-16 max-w-40 object-contain mx-auto mb-1"
                  />
                ) : (
                  <div className="h-12"></div>
                )}

                <div className="border-t border-neutral-400 w-40 mx-auto pt-1 text-[10px] font-bold">
                  Manager Signature
                </div>
              </div>

              <div className="text-center mt-6 text-[10px] text-neutral-500">
                Thank you! Visit again.
              </div>
            </div>

            <div className="no-print bg-neutral-100 p-3 flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 rounded-lg text-xs"
              >
                🖨️ Print Bill
              </button>

              <button
                type="button"
                onClick={() => setSelectedBillOrder(null)}
                className="bg-neutral-800 hover:bg-neutral-700 text-white font-bold px-5 py-2.5 rounded-lg text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Embedded Real-Time Restaurant Chat Widget */}
      <RestaurantChatWidget
        restaurantId={restaurantId}
      />
    </div>
  )
}