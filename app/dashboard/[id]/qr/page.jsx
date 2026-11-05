'use client'

// Full owner-only restaurant table QR designer.
// Exact destination: app/dashboard/[id]/qr/page.jsx
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import OwnerQRPosterDesigner from '@/app/components/OwnerQRPosterDesigner'
import '@/app/components/owner-workspace-premium.css'

const integer = (value, fallback = 1) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback

export default function TableQRPage() {
  const router = useRouter()
  const params = useParams()
  const restaurantId = String(params?.id || '')
  const [restaurant, setRestaurant] = useState(null)
  const [tables, setTables] = useState([])
  const [tableNo, setTableNo] = useState(1)
  const [site, setSite] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingTables, setLoadingTables] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadTables = useCallback(async () => {
    if (!restaurantId) return []
    const { data, error: rpcError } = await supabase.rpc('get_owner_registered_tables', { p_restaurant_id: restaurantId })
    if (rpcError) throw new Error(rpcError.message || 'Unable to load registered tables.')
    const result = Array.isArray(data) ? data : []
    setTables(result)
    return result
  }, [restaurantId])

  useEffect(() => {
    let cancelled = false
    setSite(window.location.origin)
    const load = async () => {
      setLoading(true); setError('')
      try {
        const { data, error: authError } = await supabase.auth.getUser()
        if (authError || !data?.user?.id) { router.replace('/login'); return }
        // Keep the original owner's DB verification; never load a QR for another restaurant.
        const { data: row, error: ownerError } = await supabase.from('restaurants').select('*')
          .eq('id', restaurantId).eq('owner_id', data.user.id).maybeSingle()
        if (ownerError || !row) throw new Error('This restaurant is not linked to your owner account.')
        if (cancelled) return
        setRestaurant(row)
        await loadTables()
      } catch (caught) {
        if (!cancelled) setError(caught?.message || 'Unable to load the table QR designer.')
      } finally { if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [restaurantId, router, loadTables])

  const plan = String(restaurant?.plan || '')
  const maxTable = plan === 'Starter' ? 5 : 1000
  const registered = tables.some(row => Number(row.table_number) === Number(tableNo))
  const onTable = event => {
    const next = integer(event.target.value)
    setTableNo(Math.min(maxTable, next))
    if (next > maxTable) setNotice(`Your ${plan || 'current'} plan permits tables 1–${maxTable}.`)
    else setNotice('')
  }
  const onPrepare = async () => {
    if (!restaurant) throw new Error('Please sign in as the approved restaurant owner.')
    if (!Number.isInteger(tableNo) || tableNo < 1 || tableNo > maxTable) throw new Error('Invalid table number for your plan.')
    // This is the same registration RPC used by the original QR page.
    // It ensures the table is registered before we issue its printed poster.
    const { data, error: rpcError } = await supabase.rpc('register_table_qr', {
      p_restaurant_id: restaurantId, p_table_number: tableNo,
    })
    if (rpcError || data?.success === false) throw new Error(rpcError?.message || data?.message || 'Unable to register this table.')
    setLoadingTables(true)
    try { await loadTables() } finally { setLoadingTables(false) }
  }

  const menuUrl = site && restaurant ? `${site}/menu/${encodeURIComponent(restaurant.id)}?table=${encodeURIComponent(tableNo)}` : ''
  return <main className="min-h-screen bg-[#f5f8fb] px-3 py-5 text-[#182538] sm:px-6 sm:py-8">
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-[#15243b] px-5 py-5 text-white sm:px-7">
        <div><p className="text-[10px] font-black uppercase tracking-[.16em] text-emerald-300">DIGITAL DINE-IN / OWNER TOOLS</p><h1 className="mt-1 text-2xl font-black sm:text-3xl">Restaurant Table QR Studio</h1><p className="mt-1 text-xs text-slate-300">Editable QR posters, print-ready for individual tables</p></div>
        <button type="button" onClick={() => router.push(`/dashboard/${restaurantId}`)} className="rounded-xl border border-white/20 px-4 py-3 text-xs font-black text-white hover:bg-white/10">← Back to Dashboard</button>
      </header>
      {loading ? <div className="rounded-3xl bg-white p-10 text-center text-sm font-bold text-slate-500" role="status">Verifying your owner account and loading tables…</div>
        : error ? <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm font-bold text-rose-700" role="alert">{error}</div>
        : restaurant && <>
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black">{restaurant.name}</h2><p className="text-xs text-slate-500">{plan || 'Owner plan'} · {tables.length} registered table{tables.length === 1 ? '' : 's'}</p></div>
            <div className="flex flex-wrap items-center gap-2"><label className="text-xs font-black text-slate-600" htmlFor="dd-table-no">Table number</label><input id="dd-table-no" type="number" min="1" max={maxTable} step="1" value={tableNo} onChange={onTable} className="w-24 rounded-xl border border-slate-300 bg-white px-3 py-2 text-center text-base font-black text-slate-900"/><span className={`rounded-full px-3 py-2 text-[10px] font-black ${registered ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{registered ? '✓ Registered' : 'New table'}</span></div></div>
            <div className="mt-3 flex flex-wrap gap-2">{tables.map(row => <button key={row.id || row.table_number} type="button" onClick={() => setTableNo(Number(row.table_number))} className={`rounded-xl border px-4 py-2 text-xs font-bold ${Number(row.table_number) === tableNo ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>Table {row.table_number}</button>)}{!tables.length && <p className="text-xs text-slate-500">No tables registered yet. Select a number, customize its poster and download to register.</p>}</div>
            {notice && <p className="mt-3 text-xs text-amber-700" role="status">{notice}</p>}
            {loadingTables && <p className="mt-2 text-xs text-slate-500">Updating table registry…</p>}
          </section>
          <OwnerQRPosterDesigner type="table" restaurantName={restaurant.name || 'Restaurant'} tableNumber={tableNo} url={menuUrl} onPrepare={onPrepare}/>
        </>}
    </div>
  </main>
}