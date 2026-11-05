'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const AI_TOPICS = [
  'Account / Login', 'QR Menu / Ordering', 'Payments / GST',
  'Delivery / Drivers', 'Wallet / Fees', 'Billing / Invoices', 'Technical Issue',
]

function chatTime(value) {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(new Date(value))
  } catch { return '' }
}

function statusLabel(status) {
  if (status === 'pending') return 'Waiting for Admin'
  if (status === 'connected') return 'Admin connected'
  if (status === 'closed') return 'Closed · Saved'
  return 'Support'
}

export default function OwnerSupportChat({ restaurantId }) {
  const [mode, setMode] = useState('live')
  const [sessions, setSessions] = useState([])
  const [current, setCurrent] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [aiText, setAiText] = useState('')
  const [aiTopic, setAiTopic] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiMessages, setAiMessages] = useState([
    { role: 'assistant', text: 'Hello! Choose a support topic or describe the problem. You can hand this conversation to Super Admin.' },
  ])
  const selectedRef = useRef('')
  const inFlightRef = useRef(false)
  const latestRequestRef = useRef(0)
  const bottomRef = useRef(null)
  const aiBottomRef = useRef(null)

  const request = useCallback(async (method, payload = null, sessionId = '') => {
    const result = await supabase.auth.getSession()
    const token = result?.data?.session?.access_token
    if (!token) throw new Error('Please sign in again to access owner support.')
    const path = '/api/owner/live-support'
    const params = new URLSearchParams({ restaurantId: String(restaurantId || '') })
    if (sessionId) params.set('sessionId', sessionId)
    const response = await fetch(method === 'GET' ? `${path}?${params}` : path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(method === 'POST' ? { body: JSON.stringify({ restaurantId, ...payload }) } : {}),
      cache: 'no-store',
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || !data.success) throw new Error(data.message || 'Support is unavailable.')
    return data
  }, [restaurantId])

  const refresh = useCallback(async ({ quiet = false, sessionId } = {}) => {
    if (!restaurantId || (quiet && inFlightRef.current)) return
    // Explicit history selection takes priority over an earlier polling
    // request. A stale response cannot switch the conversation back.
    const serial = ++latestRequestRef.current
    inFlightRef.current = true
    if (!quiet) setLoading(true)
    try {
      const data = await request('GET', null, sessionId ?? selectedRef.current)
      if (serial !== latestRequestRef.current) return
      setSessions(Array.isArray(data.sessions) ? data.sessions : [])
      const selected = data.selectedSession || null
      selectedRef.current = selected?.id || ''
      setCurrent(selected)
      setMessages(Array.isArray(data.messages) ? data.messages : [])
      setError('')
    } catch (err) {
      if (serial === latestRequestRef.current) setError(err?.message || 'Unable to load messages.')
    } finally {
      if (serial === latestRequestRef.current) {
        inFlightRef.current = false
        if (!quiet) setLoading(false)
      }
    }
  }, [restaurantId, request])

  useEffect(() => {
    selectedRef.current = ''
    setSessions([])
    setCurrent(null)
    setMessages([])
    refresh()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh({ quiet: true })
    }, 6000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh({ quiet: true })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [messages.length, current?.id])
  useEffect(() => { aiBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [aiMessages.length])

  const openSession = async (id) => {
    selectedRef.current = id
    await refresh({ sessionId: id })
  }

  const beginConversation = async (aiContext = null) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const data = await request('POST', {
        action: 'start',
        ...(aiContext ? {
          issueCategory: aiTopic || 'AI support',
          aiSummary: aiMessages.filter(m => m.role === 'user').map(m => m.text).slice(-8).join('\n'),
          aiTranscript: aiMessages.slice(-30).map(m => ({ role: m.role, text: m.text.slice(0, 2000) })),
        } : {}),
      })
      selectedRef.current = data?.session?.id || ''
      setMode('live')
      await refresh({ sessionId: selectedRef.current })
    } catch (err) { setError(err?.message || 'Unable to open support.') }
    finally { setBusy(false) }
  }

  const sendMessage = async (event) => {
    event.preventDefault()
    const message = text.trim()
    if (!message || busy || !current?.id || current.status !== 'connected') return
    setBusy(true)
    setError('')
    try {
      await request('POST', { action: 'send', sessionId: current.id, message })
      setText('')
      await refresh({ sessionId: current.id })
    } catch (err) { setError(err?.message || 'Message could not be saved.') }
    finally { setBusy(false) }
  }

  const sendAI = async (message) => {
    const content = String(message || '').trim()
    if (!content || aiBusy) return
    const next = [...aiMessages, { role: 'user', text: content }]
    setAiMessages(next)
    setAiText('')
    setAiBusy(true)
    try {
      const result = await fetch('/api/ai-support-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.slice(-20).map(m => ({ role: m.role, content: m.text })),
          issueCategory: aiTopic || content.slice(0, 80),
          stage: 'conversation',
        }),
      })
      const data = await result.json().catch(() => ({}))
      if (!result.ok || !data.reply) throw new Error(data.message || 'AI unavailable.')
      setAiMessages(prev => [...prev, { role: 'assistant', text: String(data.reply) }])
    } catch (err) {
      setAiMessages(prev => [...prev, { role: 'assistant', text: 'AI support is unavailable. Use Connect to Admin for live support.' }])
    } finally { setAiBusy(false) }
  }

  const active = sessions.find(s => ['pending', 'connected'].includes(s.status))
  const canStart = !active && !error && !loading

  return (
    <section className="w-full min-w-0 space-y-4" aria-label="Owner live support">
      <header className="rounded-3xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-600">Digital Dine-In · Owner Support</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight">Live support & chat history</h2>
            <p className="mt-2 text-xs text-slate-500">Messages are stored in Supabase and visible to you and Super Admin even after reopening the dashboard.</p>
          </div>
          <button onClick={() => refresh()} type="button" disabled={loading} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100">↻ Refresh</button>
        </div>
        <div className="mt-5 flex w-fit gap-1 rounded-2xl bg-slate-100 p-1">
          <button type="button" onClick={() => setMode('live')} className={`rounded-xl px-5 py-2.5 text-xs font-bold ${mode === 'live' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>💬 Live Admin Chat</button>
          <button type="button" onClick={() => setMode('ai')} className={`rounded-xl px-5 py-2.5 text-xs font-bold ${mode === 'ai' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>✦ AI Assistant</button>
        </div>
      </header>

      {error && <div role="alert" className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}

      {mode === 'ai' ? (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="font-black">AI Support Assistant</h3>
            <p className="mt-1 text-xs text-slate-500">AI answers are temporary until you send an escalation to Admin.</p>
          </div>
          <div className="flex flex-wrap gap-2 px-5 py-3">
            {AI_TOPICS.map(topic => <button key={topic} type="button" onClick={() => { setAiTopic(topic); sendAI(topic) }} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{topic}</button>)}
          </div>
          <div className="h-[350px] space-y-3 overflow-y-auto bg-slate-50 p-5" aria-live="polite">
            {aiMessages.map((m, index) => <div key={index} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}><p className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${m.role === 'user' ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-white text-slate-800'}`}>{m.text}</p></div>)}
            <div ref={aiBottomRef} />
          </div>
          <form className="flex gap-2 border-t border-slate-100 p-4" onSubmit={e => { e.preventDefault(); sendAI(aiText) }}>
            <input value={aiText} onChange={e => setAiText(e.target.value)} placeholder="Describe your issue…" aria-label="AI support message" maxLength={2000} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900" />
            <button type="submit" disabled={aiBusy || !aiText.trim()} className="rounded-xl bg-slate-900 px-5 py-3 text-xs font-bold text-white disabled:opacity-50">{aiBusy ? 'Thinking…' : 'Send'}</button>
          </form>
          <div className="border-t border-slate-100 p-4"><button type="button" onClick={() => beginConversation(true)} disabled={busy} className="w-full rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">Connect to Super Admin</button></div>
        </div>
      ) : (
        <div className="grid min-h-[470px] gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <div><h3 className="text-sm font-black">Conversations</h3><p className="mt-1 text-xs text-slate-500">Active and saved history</p></div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-extrabold">{sessions.length}</span>
            </div>
            <div className="max-h-[475px] space-y-2 overflow-y-auto p-3">
              {loading && !sessions.length && <p className="p-4 text-xs text-slate-500">Loading support history…</p>}
              {!loading && !error && !sessions.length && <p className="p-4 text-xs text-slate-500">No support conversations yet.</p>}
              {!loading && Boolean(error) && !sessions.length && <p role="status" className="p-4 text-xs text-amber-800">History could not be verified. Try Refresh; your old messages have not been cleared.</p>}
              {sessions.map(s => <button key={s.id} type="button" onClick={() => openSession(s.id)} className={`w-full rounded-2xl border p-3 text-left transition ${current?.id === s.id ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:bg-white'}`}>
                <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-black">{s.issue_category || 'Support conversation'}</span><span className={`h-2 w-2 shrink-0 rounded-full ${s.status === 'connected' ? 'bg-emerald-500' : s.status === 'pending' ? 'bg-amber-400' : 'bg-slate-400'}`} /></div>
                <p className="mt-1 text-xs text-slate-500">{statusLabel(s.status)}</p>
                <p className="mt-2 text-[11px] text-slate-400">{chatTime(s.requested_at || s.created_at)}</p>
              </button>)}
            </div>
            {canStart && <div className="border-t border-slate-100 p-3"><button type="button" onClick={() => beginConversation()} disabled={busy} className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-xs font-black text-white disabled:opacity-50">+ New Support Request</button></div>}
            {!canStart && <p className="border-t border-slate-100 p-3 text-xs text-slate-500">One open support request per restaurant. Select the active conversation to continue.</p>}
          </aside>

          <div className="flex min-h-[460px] min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-sm">
            {!current ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"><span className="text-4xl">💬</span><h3 className="text-xl font-black">{error ? 'Support history is temporarily unavailable' : 'Start a conversation'}</h3><p className="max-w-sm text-sm text-slate-500">{error ? 'Please use Refresh to retry. Existing saved messages have not been deleted.' : 'Get help from Super Admin. All live chat messages are kept in your account history.'}</p><button type="button" onClick={() => beginConversation()} disabled={busy || !canStart} className="mt-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">Request live support</button></div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 sm:p-5"><div><h3 className="text-base font-black">Super Admin Support</h3><p className="mt-1 text-xs text-slate-500">{statusLabel(current.status)} · {chatTime(current.requested_at)}</p></div><span className={`rounded-full px-3 py-2 text-[11px] font-extrabold ${current.status === 'connected' ? 'bg-emerald-100 text-emerald-800' : current.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{current.status}</span></div>
                {current.ai_summary && <div className="mx-4 mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-800"><strong>AI escalation:</strong> {current.ai_summary}</div>}
                <div className="h-[370px] min-h-[230px] flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4 sm:p-5" aria-label="Saved support messages" aria-live="polite">
                  {!messages.length && <p className="mt-12 text-center text-sm text-slate-500">{current.status === 'pending' ? 'Your request was sent. Messages unlock when Admin accepts.' : current.status === 'closed' ? 'This conversation is saved and read-only.' : 'Admin connected. Send the first message.'}</p>}
                  {messages.map(m => <div key={m.id} className={`flex ${m.sender === 'restaurant' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[88%] rounded-2xl px-4 py-3 shadow-sm ${m.sender === 'restaurant' ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-white text-slate-900'}`}><p className="whitespace-pre-wrap break-words text-sm leading-6">{m.message}</p><div className={`mt-2 flex flex-wrap items-center justify-end gap-1 text-[10px] font-semibold ${m.sender === 'restaurant' ? 'text-white/75' : 'text-slate-500'}`}><span>{m.sender_name || (m.sender === 'restaurant' ? 'Restaurant owner' : 'Super Admin')}</span><span aria-hidden="true">·</span><time dateTime={m.created_at || undefined}>{chatTime(m.created_at)}</time></div></div></div>)}
                  <div ref={bottomRef} />
                </div>
                {current.status === 'connected' ? (
                  <form onSubmit={sendMessage} className="flex gap-2 border-t border-slate-100 p-4"><input value={text} onChange={e => setText(e.target.value)} maxLength={2000} placeholder="Write to Super Admin…" aria-label="New support message" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none" /><button type="submit" disabled={busy || !text.trim()} className="rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black text-white disabled:opacity-50">{busy ? 'Sending…' : 'Send'}</button></form>
                ) : <div className="border-t border-slate-100 bg-white p-4 text-center text-xs font-semibold text-slate-500">{current.status === 'closed' ? 'History is saved. Start a new request for further help.' : 'Awaiting acceptance from Super Admin. This page refreshes automatically.'}</div>}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
