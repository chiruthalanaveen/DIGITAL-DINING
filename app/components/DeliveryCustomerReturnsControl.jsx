'use client'
import {useCallback,useEffect,useState} from 'react'
import {supabase} from '@/lib/supabase'

// role: 'owner' | 'manager' | 'admin'
// For manager, provide sessionToken + sessionMode OR the existing legacy credentials.
export default function DeliveryCustomerReturnsControl({role,restaurantId='',restaurantCode='',sessionToken='',sessionMode=false,userId='',password=''}){
 const [stores,setStores]=useState([])
 const [selectedId,setSelectedId]=useState(restaurantId)
 const [enabled,setEnabled]=useState(false)
 const [loading,setLoading]=useState(true)
 const [saving,setSaving]=useState(false)
 const [message,setMessage]=useState('')
 const [error,setError]=useState('')
 const load=useCallback(async()=>{
  setLoading(true);setError('')
  try{
   if(role==='admin'){
    const response=await fetch('/api/admin/delivery-returns-policy',{cache:'no-store',credentials:'same-origin'})
    const body=await response.json().catch(()=>({}))
    if(!response.ok||!body.success)throw new Error(body.message||'Admin authorization is required.')
    const rows=Array.isArray(body.stores)?body.stores:[]
    setStores(rows)
    const selected=rows.some(s=>s.id===selectedId)?selectedId:(rows[0]?.id||'')
    setSelectedId(selected)
    setEnabled(rows.find(s=>s.id===selected)?.returnsEnabled===true)
   }else{
    if(!restaurantCode)throw new Error('Store code is required.')
    const {data,error:rpcError}=await supabase.rpc('get_public_delivery_customer_returns',{p_restaurant_code:restaurantCode})
    if(rpcError)throw rpcError
    if(!data?.success)throw new Error(data?.message||'Store returns settings unavailable.')
    setEnabled(data.returnsEnabled===true)
   }
  }catch(e){setError(e?.message||'Unable to load returns setting.')}
  finally{setLoading(false)}
 },[role,restaurantCode,selectedId])
 useEffect(()=>{void load()},[load])
 const save=async()=>{
  if(loading||saving)return
  setSaving(true);setError('');setMessage('')
  try{
   let result
   if(role==='admin'){
    const response=await fetch('/api/admin/delivery-returns-policy',{
     method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({restaurantId:selectedId,enabled:!enabled})
    })
    result=await response.json().catch(()=>({}))
    if(!response.ok||result?.success!==true)throw new Error(result?.message||'Unable to update setting.')
    setStores(v=>v.map(s=>s.id===selectedId?{...s,returnsEnabled:result.returnsEnabled===true}:s))
   }else if(role==='owner'){
    const {data:{session}}=await supabase.auth.getSession()
    if(!session?.access_token)throw new Error('Owner session expired. Please sign in again.')
    const {data,error:rpcError}=await supabase.rpc('owner_set_delivery_customer_returns',{
     p_restaurant_id:restaurantId,p_enabled:!enabled
    })
    if(rpcError)throw rpcError
    result=data
   }else if(role==='manager'){
    const useSession=Boolean(sessionMode&&sessionToken)
    const rpc=useSession?'manager_set_delivery_customer_returns_session':'manager_set_delivery_customer_returns_legacy'
    const args=useSession?{p_session_token:sessionToken,p_enabled:!enabled}:{
     p_restaurant_id:String(restaurantId),p_restaurant_code:restaurantCode,
     p_user_id:userId,p_password:password,p_enabled:!enabled
    }
    const {data,error:rpcError}=await supabase.rpc(rpc,args)
    if(rpcError)throw rpcError
    result=data
   }else{throw new Error('Unknown dashboard role.')}
   if(result?.success!==true)throw new Error(result?.message||'Unable to save returns setting.')
   setEnabled(result.returnsEnabled===true)
   setMessage(`New customer returns ${result.returnsEnabled?'enabled':'disabled'}. Existing cases remain available.`)
  }catch(e){setError(e?.message||'Unable to save returns policy.')}
  finally{setSaving(false)}
 }
 return <section className="rounded-2xl border border-neutral-300 bg-white p-4 text-neutral-950 shadow-sm">
  <h3 className="text-base font-black">Customer Returns · Delivery</h3>
  <p className="mt-1 text-xs text-neutral-600">Allow customers to request returns, replacements and refunds from delivered orders in My Orders. Turning this off does not delete existing requests or stop staff resolving them.</p>
  {role==='admin'&&<label className="mt-4 block text-xs font-bold">Delivery store
   <select className="mt-1 w-full rounded-xl border border-neutral-300 p-3 text-sm" value={selectedId}
    onChange={e=>{const id=e.target.value;setSelectedId(id);setEnabled(stores.find(s=>s.id===id)?.returnsEnabled===true);setMessage('')}}>
    {stores.map(s=><option key={s.id} value={s.id}>{s.name} ({s.restaurant_code})</option>)}
   </select>
  </label>}
  {error&&<p role="alert" className="mt-3 text-xs font-bold text-red-700">{error}</p>}
  {message&&<p className="mt-3 text-xs font-bold text-green-700">{message}</p>}
  <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
   <div><p className="font-bold text-sm">Accept new return requests</p>
    <p className="text-xs text-neutral-500">{loading?'Checking setting…':enabled?'Enabled':'Disabled'}</p></div>
   <button type="button" onClick={save} disabled={loading||saving||(role==='admin'&&!selectedId)}
    className={`rounded-xl px-4 py-2.5 text-xs font-black text-white disabled:opacity-40 ${enabled?'bg-red-600':'bg-green-700'}`}>
    {saving?'Saving…':enabled?'Disable':'Enable'}
   </button>
  </div>
 </section>
}
