'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { appNotice } from '@/lib/appDialog'

// Real-Time Restaurant Chat Widget Component
export default function OwnerSupportChat({ restaurantId }) {
const AI_CATEGORIES = [
'🔐 Login / Account',
'🍔 Menu / Food Items',
'🧾 Billing / GST',
'💳 Razorpay / Payment',
'📱 QR Menu / Ordering',
'👨‍🍳 Kitchen / Orders',
'👨‍💼 Waiter',
'📦 Delivery',
'💳 Wallet / Platform Fees',
'🐛 Technical Problem',
'⚙️ Other',
]
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
if (!restaurantId) return undefined
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
}, [restaurantId, supportMode])
useEffect(() => {
chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
}, [messages])
useEffect(() => {
aiEndRef.current?.scrollIntoView({ behavior: 'smooth' })
}, [aiMessages])
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
appNotice(
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
appNotice('Please wait until Admin accepts the support chat.')
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
appNotice(
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
<section className="mx-auto w-full max-w-4xl space-y-4 font-sans" aria-label="Owner Support Chat">
  <header className="rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-4 sm:px-5">
    <div className="flex items-center gap-3">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500/15 text-xl" aria-hidden="true">💬</span>
      <div>
        <p className="text-[10px] font-black uppercase tracking-wider text-orange-400">Owner Support</p>
        <h2 className="mt-1 text-lg font-black text-white">Support Chat</h2>
        <p className="mt-1 text-xs text-neutral-400">Get help from the AI Assistant or connect to Admin support.</p>
      </div>
    </div>
  </header>
  <div className="flex h-[min(72dvh,680px)] min-h-[420px] w-full flex-col overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900 shadow-sm">
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
</section>
)
}