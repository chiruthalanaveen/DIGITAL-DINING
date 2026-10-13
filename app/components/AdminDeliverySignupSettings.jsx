'use client'
import { useCallback, useEffect, useState } from 'react'
const modeLabel={otp:'SMS OTP + Mobile PIN',pin_question:'Mobile PIN + Security Question'}
export default function AdminDeliverySignupSettings(){
 const [data,setData]=useState(null)
 const [selection,setSelection]=useState('otp')
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const load=useCallback(async()=>{
  setBusy(true);setError('')
  try{
   const response=await fetch('/api/admin/delivery-signup-settings',{cache:'no-store',credentials:'same-origin'})
   const result=await response.json().catch(()=>({}))
   if(!response.ok||!result.success)throw new Error(result?.message||'Unable to load settings.')
   setData(result);setSelection(result.signupMode)
  }catch(e){setError(e?.message||'Unable to load settings.')}
  finally{setBusy(false)}
 },[])
 useEffect(()=>{void load()},[load])
 const save=async()=>{
  if(busy||!data||selection===data.signupMode)return
  if(!window.confirm(`Change ALL delivery customer signups to ${modeLabel[selection]}? Existing users can still sign in.`))return
  setBusy(true);setError('');setNotice('')
  try{
   const response=await fetch('/api/admin/delivery-signup-settings',{
    method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({signupMode:selection}),
   })
   const result=await response.json().catch(()=>({}))
   if(!response.ok||!result.success)throw new Error(result.message||'Unable to save.')
   setNotice('Signup policy updated. It applies to new registrations only.')
   await load()
  }catch(e){setError(e?.message||'Unable to save signup policy.')}
  finally{setBusy(false)}
 }
 return (
  <section className="rounded-3xl border border-neutral-700 bg-neutral-900 p-5 text-white shadow-sm space-y-4">
   <div>
    <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">Super Admin · Delivery</p>
    <h2 className="mt-2 text-lg font-black">Customer Signup Security</h2>
    <p className="mt-1 text-xs text-neutral-300">Choose the method for NEW mobile signups across all delivery stores. Google signup is unaffected.</p>
   </div>
   <div className="grid gap-3 sm:grid-cols-2">
    {[{key:'otp',name:'Verify with mobile OTP',info:'Requires Supabase Phone Auth with an SMS provider. Creates an account with mobile OTP and PIN.'},
      {key:'pin_question',name:'Mobile PIN + security question',info:'No SMS provider needed. Phone ownership is NOT verified. PIN recovery requires both a secret answer and a recovery code.'}].map(option=> (
      <label key={option.key} className={`flex cursor-pointer gap-3 rounded-2xl border p-4 ${selection===option.key?'border-orange-400 bg-neutral-800':'border-neutral-700 bg-neutral-950'}`}>
       <input type="radio" name="delivery-signup-mode" className="mt-1 accent-orange-500" value={option.key}
         checked={selection===option.key} disabled={busy} onChange={()=>setSelection(option.key)}/>
       <span><span className="block text-sm font-black">{option.name}</span><span className="mt-1 block text-xs leading-5 text-neutral-400">{option.info}</span></span>
      </label>
    ))}
   </div>
   {data && <p className="text-xs text-neutral-300">Current: <strong>{modeLabel[data.signupMode]}</strong> · Signed in as {data.loggedInAdmin}</p>}
   {error && <p role="alert" className="rounded-lg border border-red-600/40 bg-red-950/40 p-3 text-xs text-red-300">{error}</p>}
   {notice && <p role="status" className="rounded-lg border border-emerald-600/40 bg-emerald-950/40 p-3 text-xs text-emerald-300">{notice}</p>}
   <div className="flex flex-wrap gap-2">
    <button type="button" disabled={busy||!data||selection===data.signupMode} onClick={save}
      className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-black text-white disabled:opacity-40">{busy?'Working...':'Save signup method'}</button>
    <button type="button" disabled={busy} onClick={()=>void load()}
      className="rounded-xl border border-neutral-700 px-5 py-3 text-sm font-black disabled:opacity-40">Refresh</button>
   </div>
   <div>
    <p className="text-xs font-black">Recent admin changes</p>
    {(data?.history||[]).slice(0,6).map(event=>(
      <p key={event.id} className="mt-2 border-t border-neutral-800 pt-2 text-xs text-neutral-400">
       {event.previous_mode} → {event.new_mode} · {event.changed_by_admin} · {new Date(event.changed_at).toLocaleString('en-IN')}
      </p>
    ))}
   </div>
  </section>
 )
}
