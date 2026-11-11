'use client'

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { appConfirm, appNotice } from '@/lib/appDialog'
import { useMobileViewportLock } from '@/lib/useMobileViewportLock'

const SESSION_KEY = 'digital-dine-staff-session'
const DEFAULT_SOUND = '/sounds/kitchen-default.mp3'
const SOUND_PATTERN = /^kitchen-[a-z0-9-]+$/

/* ------------------------------------------------------------------ */
/* Status model                                                        */
/* ------------------------------------------------------------------ */

// The kitchen marks an order as delivered. The backend must accept this value
// for kitchen sessions only. Waiter sessions must not be able to set it.
const DELIVERED = 'delivered'

const STEPS = [
  { key: 'pending', label: 'New' },
  { key: 'preparing', label: 'Cooking' },
  { key: 'ready', label: 'Ready' },
  { key: 'completed', label: 'Delivered' },
]

const normalize = (status) => {
  const v = String(status || '').trim().toLowerCase()
  if (['', 'paid', 'confirmed', 'placed', 'order_placed', 'new'].includes(v)) return 'pending'
  if (['delivered', 'served', 'completed', 'delivered_by_waiter'].includes(v)) return 'completed'
  if (v === 'canceled') return 'cancelled'
  return v
}

const isFinished = (o) => ['completed', 'cancelled'].includes(normalize(o?.status))

const orderNo = (o) =>
  o?.order_number ?? o?.daily_order_number ?? String(o?.id || '').slice(-4).toUpperCase()

const minutesSince = (createdAt, now) => {
  if (!createdAt) return 0
  const t = new Date(createdAt).getTime()
  if (Number.isNaN(t)) return 0
  return Math.max(0, Math.floor((now - t) / 60000))
}

const clock = (createdAt) =>
  createdAt
    ? new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '--:--'

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0))

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const CSS = `
.kds{min-height:100dvh;background:#0a0a0c;color:#f4f4f5;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased;padding-bottom:env(safe-area-inset-bottom)}
.kds *{box-sizing:border-box}
.kds-top{position:sticky;top:0;z-index:30;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:max(12px,env(safe-area-inset-top)) 16px 12px;background:rgba(10,10,12,.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid #1f1f24}
.kds-brand{font-size:20px;font-weight:900;letter-spacing:-.01em}
.kds-sub{font-size:12px;color:#8b8b94;display:flex;align-items:center;gap:6px;margin-top:2px}
.dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.dot.on{background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.15)}
.dot.off{background:#ef4444}
.iconbtn{width:44px;height:44px;border-radius:14px;background:#17171b;border:1px solid #2a2a30;color:#f4f4f5;display:grid;place-items:center;flex-shrink:0}
.kds-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:12px 16px 0;max-width:1200px;margin:0 auto}
.kds-tab{min-height:50px;border-radius:14px;background:#17171b;border:1px solid #2a2a30;color:#8b8b94;font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center;gap:8px}
.kds-tab[aria-selected=true]{background:#f4f4f5;color:#0a0a0c;border-color:#f4f4f5}
.count{min-width:24px;height:22px;padding:0 7px;border-radius:999px;background:rgba(249,115,22,.18);color:#fb923c;font-size:12px;display:grid;place-items:center;font-weight:900}
.kds-tab[aria-selected=true] .count{background:#0a0a0c;color:#f4f4f5}
.kds-search{padding:12px 16px 0;max-width:1200px;margin:0 auto}
.kds-input{width:100%;min-height:48px;background:#111114;border:1px solid #2a2a30;border-radius:14px;padding:0 14px;color:#f4f4f5;font-size:16px;outline:none}
.kds-input:focus{border-color:#f97316}
.kds-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:12px 16px 0;max-width:1200px;margin:0 auto}
.stat{background:#111114;border:1px solid #2a2a30;border-radius:14px;padding:12px}
.stat small{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#8b8b94;font-weight:800}
.stat b{display:block;font-size:22px;font-weight:900;margin-top:4px}
.kds-list{padding:12px 16px 48px;display:grid;gap:12px;max-width:1200px;margin:0 auto}
.order{background:#111114;border:1px solid #2a2a30;border-radius:20px;padding:16px;display:flex;flex-direction:column;gap:14px}
.order.late{border-color:rgba(239,68,68,.7);box-shadow:0 10px 30px rgba(127,29,29,.25)}
.order.warn{border-color:rgba(249,115,22,.55)}
.order.ready{border-color:rgba(34,197,94,.45)}
.order.done{opacity:.7}
.ohead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.table{font-size:26px;font-weight:900;line-height:1}
.tag{font-size:12px;color:#8b8b94;font-weight:700;margin-top:6px}
.timer{font-size:13px;font-weight:900;border:1px solid;border-radius:12px;padding:6px 10px;white-space:nowrap}
.timer.g{color:#4ade80;border-color:rgba(34,197,94,.35);background:rgba(34,197,94,.08)}
.timer.y{color:#facc15;border-color:rgba(250,204,21,.35);background:rgba(250,204,21,.08)}
.timer.o{color:#fb923c;border-color:rgba(249,115,22,.4);background:rgba(249,115,22,.1)}
.timer.r{color:#f87171;border-color:rgba(239,68,68,.45);background:rgba(239,68,68,.12)}
.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.step{display:flex;flex-direction:column;gap:6px}
.bar{height:6px;border-radius:99px;background:#24242a}
.step.on .bar{background:#f97316}
.step.cur .bar{background:#f97316;box-shadow:0 0 0 3px rgba(249,115,22,.2)}
.step.ok .bar{background:#22c55e}
.step small{font-size:10px;font-weight:800;color:#5b5b64;text-transform:uppercase;letter-spacing:.04em}
.step.on small,.step.ok small{color:#c4c4cc}
.items{display:grid;gap:8px}
.item{display:flex;gap:10px;align-items:flex-start;background:#0c0c0f;border:1px solid #1f1f24;border-radius:14px;padding:10px 12px}
.qty{min-width:36px;height:36px;border-radius:10px;background:rgba(249,115,22,.14);color:#fb923c;font-weight:900;display:grid;place-items:center;font-size:14px;flex-shrink:0}
.iname{font-size:15px;font-weight:800;line-height:1.3;word-break:break-word}
.note{margin-top:6px;font-size:12px;color:#fde047;background:rgba(250,204,21,.08);border:1px solid rgba(250,204,21,.25);border-radius:10px;padding:6px 8px}
.act{width:100%;min-height:58px;border-radius:16px;border:0;font-weight:900;font-size:16px;color:#fff;letter-spacing:.01em;transition:transform .08s,opacity .2s}
.act:active{transform:scale(.98)}
.act:disabled{opacity:.5}
.act.orange{background:#f97316}
.act.green{background:#16a34a}
.act.blue{background:#2563eb}
.undo{width:100%;min-height:44px;border-radius:14px;background:transparent;border:1px solid #2a2a30;color:#a1a1aa;font-weight:700;font-size:13px}
.note-ok{text-align:center;font-size:13px;font-weight:800;color:#4ade80;padding:12px;border-radius:14px;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.22)}
.empty{text-align:center;padding:48px 16px;background:#111114;border:1px dashed #2a2a30;border-radius:20px}
.empty b{display:block;font-size:17px;font-weight:900}
.empty p{margin:6px 0 0;color:#8b8b94;font-size:14px}
.banner{position:fixed;top:max(10px,env(safe-area-inset-top));left:12px;right:12px;z-index:60;max-width:640px;margin:0 auto;background:#dc2626;border-radius:18px;padding:14px;display:flex;align-items:center;gap:12px;box-shadow:0 16px 40px rgba(0,0,0,.5);animation:drop .25s ease}
.banner button{background:rgba(255,255,255,.18);border:0;color:#fff;font-weight:800;border-radius:12px;min-height:40px;padding:0 12px;font-size:13px}
@keyframes drop{from{transform:translateY(-12px);opacity:0}to{transform:none;opacity:1}}
.overlay{position:fixed;inset:0;z-index:70;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.6)}
.sheet{width:100%;max-width:520px;background:#111114;border:1px solid #2a2a30;border-radius:26px 26px 0 0;padding:10px 20px max(20px,env(safe-area-inset-bottom));animation:up .25s ease}
@media(min-width:640px){.overlay{align-items:center;padding:16px}.sheet{border-radius:26px}}
@keyframes up{from{transform:translateY(30px);opacity:0}to{transform:none;opacity:1}}
.grab{width:40px;height:5px;border-radius:99px;background:#33333a;margin:0 auto 14px}
.field{display:grid;gap:6px;margin-bottom:12px}
.field span{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#8b8b94}
.info{background:#0c0c0f;border:1px solid #1f1f24;border-radius:14px;padding:12px 14px;font-size:14px;font-weight:700;font-family:ui-monospace,monospace}
.primary{width:100%;min-height:52px;border-radius:16px;border:0;background:#dc2626;color:#fff;font-weight:900;font-size:15px}
.ghost{width:100%;min-height:50px;border-radius:16px;border:1px solid #2a2a30;background:transparent;color:#f4f4f5;font-weight:800;font-size:15px}
.login{min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:20px;background:#0a0a0c}
.login-card{width:100%;max-width:400px;background:#111114;border:1px solid #2a2a30;border-radius:26px;padding:28px 22px}
.login-card input{width:100%;min-height:52px;background:#0a0a0c;border:1px solid #2a2a30;border-radius:14px;padding:0 14px;color:#f4f4f5;font-size:16px;outline:none;margin-bottom:12px;font-family:ui-monospace,monospace}
.login-card input:focus{border-color:#dc2626}
.login-card input.code{letter-spacing:.35em;font-size:20px;text-align:center;border-color:rgba(249,115,22,.35)}
.login-card .primary{margin-top:6px}
.center{min-height:100dvh;display:grid;place-items:center;padding:20px;background:#0a0a0c;color:#f4f4f5}
.spin{width:40px;height:40px;border-radius:50%;border:4px solid #24242a;border-top-color:#dc2626;animation:sp 0.8s linear infinite;margin:0 auto}
@keyframes sp{to{transform:rotate(360deg)}}
@media(min-width:900px){
  .kds-list{grid-template-columns:repeat(2,1fr)}
}
@media(min-width:1200px){
  .kds-list{grid-template-columns:repeat(3,1fr)}
}
`

/* ------------------------------------------------------------------ */
/* Small components                                                    */
/* ------------------------------------------------------------------ */

function Bell() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8zM10.3 21a1.9 1.9 0 0 0 3.4 0" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  )
}

function Stepper({ status }) {
  const current = STEPS.findIndex((s) => s.key === status)
  return (
    <div className="steps" aria-label="Order progress">
      {STEPS.map((s, i) => {
        const cls = i < current ? 'ok' : i === current ? 'on cur' : ''
        return (
          <div key={s.key} className={`step ${cls}`}>
            <div className="bar" />
            <small>{s.label}</small>
          </div>
        )
      })}
    </div>
  )
}

function OrderCard({ order, now, busy, onAdvance, onReopen, readOnly }) {
  const status = normalize(order.status)
  const age = minutesSince(order.created_at, now)
  const done = status === 'completed' || status === 'cancelled'
  const items = Array.isArray(order.items) ? order.items : []

  let tone = ''
  if (status === 'ready') tone = 'ready'
  else if (!done && age >= 30) tone = 'late'
  else if (!done && age >= 20) tone = 'warn'

  const timerTone = age >= 30 ? 'r' : age >= 20 ? 'o' : age >= 10 ? 'y' : 'g'

  const action =
    status === 'pending'
      ? { to: 'preparing', label: 'Start preparing', cls: 'orange' }
      : status === 'preparing'
        ? { to: 'ready', label: 'Mark ready', cls: 'green' }
        : status === 'ready'
          ? { to: DELIVERED, label: 'Mark delivered', cls: 'blue' }
          : null

  return (
    <article className={`order ${tone} ${done ? 'done' : ''}`}>
      <header className="ohead">
        <div>
          <div className="table">{order.table_number ? `Table ${order.table_number}` : 'Takeaway'}</div>
          <div className="tag">Order #{orderNo(order)} · {clock(order.created_at)}{order.payment_mode ? ` · ${order.payment_mode}` : ''}</div>
        </div>
        {!done && <span className={`timer ${timerTone}`}>{age} min</span>}
        {done && <span className="timer g">{status === 'cancelled' ? 'Cancelled' : 'Delivered'}</span>}
      </header>

      {!done && <Stepper status={status} />}

      {!done && age >= 30 && status !== 'ready' && (
        <div style={{ fontSize: 12, fontWeight: 800, color: '#f87171' }}>⚠ Waiting over 30 minutes</div>
      )}

      <div className="items">
        {items.length === 0 && <div className="tag">No items recorded</div>}
        {items.map((it, i) => {
          const q = it?.qty ?? it?.quantity ?? 1
          const name = it?.name || it?.item_name || 'Unnamed item'
          const note = it?.notes || it?.note || it?.special_instructions || ''
          return (
            <div key={`${order.id}-${i}`} className="item">
              <div className="qty">×{q}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="iname">{name}</div>
                {note && <div className="note">📝 {note}</div>}
              </div>
            </div>
          )
        })}
      </div>

      {!readOnly && action && (
        <div style={{ display: 'grid', gap: 8 }}>
          <button type="button" className={`act ${action.cls}`} disabled={busy}
            onClick={() => onAdvance(order, action.to)}>
            {busy ? 'Updating…' : action.label}
          </button>
          {status === 'ready' && (
            <button type="button" className="undo" disabled={busy} onClick={() => onReopen(order)}>
              Back to cooking
            </button>
          )}
        </div>
      )}

      {!readOnly && done && <div className="note-ok">✓ {status === 'cancelled' ? 'Cancelled' : 'Delivered to table'}</div>}
    </article>
  )
}

function ProfileSheet({ code, userId, onSignOut, onClose }) {
  return (
    <div className="overlay" onClick={onClose}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label="Kitchen profile" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h2 style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 900 }}>Kitchen profile</h2>
        <div className="field"><span>Restaurant code</span><div className="info" style={{ letterSpacing: '.3em', textAlign: 'center', fontSize: 18 }}>{code || '—----'}</div></div>
        <div className="field"><span>User ID</span><div className="info">{userId || '—'}</div></div>
        <div className="field"><span>Role</span><div className="info" style={{ color: '#4ade80' }}>Kitchen</div></div>
        <p style={{ fontSize: 12, color: '#8b8b94', margin: '4px 0 16px' }}>Your password is never displayed.</p>
        <button type="button" className="primary" onClick={onSignOut}>Sign out of this terminal</button>
        <div style={{ height: 10 }} />
        <button type="button" className="ghost" onClick={onClose}>Close</button>
      </section>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Main screen                                                         */
/* ------------------------------------------------------------------ */

export default function KitchenPortal({ params }) {
  useMobileViewportLock()
  const unwrapped = use(params)
  const restaurantId = String(
    unwrapped?.restaurantid || unwrapped?.restaurantId || unwrapped?.restaurant_id || unwrapped?.id || ''
  ).trim()

  const [sessionChecking, setSessionChecking] = useState(true)
  const [authed, setAuthed] = useState(false)
  const [loginCode, setLoginCode] = useState('')
  const [loginUser, setLoginUser] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)

  const [session, setSession] = useState({ code: '', userId: '' })
  const sessionRef = useRef('')
  const syncRef = useRef(false)

  const [rows, setRows] = useState([])
  const [connected, setConnected] = useState(false)
  const [lastSync, setLastSync] = useState(null)
  const [tab, setTab] = useState('queue')
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [now, setNow] = useState(Date.now())
  const [alert, setAlert] = useState(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [alarm, setAlarm] = useState({ enabled: true, url: DEFAULT_SOUND, volume: 1 })

  const knownRef = useRef(new Set())
  const alarmRef = useRef(alarm)
  const audioCtxRef = useRef(null)
  const alertTimerRef = useRef(null)

  useEffect(() => { alarmRef.current = alarm }, [alarm])

  /* ---------------- Session helpers ---------------- */

  const clearSaved = useCallback(() => {
    try { localStorage.removeItem(SESSION_KEY) } catch {}
  }, [])

  const endSession = useCallback(() => {
    clearSaved()
    sessionRef.current = ''
    setSession({ code: '', userId: '' })
    setAuthed(false)
    setRows([])
    setConnected(false)
    knownRef.current = new Set()
    setProfileOpen(false)
    setAlert(null)
  }, [clearSaved])

  const applySettings = useCallback((r = {}) => {
    const s = String(r.kitchen_alarm_sound || '')
    setAlarm({
      enabled: r.kitchen_alarm_enabled ?? true,
      url: SOUND_PATTERN.test(s) ? `/sounds/${s}.mp3` : DEFAULT_SOUND,
      volume: clamp01(r.kitchen_alarm_volume ?? 1),
    })
  }, [])

  /* ---------------- Alarm ---------------- */

  const unlockAudio = useCallback(() => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx()
      audioCtxRef.current.resume?.().catch(() => {})
    } catch {}
  }, [])

  const beep = useCallback(() => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) return
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx()
      const ctx = audioCtxRef.current
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})
      const t0 = ctx.currentTime
      const peak = Math.max(0.08, alarmRef.current.volume * 0.6)
      ;[900, 1200, 900, 1200].forEach((freq, i) => {
        const start = t0 + i * 0.35
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(peak, start + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3)
        osc.connect(gain).connect(ctx.destination)
        osc.start(start)
        osc.stop(start + 0.32)
      })
    } catch {}
  }, [])

  const playAlarm = useCallback(() => {
    const { enabled, url, volume } = alarmRef.current
    if (!enabled) return
    try {
      const audio = new Audio(url)
      audio.volume = volume
      audio.play().catch(() => beep())
    } catch {
      beep()
    }
  }, [beep])

  const showAlert = useCallback((order) => {
    setAlert({ number: orderNo(order), table: order.table_number || 'Takeaway' })
    playAlarm()
    clearTimeout(alertTimerRef.current)
    alertTimerRef.current = setTimeout(() => setAlert(null), 8000)
  }, [playAlarm])

  /* ---------------- Data sync ---------------- */

  const applyRows = useCallback((data, announce) => {
    const list = Array.isArray(data) ? data : []
    let fresh = null
    list.forEach((o) => {
      const id = String(o?.id || '')
      if (!id || knownRef.current.has(id)) return
      knownRef.current.add(id)
      if (announce && !isFinished(o) && !fresh) fresh = o
    })
    setRows(list)
    setConnected(true)
    setLastSync(new Date())
    if (fresh) showAlert(fresh)
  }, [showAlert])

  const refresh = useCallback(async ({ announce = true } = {}) => {
    if (syncRef.current || !sessionRef.current) return
    syncRef.current = true
    try {
      const { data, error } = await supabase.rpc('get_kitchen_portal_data_session', {
        p_session_token: sessionRef.current,
      })
      if (error) throw error
      if (!data?.success) { endSession(); return }
      if (data.restaurantId && String(data.restaurantId) !== String(restaurantId)) { endSession(); return }
      applySettings(data.restaurant || {})
      applyRows(data.orders, announce)
    } catch (err) {
      console.error('[KITCHEN] Sync error:', err)
      setConnected(false)
    } finally {
      syncRef.current = false
    }
  }, [restaurantId, endSession, applySettings, applyRows])

  /* ---------------- Restore saved session ---------------- */

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const raw = localStorage.getItem(SESSION_KEY)
        if (!raw) return
        const saved = JSON.parse(raw)
        // Another role's or restaurant's session stays untouched.
        if (saved?.role !== 'kitchen' || String(saved?.restaurantId) !== String(restaurantId)) return
        if (!saved?.sessionToken) { clearSaved(); return }

        const { data, error } = await supabase.rpc('validate_staff_app_session', {
          p_session_token: saved.sessionToken,
          p_required_role: 'kitchen',
        })
        if (error || !data?.success || String(data.restaurantId) !== String(restaurantId)) {
          clearSaved()
          return
        }
        if (!alive) return

        sessionRef.current = saved.sessionToken
        setSession({
          code: String(data.restaurantCode || saved.restaurantCode || ''),
          userId: String(data.userId || saved.userId || ''),
        })
        setAuthed(true)
        await refresh({ announce: false })
      } catch (err) {
        console.error('[KITCHEN] Restore error:', err)
        clearSaved()
      } finally {
        if (alive) setSessionChecking(false)
      }
    })()
    return () => { alive = false }
  }, [restaurantId, clearSaved, refresh])

  /* ---------------- Polling, clock, cleanup ---------------- */

  useEffect(() => {
    if (!authed) return undefined
    const tick = () => { if (!document.hidden) refresh({ announce: true }) }
    const iv = setInterval(tick, 5000)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('online', tick)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('online', tick)
    }
  }, [authed, refresh])

  useEffect(() => {
    if (!authed) return undefined
    const iv = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(iv)
  }, [authed])

  useEffect(() => () => {
    clearTimeout(alertTimerRef.current)
    try { audioCtxRef.current?.close() } catch {}
  }, [])

  /* ---------------- Login ---------------- */

  const handleLogin = async (e) => {
    e.preventDefault()
    if (loginBusy) return
    unlockAudio()

    const code = loginCode.trim()
    const uid = loginUser.trim().toLowerCase()
    const pw = loginPass.trim()
    if (code.length !== 5 || !uid || !pw) {
      appNotice('Enter the 5-digit restaurant code, user ID and password.')
      return
    }

    setLoginBusy(true)
    try {
      const { data, error } = await supabase.rpc('create_staff_app_session', {
        p_restaurant_id: String(restaurantId),
        p_restaurant_code: code,
        p_user_id: uid,
        p_password: pw,
        p_role: 'kitchen',
      })
      if (error) throw error
      if (!data?.success) throw new Error(data?.message || 'Invalid credentials.')
      if (data.restaurantId && String(data.restaurantId) !== String(restaurantId)) {
        throw new Error('These credentials belong to another restaurant.')
      }

      const token = String(data.sessionToken || data.session_token || data.token || '').trim()
      if (!token) throw new Error('Secure session was not created.')

      const finalCode = String(data.restaurantCode || code)
      const finalUser = String(data.userId || uid).toLowerCase()

      localStorage.setItem(SESSION_KEY, JSON.stringify({
        sessionToken: token,
        role: 'kitchen',
        restaurantId: String(restaurantId),
        restaurantCode: finalCode,
        userId: finalUser,
      }))

      sessionRef.current = token
      setSession({ code: finalCode, userId: finalUser })
      setLoginPass('')
      setAuthed(true)
      await refresh({ announce: false })
    } catch (err) {
      console.error('[KITCHEN] Login error:', err)
      sessionRef.current = ''
      setLoginPass('')
      appNotice(err.message || 'Unable to sign in.')
    } finally {
      setLoginBusy(false)
    }
  }

  /* ---------------- Status changes (kitchen only) ---------------- */

  const updateStatus = async (order, nextStatus) => {
    if (busyId) return
    if (nextStatus === DELIVERED) {
      const ok = await appConfirm('Mark this order as delivered to the table?')
      if (!ok) return
    }

    const id = String(order.id)
    const previous = order
    setBusyId(id)
    setRows((cur) => cur.map((o) => (String(o.id) === id ? { ...o, status: nextStatus } : o)))

    try {
      const { data, error } = await supabase.rpc('kitchen_update_order_status_session', {
        p_session_token: sessionRef.current,
        p_order_id: id,
        p_new_status: nextStatus,
      })
      if (error) throw error
      if (!data?.success) {
        if (/session/i.test(data?.message || '')) endSession()
        throw new Error(data?.message || 'Unable to update order.')
      }
      if (data.order) {
        setRows((cur) => cur.map((o) => (String(o.id) === id ? data.order : o)))
      }
    } catch (err) {
      setRows((cur) => cur.map((o) => (String(o.id) === id ? previous : o)))
      appNotice(`Could not update order: ${err.message || 'Unknown error'}`)
    } finally {
      setBusyId(null)
    }
  }

  const reopen = (order) => updateStatus(order, 'preparing')

  const signOut = () => {
    endSession()
  }

  /* ---------------- Derived lists ---------------- */

  const dayStart = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() })()

  const counts = useMemo(() => {
    const queue = rows.filter((o) => !isFinished(o) && normalize(o.status) !== 'ready')
    const ready = rows.filter((o) => normalize(o.status) === 'ready')
    const today = rows.filter((o) => o.created_at && new Date(o.created_at).getTime() >= dayStart)
    return {
      queue: queue.length,
      ready: ready.length,
      today: today.length,
      todayActive: today.filter((o) => !isFinished(o)).length,
      todayDelivered: today.filter((o) => normalize(o.status) === 'completed').length,
    }
  }, [rows, dayStart])

  const q = query.trim().toLowerCase()
  const matches = (o) => {
    if (!q) return true
    const hay = [
      o.table_number,
      o.id,
      orderNo(o),
      ...(Array.isArray(o.items) ? o.items : []).flatMap((it) => [it?.name, it?.item_name, it?.notes, it?.note]),
    ].filter(Boolean).join(' ').toLowerCase()
    return hay.includes(q)
  }

  const oldestFirst = (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)
  const newestFirst = (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)

  const queueList = rows
    .filter((o) => !isFinished(o) && normalize(o.status) !== 'ready')
    .filter(matches)
    .sort(oldestFirst)

  const readyList = rows
    .filter((o) => normalize(o.status) === 'ready')
    .filter(matches)
    .sort(oldestFirst)

  const todayList = rows
    .filter((o) => o.created_at && new Date(o.created_at).getTime() >= dayStart)
    .filter(matches)
    .sort(newestFirst)

  /* ---------------- Render: session check ---------------- */

  if (sessionChecking) {
    return (
      <div className="center">
        <style jsx global>{CSS}</style>
        <div style={{ textAlign: 'center' }}>
          <div className="spin" />
          <p style={{ marginTop: 18, fontWeight: 800 }}>Opening kitchen terminal…</p>
        </div>
      </div>
    )
  }

  /* ---------------- Render: login ---------------- */

  if (!authed) {
    return (
      <div className="login">
        <style jsx global>{CSS}</style>
        <form className="login-card" onSubmit={handleLogin}>
          <div style={{ textAlign: 'center', marginBottom: 22 }}>
            <div style={{ fontSize: 40 }}>🍳</div>
            <h1 style={{ margin: '8px 0 4px', fontSize: 22, fontWeight: 900 }}>Kitchen Terminal</h1>
            <p style={{ margin: 0, color: '#8b8b94', fontSize: 13 }}>Sign in to manage kitchen orders</p>
          </div>

          <input
            className="code"
            inputMode="numeric"
            maxLength={5}
            placeholder="Restaurant code"
            value={loginCode}
            onChange={(e) => setLoginCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
            required
          />
          <input
            placeholder="User ID"
            autoComplete="username"
            autoCapitalize="none"
            value={loginUser}
            onChange={(e) => setLoginUser(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={loginPass}
            onChange={(e) => setLoginPass(e.target.value)}
            required
          />
          <button type="submit" className="primary" disabled={loginBusy}>
            {loginBusy ? 'Opening kitchen…' : 'Open queue'}
          </button>
          <p style={{ textAlign: 'center', fontSize: 11, color: '#5b5b64', marginTop: 14 }}>
            Tapping sign in also enables the kitchen alarm.
          </p>
        </form>
      </div>
    )
  }

  /* ---------------- Render: kitchen ---------------- */

  const list = tab === 'queue' ? queueList : tab === 'ready' ? readyList : todayList
  const emptyCopy = {
    queue: ['Queue is clear', 'New orders will appear here and sound the alarm.'],
    ready: ['Nothing waiting', 'Orders marked ready will wait here for delivery.'],
    today: ['No orders today', 'Today’s orders will be listed here.'],
  }[tab]

  return (
    <div className="kds">
      <style jsx global>{CSS}</style>

      {alert && (
        <div className="banner" role="alert">
          <div style={{ fontSize: 26 }}>🔔</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase', opacity: .8 }}>New order</div>
            <div style={{ fontSize: 16, fontWeight: 900 }}>#{alert.number} · {alert.table}</div>
          </div>
          <button type="button" onClick={() => { setAlert(null); setTab('queue') }}>Dismiss</button>
        </div>
      )}

      <header className="kds-top">
        <div style={{ minWidth: 0 }}>
          <div className="kds-brand">Kitchen</div>
          <div className="kds-sub">
            <span className={`dot ${connected ? 'on' : 'off'}`} />
            {connected ? 'Live' : 'Reconnecting'}
            {lastSync && <span>· synced {clock(lastSync)}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="iconbtn" aria-label="Test alarm"
            onClick={() => { unlockAudio(); playAlarm() }}>
            <Bell />
          </button>
          <button type="button" className="iconbtn" aria-label="Profile" onClick={() => setProfileOpen(true)}>
            <UserIcon />
          </button>
        </div>
      </header>

      <nav className="kds-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'queue'} className="kds-tab" onClick={() => setTab('queue')}>
          Queue <span className="count">{counts.queue}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'ready'} className="kds-tab" onClick={() => setTab('ready')}>
          Ready <span className="count">{counts.ready}</span>
        </button>
        <button type="button" role="tab" aria-selected={tab === 'today'} className="kds-tab" onClick={() => setTab('today')}>
          Today <span className="count">{counts.today}</span>
        </button>
      </nav>

      {tab === 'today' && (
        <section className="kds-summary">
          <div className="stat"><small>Total</small><b>{counts.today}</b></div>
          <div className="stat"><small>Active</small><b style={{ color: '#fb923c' }}>{counts.todayActive}</b></div>
          <div className="stat"><small>Delivered</small><b style={{ color: '#4ade80' }}>{counts.todayDelivered}</b></div>
        </section>
      )}

      <div className="kds-search">
        <input
          className="kds-input"
          type="search"
          placeholder="Search table, order number or dish"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <main className="kds-list">
        {list.length === 0 && (
          <div className="empty">
            <b>{q ? 'No matching orders' : emptyCopy[0]}</b>
            <p>{q ? 'Try another search.' : emptyCopy[1]}</p>
          </div>
        )}

        {list.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            now={now}
            busy={busyId === String(order.id)}
            onAdvance={updateStatus}
            onReopen={reopen}
            readOnly={false}
          />
        ))}
      </main>

      {profileOpen && (
        <ProfileSheet
          code={session.code}
          userId={session.userId}
          onSignOut={signOut}
          onClose={() => setProfileOpen(false)}
        />
      )}
    </div>
  )
}