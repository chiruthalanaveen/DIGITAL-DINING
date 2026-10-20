'use client'

const navBase =
  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold transition'

function hasBadge(badge) {
  return badge !== undefined && badge !== null && badge !== '' && badge !== 0
}

function NavButton({ item, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.key)}
      aria-current={active ? 'page' : undefined}
      className={`${navBase} ${
        active
          ? 'bg-slate-100 text-slate-950 ring-1 ring-slate-200'
          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center text-base ${
          active ? 'text-slate-900' : 'text-slate-400'
        }`}
        aria-hidden="true"
      >
        {item.icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {hasBadge(item.badge) && (
        <span className="max-w-[96px] truncate rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
          {item.badge}
        </span>
      )}
    </button>
  )
}

export default function PortalShell({
  profile,
  sections = [],
  activeKey,
  onSelect,
  search,
  footer,
  footerButtons = [],
  eyebrow,
  title,
  description,
  headerRight,
  children,
}) {
  const initial = String(profile?.name || 'U').trim().charAt(0).toUpperCase()
  const flatItems = sections.flatMap((section) => section.items)

  return (
    <div className="dd-portal-light min-h-[100dvh] lg:flex">
      <style jsx global>{`
        .dd-portal-light {
          background: #f4f5f7;
          color: #0f172a;
        }

        /* Dark card surfaces from the existing tab content become light cards. */
        .dd-portal-light [class~='bg-neutral-950'],
        .dd-portal-light [class~='bg-neutral-900'] {
          background-color: #ffffff !important;
        }
        .dd-portal-light [class~='bg-neutral-800'] {
          background-color: #f1f5f9 !important;
        }
        .dd-portal-light [class~='bg-neutral-700'] {
          background-color: #e2e8f0 !important;
        }

        /* Real dark buttons keep their dark background and white text. */
        .dd-portal-light button[class~='bg-neutral-950'],
        .dd-portal-light button[class~='bg-neutral-900'] {
          background-color: #0f172a !important;
          color: #ffffff !important;
        }

        .dd-portal-light [class~='border-neutral-800'] {
          border-color: #e2e8f0 !important;
        }
        .dd-portal-light [class~='border-neutral-700'] {
          border-color: #cbd5e1 !important;
        }

        /* White text without its own background becomes dark text. */
        .dd-portal-light [class~='text-white']:not([class*='bg-']) {
          color: #0f172a !important;
        }
        .dd-portal-light [class~='text-neutral-200'],
        .dd-portal-light [class~='text-neutral-300'] {
          color: #334155 !important;
        }
        .dd-portal-light [class~='text-neutral-400'],
        .dd-portal-light [class~='text-neutral-500'] {
          color: #64748b !important;
        }
        .dd-portal-light [class~='text-neutral-600'] {
          color: #475569 !important;
        }
        .dd-portal-light [class~='text-emerald-400'] {
          color: #059669 !important;
        }
        .dd-portal-light [class~='text-orange-400'] {
          color: #ea580c !important;
        }
        .dd-portal-light [class~='text-red-400'] {
          color: #dc2626 !important;
        }
        .dd-portal-light [class~='text-amber-400'] {
          color: #d97706 !important;
        }

        .dd-portal-light input,
        .dd-portal-light select,
        .dd-portal-light textarea {
          color: #0f172a !important;
        }
        .dd-portal-light option {
          background: #ffffff;
          color: #0f172a;
        }
      `}</style>

      {/* DESKTOP SIDEBAR */}
      <aside className="sticky top-0 hidden h-[100dvh] w-[260px] shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pink-50 text-sm font-black text-pink-600">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-slate-950">{profile?.name}</p>
              <p className="truncate text-[11px] text-slate-500">{profile?.subtitle}</p>
            </div>
            {profile?.online !== false && (
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" title="Online" />
            )}
          </div>

          {search && (
            <label className="mt-5 flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
              <span className="text-xs text-slate-400" aria-hidden="true">⌕</span>
              <input
                value={search.value}
                onChange={(event) => search.onChange(event.target.value)}
                placeholder={search.placeholder || 'Search'}
                aria-label={search.placeholder || 'Search'}
                className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-slate-900 outline-none placeholder:text-slate-400"
              />
            </label>
          )}
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Portal navigation">
          {sections.map((section, index) => (
            <div key={section.title || index}>
              {section.title && (
                <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  {section.title}
                </p>
              )}
              <div className="space-y-1">
                {section.items.map((item) => (
                  <NavButton
                    key={item.key}
                    item={item}
                    active={activeKey === item.key}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {footer && (
          <div className="space-y-2 border-t border-slate-100 p-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                    {footer.label}
                  </p>
                  <p className="mt-1 truncate text-lg font-black text-amber-950">{footer.value}</p>
                </div>
                <span className="text-xl text-amber-700" aria-hidden="true">
                  {footer.icon || '₹'}
                </span>
              </div>
              {footer.hint && (
                <p className="mt-2 text-[11px] font-semibold text-amber-700">{footer.hint}</p>
              )}
            </div>
            {footerButtons.map((button) => (
              <button
                key={button.label}
                type="button"
                onClick={button.onClick}
                className={`w-full rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
                  button.tone === 'danger'
                    ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {button.label}
              </button>
            ))}
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* MOBILE TOP BAR + SCROLLABLE SECTION CHIPS */}
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white lg:hidden">
          <div className="flex items-center gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pink-50 text-sm font-black text-pink-600">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-slate-950">{profile?.name}</p>
              <p className="truncate text-[11px] text-slate-500">{profile?.subtitle}</p>
            </div>
            {footerButtons.map((button) => (
              <button
                key={button.label}
                type="button"
                onClick={button.onClick}
                aria-label={button.label}
                className={`h-9 shrink-0 rounded-lg px-3 text-xs font-bold ${
                  button.tone === 'danger'
                    ? 'bg-rose-50 text-rose-700'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {button.short || button.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto px-3 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {flatItems.map((item) => {
              const active = activeKey === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onSelect(item.key)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-bold transition ${
                    active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <span aria-hidden="true">{item.icon}</span>
                  {item.label}
                  {hasBadge(item.badge) && (
                    <span className={active ? 'text-amber-300' : 'text-amber-700'}>· {item.badge}</span>
                  )}
                </button>
              )
            })}
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:px-8 lg:pt-8">
          <div className="mx-auto max-w-6xl space-y-6">
            {(eyebrow || title) && (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  {eyebrow && (
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                      {eyebrow}
                    </p>
                  )}
                  <h1 className="mt-1 break-words text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                    {title}
                  </h1>
                  {description && (
                    <p className="mt-1 text-xs text-slate-500 sm:text-sm">{description}</p>
                  )}
                </div>
                {headerRight && (
                  <div className="flex flex-wrap items-center gap-2">{headerRight}</div>
                )}
              </div>
            )}

            {children}
          </div>
        </main>
      </div>
    </div>
  )
}