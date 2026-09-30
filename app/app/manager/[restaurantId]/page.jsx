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

function AppIcon({ name, className = 'h-5 w-5', strokeWidth = 1.8 }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }

  const icons = {
    home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V21h13V9.5" /><path d="M9.5 21v-7h5v7" /></>,
    orders: <><path d="M6 3.5h12v17H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
    tables: <><rect x="3.5" y="4" width="17" height="16" rx="2" /><path d="M3.5 10h17M9 4v16M15 4v16" /></>,
    menu: <><path d="M5 7h14M5 12h14M5 17h14" /></>,
    more: <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
    user: <><circle cx="12" cy="8" r="3.25" /><path d="M5.5 20c.8-4 3-6 6.5-6s5.7 2 6.5 6" /></>,
    refresh: <><path d="M20 7v5h-5" /><path d="M19 12a7 7 0 1 1-2-5.2L20 9" /></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    qr: <><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" /><path d="M14 14h2v2h-2zM18 14h2v6h-2M14 18h2v2h-2" /></>,
    billing: <><path d="M6 3.5h12v17l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2-2 1.2z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
    tag: <><path d="M4 4h7l9 9-7 7-9-9z" /><circle cx="8.5" cy="8.5" r="1.2" /></>,
    card: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18M7 15h4" /></>,
    users: <><circle cx="9" cy="8.5" r="3" /><path d="M3.5 19c.6-3.4 2.5-5 5.5-5s4.9 1.6 5.5 5" /><path d="M15.5 6.2a2.7 2.7 0 0 1 0 5.2M17 14.5c2.1.5 3.3 1.9 3.7 4.5" /></>,
    sync: <><path d="M20 7h-5V2" /><path d="M20 7a8 8 0 0 0-13.6-2.6L4 7" /><path d="M4 17h5v5" /><path d="M4 17a8 8 0 0 0 13.6 2.6L20 17" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19 13.5v-3l-2-.7-.7-1.7.9-1.9-2.1-2.1-1.9.9-1.7-.7L10.5 2h-3l-.7 2-1.7.7-1.9-.9L1.1 6l.9 1.9-.7 1.7-2 .7v3l2 .7.7 1.7-.9 1.9 2.1 2.1 1.9-.9 1.7.7.7 2h3l.7-2 1.7-.7 1.9.9 2.1-2.1-.9-1.9.7-1.7z" transform="translate(2.5 0) scale(.8)" /></>,
    bell: <><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 19a2.3 2.3 0 0 0 4 0" /></>,
    hotel: <><path d="M4 21V6h10v15M14 11h6v10M7 9h1M10 9h1M7 13h1M10 13h1M7 17h1M10 17h1M17 14h1M17 17h1" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    logout: <><path d="M10 5H5v14h5" /><path d="M13 8l4 4-4 4M8 12h9" /></>,
    kitchen: <><path d="M5 12h14v5a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z" /><path d="M7 12V9a5 5 0 0 1 10 0v3M9 6.5V4M15 6.5V4" /></>,
    palette: <><path d="M12 3a9 9 0 1 0 0 18h1.3a2 2 0 0 0 1.2-3.6c-.7-.5-.4-1.5.4-1.7H17a4 4 0 0 0 4-4A8.7 8.7 0 0 0 12 3Z" /><circle cx="7.5" cy="10" r=".8" fill="currentColor" stroke="none" /><circle cx="10" cy="6.8" r=".8" fill="currentColor" stroke="none" /><circle cx="14" cy="6.8" r=".8" fill="currentColor" stroke="none" /><circle cx="17" cy="10" r=".8" fill="currentColor" stroke="none" /></>,
    type: <><path d="M5 6V4h14v2M9 20h6M12 4v16" /></>,
    moon: <path d="M20 15.2A8 8 0 0 1 8.8 4 8 8 0 1 0 20 15.2Z" />,
    sun: <><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    volume: <><path d="M5 10v4h4l5 4V6l-5 4z" /><path d="M17 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" /></>,
    notifications: <><path d="M6 9a6 6 0 0 1 12 0v4l2 3H4l2-3z" /><path d="M10 20h4" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    close: <path d="M6 6l12 12M18 6 6 18" />,
    check: <path d="m5 12 4 4L19 6" />,
    store: <><path d="M4 10v10h16V10" /><path d="M3 10l2-6h14l2 6" /><path d="M8 20v-6h8v6" /></>,
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...common}>
      {icons[name] || icons.more}
    </svg>
  )
}

const MOBILE_EXPERIENCE_KEY = 'digital-dine-mobile-experience-v1'

const DEFAULT_MOBILE_EXPERIENCE = {
  darkMode: true,
  theme: 'orange',
  textSize: 'normal',
  uiStyle: 'soft',
  pushNotifications: true,
  orderMessages: true,
  promotions: false,
  sound: true,
}

function MobileExperienceSettings({ open, onClose, portal = 'App' }) {
  const [saved, setSaved] = useState(DEFAULT_MOBILE_EXPERIENCE)
  const [draft, setDraft] = useState(DEFAULT_MOBILE_EXPERIENCE)

  const themeOptions = [
    { id: 'orange', label: 'Orange', color: '#f97316' },
    { id: 'emerald', label: 'Green', color: '#059669' },
    { id: 'ocean', label: 'Blue', color: '#2563eb' },
    { id: 'violet', label: 'Violet', color: '#7c3aed' },
    { id: 'rose', label: 'Rose', color: '#e11d48' },
  ]

  const normalize = (value) => ({
    ...DEFAULT_MOBILE_EXPERIENCE,
    ...(value && typeof value === 'object' ? value : {}),
  })

  const applyExperience = (prefs) => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.dataset.ddAppTheme = prefs.theme
    root.dataset.ddUiStyle = prefs.uiStyle
    root.dataset.ddTextSize = prefs.textSize
    root.dataset.ddDarkMode = prefs.darkMode ? 'true' : 'false'
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const parsed = JSON.parse(localStorage.getItem(MOBILE_EXPERIENCE_KEY) || '{}')
      const next = normalize(parsed)
      setSaved(next)
      setDraft(next)
      applyExperience(next)
    } catch {
      applyExperience(DEFAULT_MOBILE_EXPERIENCE)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setDraft(saved)
  }, [open, saved])

  const setPreview = (patch) => {
    setDraft((current) => {
      const next = { ...current, ...patch }
      applyExperience(next)
      return next
    })
  }

  const closeWithoutSaving = () => {
    setDraft(saved)
    applyExperience(saved)
    onClose?.()
  }

  const save = () => {
    const next = normalize(draft)
    setSaved(next)
    applyExperience(next)
    try {
      localStorage.setItem(MOBILE_EXPERIENCE_KEY, JSON.stringify(next))
    } catch (error) {
      console.error('Unable to save mobile experience preferences:', error)
    }
    onClose?.()
  }

  if (!open) return null

  const accent = themeOptions.find((item) => item.id === draft.theme)?.color || '#f97316'
  const surface = draft.darkMode ? 'bg-[#151515] border-white/10 text-white' : 'bg-white border-neutral-200 text-neutral-950'
  const page = draft.darkMode ? 'bg-[#0d0d0e] text-white' : 'bg-[#f5f5f4] text-neutral-950'
  const muted = draft.darkMode ? 'text-neutral-400' : 'text-neutral-500'

  const Toggle = ({ value, onChange, label }) => (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={Boolean(value)}
      onClick={() => onChange(!value)}
      className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${
        value ? 'border-transparent' : draft.darkMode ? 'border-white/10 bg-neutral-800' : 'border-neutral-300 bg-neutral-200'
      }`}
      style={value ? { backgroundColor: accent } : undefined}
    >
      <span
        className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          value ? 'translate-x-[23px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  )

  return (
    <div className={`fixed inset-0 z-[120] ${page}`}>
      <style jsx global>{`
        html[data-dd-text-size='small'] .dd-mobile-themeable { font-size: 14px; }
        html[data-dd-text-size='normal'] .dd-mobile-themeable { font-size: 16px; }
        html[data-dd-text-size='large'] .dd-mobile-themeable { font-size: 18px; }
        html[data-dd-ui-style='rounded'] .dd-mobile-themeable .dd-experience-surface { border-radius: 20px; }
        html[data-dd-ui-style='soft'] .dd-mobile-themeable .dd-experience-surface { border-radius: 14px; }
        html[data-dd-ui-style='crisp'] .dd-mobile-themeable .dd-experience-surface { border-radius: 8px; }
      `}</style>

      <div className="mx-auto flex h-[100dvh] w-full max-w-[480px] flex-col overflow-hidden">
        <header className={`shrink-0 border-b px-4 pb-3 pt-[max(0.85rem,env(safe-area-inset-top))] ${draft.darkMode ? 'border-white/10 bg-[#0d0d0e]' : 'border-neutral-200 bg-white'}`}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={closeWithoutSaving}
              className={`flex h-10 w-10 items-center justify-center rounded-xl border ${draft.darkMode ? 'border-white/10 bg-neutral-900 text-neutral-300' : 'border-neutral-200 bg-white text-neutral-700'}`}
              aria-label="Back"
            >
              <AppIcon name="chevron" className="h-5 w-5 rotate-180" />
            </button>
            <div className="min-w-0">
              <p className={`text-[11px] font-medium ${muted}`}>{portal}</p>
              <h2 className="text-base font-semibold">App settings</h2>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-5 pb-28">
          <section>
            <div className="mb-2 px-1">
              <h3 className="text-sm font-semibold">Appearance</h3>
              <p className={`mt-0.5 text-[11px] ${muted}`}>Choose how this app looks on this device.</p>
            </div>

            <div className={`dd-experience-surface overflow-hidden border ${surface}`}>
              <div className={`flex items-center justify-between gap-4 p-4 ${draft.darkMode ? 'border-white/10' : 'border-neutral-200'}`}>
                <div className="flex min-w-0 items-center gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${draft.darkMode ? 'bg-neutral-800' : 'bg-neutral-100'}`}>
                    <AppIcon name={draft.darkMode ? 'moon' : 'sun'} className="h-[18px] w-[18px]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold">Dark mode</p>
                    <p className={`mt-0.5 text-[10px] ${muted}`}>Use a darker app surface.</p>
                  </div>
                </div>
                <Toggle value={draft.darkMode} onChange={(value) => setPreview({ darkMode: value })} label="Dark mode" />
              </div>

              <div className={`border-t p-4 ${draft.darkMode ? 'border-white/10' : 'border-neutral-200'}`}>
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${draft.darkMode ? 'bg-neutral-800' : 'bg-neutral-100'}`}>
                    <AppIcon name="palette" className="h-[18px] w-[18px]" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold">Accent color</p>
                    <p className={`mt-0.5 text-[10px] ${muted}`}>Used for selected controls and switches.</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-5 gap-2">
                  {themeOptions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPreview({ theme: item.id })}
                      className={`flex min-h-14 flex-col items-center justify-center rounded-xl border px-1 transition ${
                        draft.theme === item.id
                          ? draft.darkMode ? 'border-white/30 bg-white/5' : 'border-neutral-300 bg-neutral-50'
                          : draft.darkMode ? 'border-white/10' : 'border-neutral-200'
                      }`}
                      aria-label={`${item.label} accent`}
                    >
                      <span className="h-5 w-5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className={`mt-1.5 text-[8px] font-medium ${muted}`}>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className={`border-t p-4 ${draft.darkMode ? 'border-white/10' : 'border-neutral-200'}`}>
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${draft.darkMode ? 'bg-neutral-800' : 'bg-neutral-100'}`}>
                    <AppIcon name="type" className="h-[18px] w-[18px]" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold">Text size</p>
                    <p className={`mt-0.5 text-[10px] ${muted}`}>Adjust the app's reading size.</p>
                  </div>
                </div>
                <div className={`mt-4 grid grid-cols-3 rounded-xl p-1 ${draft.darkMode ? 'bg-neutral-900' : 'bg-neutral-100'}`}>
                  {['small', 'normal', 'large'].map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPreview({ textSize: id })}
                      className={`min-h-10 rounded-lg text-[11px] font-medium capitalize transition ${
                        draft.textSize === id
                          ? draft.darkMode ? 'bg-neutral-700 text-white shadow-sm' : 'bg-white text-neutral-950 shadow-sm'
                          : muted
                      }`}
                    >
                      {id}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`border-t p-4 ${draft.darkMode ? 'border-white/10' : 'border-neutral-200'}`}>
                <p className="text-[13px] font-semibold">Card corners</p>
                <p className={`mt-0.5 text-[10px] ${muted}`}>A small visual preference; features stay unchanged.</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    ['rounded', 'Rounded'],
                    ['soft', 'Soft'],
                    ['crisp', 'Compact'],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPreview({ uiStyle: id })}
                      className={`min-h-11 border px-2 text-[10px] font-medium transition ${
                        id === 'rounded' ? 'rounded-2xl' : id === 'soft' ? 'rounded-xl' : 'rounded-md'
                      } ${
                        draft.uiStyle === id
                          ? 'text-white'
                          : draft.darkMode ? 'border-white/10 text-neutral-400' : 'border-neutral-200 text-neutral-600'
                      }`}
                      style={draft.uiStyle === id ? { backgroundColor: accent, borderColor: accent } : undefined}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="mt-6">
            <div className="mb-2 px-1">
              <h3 className="text-sm font-semibold">Notifications</h3>
              <p className={`mt-0.5 text-[11px] ${muted}`}>Control which app alerts are enabled.</p>
            </div>

            <div className={`dd-experience-surface overflow-hidden border ${surface}`}>
              {[
                ['pushNotifications', 'notifications', 'Push notifications', 'General app and order alerts'],
                ['orderMessages', 'orders', 'Order activity', 'New orders and status changes'],
                ['promotions', 'tag', 'Product updates', 'Plan and feature announcements'],
                ['sound', 'volume', 'Alert sound', 'Play sound for supported alerts'],
              ].map(([key, icon, title, subtitle], index) => (
                <div key={key} className={`flex items-center justify-between gap-4 p-4 ${index ? draft.darkMode ? 'border-t border-white/10' : 'border-t border-neutral-200' : ''}`}>
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${draft.darkMode ? 'bg-neutral-800' : 'bg-neutral-100'}`}>
                      <AppIcon name={icon} className="h-[18px] w-[18px]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold">{title}</p>
                      <p className={`mt-0.5 truncate text-[10px] ${muted}`}>{subtitle}</p>
                    </div>
                  </div>
                  <Toggle value={draft[key]} onChange={(value) => setPreview({ [key]: value })} label={title} />
                </div>
              ))}
            </div>
          </section>

          <p className={`mt-4 px-1 text-[10px] leading-5 ${muted}`}>
            These preferences are stored on this device. Restaurant data, orders, staff, menu, billing and payment settings are unchanged.
          </p>
        </div>

        <div className={`absolute bottom-0 left-1/2 w-full max-w-[480px] -translate-x-1/2 border-t px-4 pb-[max(0.8rem,env(safe-area-inset-bottom))] pt-3 ${draft.darkMode ? 'border-white/10 bg-[#0d0d0e]/95' : 'border-neutral-200 bg-white/95'} backdrop-blur-xl`}>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={closeWithoutSaving}
              className={`min-h-11 rounded-xl border text-xs font-semibold ${draft.darkMode ? 'border-white/10 bg-neutral-900 text-neutral-300' : 'border-neutral-200 bg-white text-neutral-700'}`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              className="min-h-11 rounded-xl text-xs font-semibold text-white shadow-sm"
              style={{ backgroundColor: accent }}
            >
              Save changes
            </button>
          </div>
        </div>
      </div>
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
                    className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-orange-500 disabled:opacity-50"
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
  const [experienceOpen, setExperienceOpen] = useState(false)
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

  // Lifetime order date search.
  // The existing secure Manager dashboard RPC already returns this
  // restaurant's order history, so this feature searches that same
  // Manager-authorized data without bypassing the existing backend.
  const [orderHistoryDate, setOrderHistoryDate] = useState('')
  const [orderHistoryOrders, setOrderHistoryOrders] = useState([])
  const [orderHistoryLoading, setOrderHistoryLoading] = useState(false)
  const [orderHistorySearched, setOrderHistorySearched] = useState(false)
  const [orderHistoryError, setOrderHistoryError] = useState('')
  const [orderHistoryVisibleCount, setOrderHistoryVisibleCount] = useState(20)

  const [swiggyDataInput, setSwiggyDataInput] = useState('')
  const [syncingSwiggy, setSyncingSwiggy] = useState(false)
  const [storeOpen, setStoreOpen] = useState(true)
  const [savingStoreStatus, setSavingStoreStatus] = useState(false)

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
    if (savingStoreStatus) return

    const next = !storeOpen
    setSavingStoreStatus(true)

    try {
      await managerRpcAction('toggle_store', {
        is_open: next,
      })

      setStoreOpen(next)
      setRestaurant((value) => ({
        ...value,
        is_open: next,
      }))

      notify(
        next
          ? 'Restaurant is now open and accepting orders.'
          : 'Restaurant is now closed. New orders are paused.'
      )
    } catch (error) {
      alert(
        `Unable to update restaurant status: ${
          error?.message || 'Please try again.'
        }`
      )
    } finally {
      setSavingStoreStatus(false)
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

  const formatOrderHistoryDate = (dateValue) => {
    if (!dateValue) return ''

    const [year, month, day] = String(dateValue)
      .split('-')
      .map(Number)

    if (!year || !month || !day) {
      return String(dateValue)
    }

    const date = new Date(
      year,
      month - 1,
      day
    )

    if (Number.isNaN(date.getTime())) {
      return String(dateValue)
    }

    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  const getOrderHistoryDayBounds = (dateValue) => {
    const [year, month, day] = String(dateValue)
      .split('-')
      .map(Number)

    if (!year || !month || !day) {
      throw new Error(
        'Please select a valid date.'
      )
    }

    const start = new Date(
      year,
      month - 1,
      day,
      0,
      0,
      0,
      0
    )

    if (
      Number.isNaN(start.getTime()) ||
      start.getFullYear() !== year ||
      start.getMonth() !== month - 1 ||
      start.getDate() !== day
    ) {
      throw new Error(
        'Please select a valid date.'
      )
    }

    const end = new Date(
      year,
      month - 1,
      day + 1,
      0,
      0,
      0,
      0
    )

    return { start, end }
  }

  const handleLifetimeOrderSearch = async () => {
    if (orderHistoryLoading) return

    if (!orderHistoryDate) {
      setOrderHistoryError(
        'Please select a date to search.'
      )
      setOrderHistorySearched(false)
      return
    }

    setOrderHistoryLoading(true)
    setOrderHistoryError('')
    setOrderHistorySearched(false)
    setOrderHistoryOrders([])
    setOrderHistoryVisibleCount(20)

    try {
      const { start, end } =
        getOrderHistoryDayBounds(
          orderHistoryDate
        )

      /*
       * IMPORTANT:
       * Manager authentication is not bypassed here.
       * `orders` comes from the existing secure Manager dashboard
       * RPC/session for this restaurant. We only filter that
       * authorized lifetime data for the selected calendar day.
       */
      const foundOrders = orders
        .filter((order) => {
          if (!order?.created_at) {
            return false
          }

          const createdAt =
            new Date(order.created_at)

          if (
            Number.isNaN(
              createdAt.getTime()
            )
          ) {
            return false
          }

          return (
            createdAt >= start &&
            createdAt < end
          )
        })
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() -
            new Date(b.created_at).getTime()
        )

      setOrderHistoryOrders(
        foundOrders
      )
      setOrderHistorySearched(true)
    } catch (error) {
      console.error(
        '[MANAGER ORDER HISTORY] Search error:',
        error
      )

      setOrderHistoryError(
        error?.message ||
          'Unable to search historical orders.'
      )
      setOrderHistorySearched(true)
    } finally {
      setOrderHistoryLoading(false)
    }
  }

  const clearLifetimeOrderSearch = () => {
    setOrderHistoryDate('')
    setOrderHistoryOrders([])
    setOrderHistoryError('')
    setOrderHistorySearched(false)
    setOrderHistoryVisibleCount(20)
  }

  const orderHistoryRevenue = useMemo(
    () =>
      orderHistoryOrders.reduce(
        (sum, order) =>
          String(
            order?.status || ''
          ).toLowerCase() ===
          'cancelled'
            ? sum
            : sum +
              Number(
                order?.total_amount ??
                  order?.total ??
                  0
              ),
        0
      ),
    [orderHistoryOrders]
  )

  const orderHistoryCancelledCount =
    useMemo(
      () =>
        orderHistoryOrders.filter(
          (order) =>
            String(
              order?.status || ''
            ).toLowerCase() ===
            'cancelled'
        ).length,
      [orderHistoryOrders]
    )

  const orderHistoryCompletedCount =
    useMemo(
      () =>
        orderHistoryOrders.filter(
          (order) =>
            [
              'completed',
              'delivered',
              'served',
            ].includes(
              String(
                order?.status || ''
              ).toLowerCase()
            )
        ).length,
      [orderHistoryOrders]
    )

  const visibleOrderHistory =
    useMemo(
      () =>
        orderHistoryOrders.slice(
          0,
          orderHistoryVisibleCount
        ),
      [
        orderHistoryOrders,
        orderHistoryVisibleCount,
      ]
    )

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
    setOrderHistoryDate('')
    setOrderHistoryOrders([])
    setOrderHistoryError('')
    setOrderHistorySearched(false)
    setOrderHistoryVisibleCount(20)
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
    if (value === 'preparing') return 'border-violet-500/30 bg-violet-500/10 text-orange-300'
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

  const MobileOrderCard = ({
    order,
    compact = false,
    readOnly = false,
  }) => {
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

            {!readOnly && (
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
            )}

            {readOnly && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-950 px-3 py-2.5">
                <div>
                  <p className="text-[8px] font-black uppercase tracking-wider text-neutral-600">
                    Historical Order
                  </p>
                  <p className="mt-0.5 text-[10px] font-bold text-neutral-400">
                    Read-only result
                  </p>
                </div>

                <span className="rounded-full border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-[8px] font-black text-neutral-500">
                  ARCHIVE
                </span>
              </div>
            )}
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
    <main className="dd-mobile-themeable dd-human-manager min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-[#0f0f10] text-neutral-100">
      <style jsx global>{`
        .dd-human-manager { background: #0f0f10 !important; }
        .dd-human-manager .font-black { font-weight: 700 !important; }
        .dd-human-manager .shadow-xl,
        .dd-human-manager .shadow-2xl { box-shadow: 0 8px 24px rgba(0,0,0,.18) !important; }
        .dd-human-manager [class*="rounded-[30px]"],
        .dd-human-manager [class*="rounded-[28px]"],
        .dd-human-manager [class*="rounded-[26px]"],
        .dd-human-manager [class*="rounded-[24px]"],
        .dd-human-manager [class*="rounded-[22px]"] { border-radius: 16px !important; }
        .dd-human-manager .dd-human-nav button { border-radius: 10px !important; }
        .dd-human-manager .dd-human-nav .dd-nav-indicator { transition: opacity .16s ease, transform .16s ease; }
        .dd-human-manager button, .dd-human-manager input, .dd-human-manager select, .dd-human-manager textarea { -webkit-tap-highlight-color: transparent; }
        @media (prefers-reduced-motion: reduce) {
          .dd-human-manager * { scroll-behavior: auto !important; }
        }
      `}</style>
      <div className="mx-auto min-h-[100dvh] w-full max-w-[480px] overflow-x-hidden bg-[#0f0f10] pb-[calc(7rem+env(safe-area-inset-bottom))]">
        <header className="sticky top-0 z-40 w-full border-b border-neutral-800 bg-[#0f0f10]/96 px-4 pb-3 pt-[max(0.8rem,env(safe-area-inset-top))] backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold text-orange-400">Manager workspace</p>
              <h1 className="mt-0.5 truncate text-lg font-semibold text-white">{restaurant?.name || 'Restaurant'}</h1>
              <p className="mt-0.5 truncate text-[11px] text-neutral-500">{manager?.name || manager?.user_id} · {currentPlanDisplay}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={storeOpen}
                disabled={savingStoreStatus}
                onClick={handleStoreToggle}
                className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-2xl border px-2.5 text-[8px] font-black transition disabled:cursor-wait disabled:opacity-60 ${
                  storeOpen
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-red-500/30 bg-red-500/10 text-red-300'
                }`}
                aria-label={
                  storeOpen
                    ? 'Close restaurant'
                    : 'Open restaurant'
                }
                title={
                  storeOpen
                    ? 'Restaurant open'
                    : 'Restaurant closed'
                }
              >
                <span
                  className={`relative h-5 w-9 rounded-full ${
                    storeOpen
                      ? 'bg-emerald-500'
                      : 'bg-red-500'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                      storeOpen
                        ? 'translate-x-[18px]'
                        : 'translate-x-0.5'
                    }`}
                  />
                </span>
                <span className="hidden min-[390px]:inline">
                  {savingStoreStatus
                    ? 'Saving'
                    : storeOpen
                      ? 'Open'
                      : 'Closed'}
                </span>
              </button>
              <button
                type="button"
                onClick={fetchDashboard}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-300 transition active:bg-neutral-800"
                aria-label="Refresh"
              >
                {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-600 border-t-white" /> : <AppIcon name="refresh" className="h-5 w-5" />}
              </button>
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-300 transition active:bg-neutral-800"
                aria-label="Profile"
              >
                <AppIcon name="user" className="h-5 w-5" />
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
              <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-semibold text-neutral-400">Today</p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">{money(todayOrders.reduce((sum, order) => sum + Number(order.total_amount ?? order.total ?? 0), 0))}</h2>
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

              <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 shadow-sm">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-500/20 bg-neutral-800 text-orange-300">
                          <AppIcon name="search" className="h-5 w-5" />
                        </span>

                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold text-neutral-400">
                            Lifetime Order Search
                          </p>

                          <h3 className="mt-0.5 text-base font-semibold text-white">
                            Find orders by date
                          </h3>
                        </div>
                      </div>

                      <p className="mt-3 text-[11px] leading-5 text-neutral-500">
                        Select any calendar date to view the orders recorded for that day from the same secure Manager order history.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-[22px] border border-neutral-800 bg-neutral-950/80 p-3">
                    <label className="block text-[9px] font-black uppercase tracking-wider text-neutral-500">
                      Order Date
                    </label>

                    <div className="mt-2 grid grid-cols-1 gap-2 min-[380px]:grid-cols-[1fr_auto]">
                      <input
                        type="date"
                        value={orderHistoryDate}
                        onChange={(event) => {
                          setOrderHistoryDate(
                            event.target.value
                          )
                          setOrderHistoryError('')
                        }}
                        className="min-h-12 min-w-0 rounded-2xl border border-neutral-800 bg-neutral-900 px-4 text-base font-black text-white outline-none transition focus:border-orange-500"
                      />

                      <button
                        type="button"
                        onClick={handleLifetimeOrderSearch}
                        disabled={
                          orderHistoryLoading ||
                          !orderHistoryDate
                        }
                        className="min-h-12 rounded-2xl bg-orange-500 px-5 text-[10px] font-black text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {orderHistoryLoading
                          ? 'Searching...'
                          : 'Search Orders'}
                      </button>
                    </div>

                    {orderHistoryDate && (
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="text-[9px] font-bold text-neutral-600">
                          Selected: {formatOrderHistoryDate(orderHistoryDate)}
                        </p>

                        <button
                          type="button"
                          onClick={clearLifetimeOrderSearch}
                          disabled={orderHistoryLoading}
                          className="text-[9px] font-black text-orange-300 disabled:opacity-50"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-neutral-800 p-4">
                  {orderHistoryError && (
                    <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-3 text-[10px] font-bold leading-5 text-red-300">
                      {orderHistoryError}
                    </div>
                  )}

                  {!orderHistorySearched &&
                    !orderHistoryLoading &&
                    !orderHistoryError && (
                      <div className="py-3 text-center">
                        <div className="text-3xl">
                          📅
                        </div>

                        <p className="mt-2 text-xs font-black text-white">
                          Search historical orders
                        </p>

                        <p className="mx-auto mt-1 max-w-[310px] text-[10px] leading-5 text-neutral-600">
                          Example: choose 11/12/2000 if an order exists on that date.
                        </p>
                      </div>
                    )}

                  {orderHistoryLoading && (
                    <div className="flex items-center justify-center gap-3 py-7">
                      <div className="h-7 w-7 animate-spin rounded-full border-4 border-neutral-800 border-t-orange-500" />

                      <div>
                        <p className="text-[10px] font-black text-white">
                          Searching order history
                        </p>

                        <p className="mt-0.5 text-[9px] text-neutral-600">
                          Looking at {formatOrderHistoryDate(orderHistoryDate)}
                        </p>
                      </div>
                    </div>
                  )}

                  {orderHistorySearched &&
                    !orderHistoryLoading &&
                    !orderHistoryError && (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.16em] text-orange-300">
                              Search Result
                            </p>

                            <h4 className="mt-1 text-base font-black text-white">
                              {formatOrderHistoryDate(orderHistoryDate)}
                            </h4>
                          </div>

                          <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1.5 text-[8px] font-black text-orange-300">
                            {orderHistoryOrders.length} ORDER{orderHistoryOrders.length === 1 ? '' : 'S'}
                          </span>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2">
                          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                            <p className="text-[8px] font-black uppercase tracking-wider text-neutral-600">
                              Revenue
                            </p>

                            <p className="mt-1 text-base font-black text-emerald-400">
                              {money(orderHistoryRevenue)}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-3">
                            <p className="text-[8px] font-black uppercase tracking-wider text-neutral-600">
                              Completed
                            </p>

                            <p className="mt-1 text-base font-black text-sky-300">
                              {orderHistoryCompletedCount}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3">
                            <p className="text-[8px] font-black uppercase tracking-wider text-neutral-600">
                              Total Orders
                            </p>

                            <p className="mt-1 text-base font-black text-amber-300">
                              {orderHistoryOrders.length}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-3">
                            <p className="text-[8px] font-black uppercase tracking-wider text-neutral-600">
                              Cancelled
                            </p>

                            <p className="mt-1 text-base font-black text-red-300">
                              {orderHistoryCancelledCount}
                            </p>
                          </div>
                        </div>

                        {orderHistoryOrders.length === 0 ? (
                          <div className="py-8 text-center">
                            <div className="text-4xl">
                              🧾
                            </div>

                            <p className="mt-3 text-xs font-black text-white">
                              No orders found
                            </p>

                            <p className="mt-1 text-[10px] leading-5 text-neutral-600">
                              No saved orders were returned for {formatOrderHistoryDate(orderHistoryDate)}.
                            </p>
                          </div>
                        ) : (
                          <div className="mt-4 space-y-3">
                            {visibleOrderHistory.map(
                              (order) => (
                                <MobileOrderCard
                                  key={order.id}
                                  order={order}
                                  readOnly
                                />
                              )
                            )}

                            {orderHistoryVisibleCount <
                              orderHistoryOrders.length && (
                              <button
                                type="button"
                                onClick={() =>
                                  setOrderHistoryVisibleCount(
                                    (current) =>
                                      current + 20
                                  )
                                }
                                className="w-full rounded-2xl border border-orange-500/20 bg-orange-500/5 py-3 text-[10px] font-black text-orange-300"
                              >
                                Show 20 More Orders
                              </button>
                            )}

                            {orderHistoryOrders.length >
                              20 && (
                              <p className="pt-1 text-center text-[8px] font-semibold text-neutral-600">
                                Showing {Math.min(orderHistoryVisibleCount, orderHistoryOrders.length)} of {orderHistoryOrders.length} orders
                              </p>
                            )}
                          </div>
                        )}
                      </>
                    )}
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
                      <h3 className="mt-0.5 text-base font-semibold text-white">🏨 Open Resort Workspace</h3>
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
                          {isHighlyReordered(item) && <span className="rounded-full bg-violet-500/10 px-2 py-1 text-[9px] font-black text-orange-300">Highly Reordered</span>}
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
                <div className="rounded-[24px] border border-neutral-800 bg-neutral-900 p-4"><p className="text-[9px] font-black uppercase text-neutral-600">Peak Hour</p><p className="mt-2 text-xl font-black text-orange-300">{peakHour ? `${String(peakHour.hour).padStart(2, '0')}:00` : '—'}</p></div>
              </div>
              <button type="button" onClick={downloadReport} className="w-full rounded-2xl border border-orange-500/20 bg-orange-500/10 py-3 text-xs font-black text-orange-300">Download CSV Report</button>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
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
              <MobileSectionTitle eyebrow="Manager" title="More" subtitle="Account, staff, reporting and app settings." />
              <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
                {[
                  ['users', 'Staff Accounts', 'Manage waiter and kitchen logins', 'staff'],
                  ['tag', 'Offers of the Day', 'QR-menu promotions', 'offers'],
                  ['chart', 'Analytics & Reports', hasAdvancedAnalytics ? 'Sales and CSV reports' : 'Pro plan feature', 'settlements'],
                  ['sync', 'Menu Import', 'Import menu JSON', 'swiggy-sync'],
                  ['settings', 'App Settings', 'Appearance and notifications', 'experience-settings'],
                  ...(hasResortAccess ? [['hotel', 'Resort Dashboard', 'Separate resort workspace', 'resort']] : []),
                ].map(([icon, title, subtitle, target]) => (
                  <button key={target} type="button" onClick={() => target === 'experience-settings' ? setExperienceOpen(true) : setActiveTab(target)} className="flex w-full items-center gap-3 border-b border-neutral-800 px-4 py-3.5 text-left last:border-b-0 active:bg-neutral-800/70">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-950 text-neutral-300"><AppIcon name={icon} className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold text-white">{title}</span><span className="mt-0.5 block truncate text-[10px] text-neutral-500">{subtitle}</span></span>
                    <AppIcon name="chevron" className="h-4 w-4 text-neutral-600" />
                  </button>
                ))}
              </div>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
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
            <div className="max-h-[92dvh] w-full max-w-[480px] overflow-y-auto rounded-t-2xl border border-neutral-800 bg-neutral-900 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl">
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-neutral-700 sm:hidden" />
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-400">Manager Profile</p><h2 className="mt-1 text-xl font-black text-white">Account</h2></div>
                <button type="button" onClick={() => setProfileOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 text-neutral-400"><AppIcon name="close" className="h-4 w-4" /></button>
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

        <MobileExperienceSettings open={experienceOpen} onClose={() => setExperienceOpen(false)} portal="Manager" />

        <nav className="dd-human-nav fixed bottom-0 left-1/2 z-50 w-[100svw] max-w-[480px] -translate-x-1/2 border-t border-neutral-800 bg-[#111112]/96 px-2 pt-1.5 pb-[max(0.45rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
          <div className="grid grid-cols-5 gap-1">
            {[
              ['home', 'home', 'Home'],
              ['live-orders', 'orders', 'Orders'],
              ['tables', 'tables', 'Tables'],
              ['menu', 'menu', 'Menu'],
              ['more', 'more', 'More'],
            ].map(([id, icon, label]) => {
              const selected = id === 'more' ? moreSectionActive || mobileSection === 'more' : mobileSection === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`relative flex min-h-[58px] flex-col items-center justify-center px-1 text-center transition active:opacity-70 ${selected ? 'text-orange-400' : 'text-neutral-500'}`}
                >
                  <span className={`dd-nav-indicator absolute top-0 h-0.5 w-5 rounded-full bg-orange-400 ${selected ? 'opacity-100' : 'opacity-0'}`} />
                  <AppIcon name={icon} className="h-5 w-5" strokeWidth={selected ? 2.1 : 1.8} />
                  <span className={`mt-1 text-[10px] ${selected ? 'font-semibold' : 'font-medium'}`}>{label}</span>
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
