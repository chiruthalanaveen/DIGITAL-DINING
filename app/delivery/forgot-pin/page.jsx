'use client'
import { Suspense, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
const QUESTIONS={
 first_trip:'Which place did you first travel alone to?',
 childhood_street:'Which street did you grow up on?',
 first_teacher:'What was your first teacher\'s name?',
 private_phrase:'What is your private recovery phrase hint?',
}
const goodStore=(v)=>/^[A-Za-z0-9_-]{1,80}$/.test(String(v||''))
function Form(){
 const router=useRouter(), params=useSearchParams()
 const store=useMemo(()=>{
  const value=params.get('store')||params.get('restaurantCode')||''
  return goodStore(value)?value:''
 },[params])
 const next=useMemo(()=>{
  const raw=params.get('next')||''
  return raw.startsWith('/delivery/')&&!raw.startsWith('//')&&!raw.includes('\\')?raw:(store?`/delivery/${store}`:'/delivery')
 },[params,store])
 const [mobile,setMobile]=useState(''),[questionKey,setQuestionKey]=useState('')
 const [answer,setAnswer]=useState(''),[recoveryCode,setRecoveryCode]=useState('')
 const [newPin,setNewPin]=useState(''),[confirm,setConfirm]=useState('')
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const [success,setSuccess]=useState(false),[newRecoveryCode,setNewRecoveryCode]=useState('')
 const loginPath=`/delivery/login?next=${encodeURIComponent(next)}${store?`&store=${encodeURIComponent(store)}`:''}`
 async function loadQuestion(){
  if(!store||!/^[6-9]\d{9}$/.test(mobile)){setError('Enter a valid mobile number and open this page from your delivery store.');return}
  setBusy(true);setError('')
  try{
   const response=await fetch(`/api/delivery/customer/forgot-pin?store=${encodeURIComponent(store)}&mobile=${encodeURIComponent(mobile)}`,{cache:'no-store'})
   const result=await response.json().catch(()=>({}))
   if(!response.ok) throw new Error(result.message||'PIN recovery is temporarily unavailable. Contact your delivery store for help.')
   if(!Object.hasOwn(QUESTIONS,result?.questionKey)) throw new Error('This account has no security-question recovery. Contact support or use mobile OTP if available.')
   setQuestionKey(result.questionKey)
  }catch(e){setError(e.message||'Could not load security question.')}
  finally{setBusy(false)}
 }
 async function submit(event){
  event.preventDefault();setError('')
  if(newPin!==confirm){setError('New PIN entries do not match.');return}
  setBusy(true)
  try{
   const response=await fetch('/api/delivery/customer/forgot-pin',{
    method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',
    body:JSON.stringify({store,mobile,securityQuestionKey:questionKey,securityAnswer:answer,recoveryCode,newPin}),
   })
   const result=await response.json().catch(()=>({}))
   if(!response.ok||!result.success)throw new Error(result.message||'Verification failed.')
   setNewRecoveryCode(result.recoveryCode);setSuccess(true)
   setAnswer('');setRecoveryCode('');setNewPin('');setConfirm('')
  }catch(e){setError(e.message||'Unable to reset PIN.')}
  finally{setBusy(false)}
 }
 return <main className="min-h-dvh bg-[#f7f8f6] px-5 py-8 text-neutral-950">
  <div className="mx-auto w-full max-w-md space-y-5">
   <button type="button" onClick={()=>router.push(loginPath)} className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-sm font-black">← Back to login</button>
   <header><p className="text-xs font-black uppercase tracking-widest text-emerald-700">Digital Dine-In Delivery</p>
     <h1 className="mt-2 text-3xl font-black">Forgot your PIN?</h1>
     <p className="mt-2 text-sm text-neutral-500">Verify your security answer and recovery code. Existing logged-in devices will be signed out when the PIN changes.</p>
   </header>
   <div className="space-y-4 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">
    {success ? <>
     <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-800">PIN changed. Save your NEW recovery code — the previous one no longer works.</p>
     <p className="break-all rounded-xl border p-3 text-center font-mono text-lg font-bold">{newRecoveryCode}</p>
     <button type="button" onClick={()=>router.push(loginPath)} className="w-full rounded-xl bg-emerald-600 p-3 font-bold text-white">Return to Login</button>
    </> : <>
     <label className="block text-xs font-black">Mobile number (+91)
      <input type="tel" inputMode="numeric" maxLength={10} value={mobile} onChange={e=>{setMobile(e.target.value.replace(/\D/g,'').slice(0,10));setQuestionKey('')}}
        className="mt-2 w-full rounded-xl border border-neutral-200 p-3 text-sm" placeholder="10-digit mobile" /></label>
     {!questionKey ? <button type="button" disabled={busy} onClick={loadQuestion} className="w-full rounded-xl bg-neutral-950 p-3 text-sm font-bold text-white disabled:opacity-40">{busy?'Checking...':'Continue'}</button> :
     <form onSubmit={submit} className="space-y-4">
      <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-900">{QUESTIONS[questionKey]||'Security question'}</p>
      <label className="block text-xs font-black">Security answer
       <input type="password" autoComplete="off" minLength={8} maxLength={72} required value={answer} onChange={e=>setAnswer(e.target.value)} className="mt-2 w-full rounded-xl border border-neutral-200 p-3 text-sm"/></label>
      <label className="block text-xs font-black">Recovery code (shown at signup)
       <input type="text" required value={recoveryCode} onChange={e=>setRecoveryCode(e.target.value.toUpperCase().slice(0,25))} placeholder="DD-XXXXXXXXXXXX" className="mt-2 w-full rounded-xl border border-neutral-200 p-3 text-sm"/></label>
      <label className="block text-xs font-black">New 4-digit PIN
       <input type="password" inputMode="numeric" maxLength={4} minLength={4} required value={newPin} onChange={e=>setNewPin(e.target.value.replace(/\D/g,'').slice(0,4))} className="mt-2 w-full rounded-xl border border-neutral-200 p-3 text-sm" /></label>
      <label className="block text-xs font-black">Confirm new PIN
       <input type="password" inputMode="numeric" maxLength={4} minLength={4} required value={confirm} onChange={e=>setConfirm(e.target.value.replace(/\D/g,'').slice(0,4))} className="mt-2 w-full rounded-xl border border-neutral-200 p-3 text-sm" /></label>
      <button type="submit" disabled={busy} className="w-full rounded-xl bg-emerald-600 p-3 text-sm font-bold text-white disabled:opacity-40">{busy?'Verifying...':'Reset PIN'}</button>
     </form>}
     {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs font-bold text-red-700">{error}</p>}
    </>}
   </div>
  </div>
 </main>
}
export default function DeliveryForgotPinPage(){return <Suspense fallback={<main className="p-8">Loading recovery…</main>}><Form/></Suspense>}
