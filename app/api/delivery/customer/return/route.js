import { NextResponse } from 'next/server'
import { readDeliveryMobileSession } from '@/lib/server/deliveryCustomerMobileSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'
export const runtime='nodejs'
export const dynamic='force-dynamic'
function reply(body,status=200){return NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie, Authorization'}})}
function validCode(v,max=100){const s=String(v||'').trim();return /^[a-z0-9_-]+$/i.test(s)&&s.length<=max?s:''}
function digits(v){return String(v||'').replace(/\D/g,'').slice(0,15)}
async function getContext(request,restaurantCode,orderCode,requestedAccountType){
 const admin=getAdminSupabase()
 const {data:store,error:storeError}=await admin.from('restaurants').select('id,restaurant_code')
  .ilike('restaurant_code',restaurantCode).maybeSingle()
 if(storeError) throw storeError
 if(!store) return {fail:reply({success:false,message:'Store not found.'},404)}
 const mode=String(requestedAccountType||'').toLowerCase()
 if(!['','mobile','google'].includes(mode))return {fail:reply({success:false,message:'Invalid account type.'},400)}
 let account=null
 // Default to the account shown in the application: Mobile/PIN for this store.
 if(mode!=='google'){
  const mobile=await readDeliveryMobileSession(admin,request,store.id)
  if(mobile?.id) account={type:'mobile',id:mobile.id}
  if(mode==='mobile'&&!account)return {fail:reply({success:false,code:'MOBILE_SESSION_REQUIRED',message:'Your Mobile/PIN session expired. Sign in again.'},401)}
 }
 if(!account&&mode!=='mobile'){
  const bearer=String(request.headers.get('authorization')||'').match(/^Bearer\s+(\S+)$/i)?.[1]||''
  if(bearer){
   const {data,error}=await admin.auth.getUser(bearer)
   if(!error&&data?.user?.id)account={type:'google',id:data.user.id}
  }
 }
 if(!account)return {fail:reply({success:false,message:'Sign in to request a return.'},401)}
 const {data:order,error:orderError}=await admin.from('delivery_orders')
 .select('id,restaurant_id,order_code,customer_mobile,order_status,payment_method,payment_status')
 .eq('restaurant_id',store.id).eq('order_code',orderCode)
 .eq(account.type==='google'?'customer_user_id':'customer_id',account.id).maybeSingle()
 if(orderError)throw orderError
 if(!order)return {fail:reply({success:false,message:'This order is not linked to your account.'},404)}
 if(order.order_status!=='delivered')return {fail:reply({success:false,message:'Return requests are available after delivery.'},409)}
 if(String(order.payment_method||'').toLowerCase()==='razorpay' && String(order.payment_status||'').toLowerCase()!=='paid')
  return {fail:reply({success:false,message:'Online-payment order has not been verified as paid.'},409)}
 const {data:policy,error:policyError}=await admin.from('delivery_settings')
  .select('customer_returns_enabled').eq('restaurant_id',store.id).maybeSingle()
 if(policyError)throw policyError
 if(policy?.customer_returns_enabled!==true)return {fail:reply({success:false,code:'CUSTOMER_RETURNS_DISABLED',message:'This store is not accepting new return requests. You can still track existing cases.'},403)}
 return {admin,store,order}
}
export async function GET(request){
 try{
  const q=new URL(request.url).searchParams
  const store=validCode(q.get('restaurantCode'),80), code=validCode(q.get('orderCode'),100)
  if(!store||!code)return reply({success:false,message:'Store and order code required.'},400)
  const context=await getContext(request,store,code,q.get('accountType'))
  if(context.fail)return context.fail
  const {data,error}=await context.admin.rpc('get_public_delivery_order',{
   p_restaurant_code:store,p_order_code:code,p_customer_mobile:digits(context.order.customer_mobile)
  })
  if(error)throw error
  if(data?.success!==true||!data.order)return reply({success:false,message:'Unable to verify this order.'},404)
  return reply({success:true,order:data.order})
 }catch(e){console.error('[RETURN CUSTOMER GET]',e?.code||e?.message);return reply({success:false,message:'Unable to load return eligibility.'},500)}
}
export async function POST(request){
 const body=await request.json().catch(()=>null)
 const store=validCode(body?.restaurantCode,80),code=validCode(body?.orderCode,100)
 const caseType=String(body?.caseType||'').trim().toLowerCase(),reason=String(body?.reason||'').trim()
 if(!store||!code||!['return','replacement','refund','return_refund'].includes(caseType) || reason.length<5 || reason.length>1000 || !Array.isArray(body?.items) || body.items.length>80)
  return reply({success:false,message:'Enter a valid return type and reason.'},400)
 const items=body.items.map(i=>({id:validCode(i?.id,100),quantity:Number(i?.quantity)}))
 if(items.some(i=>!i.id||!Number.isSafeInteger(i.quantity)||i.quantity<1||i.quantity>10000))
  return reply({success:false,message:'Invalid return item selection.'},400)
 if(caseType!=='refund' && !items.length)return reply({success:false,message:'Select affected products.'},400)
 try{
  const context=await getContext(request,store,code,body?.accountType)
  if(context.fail)return context.fail
  const {data,error}=await context.admin.rpc('create_public_delivery_after_sales_request',{
   p_restaurant_code:store,p_order_code:code,
   p_customer_mobile:digits(context.order.customer_mobile),
   p_case_type:caseType,p_items:items,p_reason:reason
  })
  if(error){
   if(String(error.message||'').includes('CUSTOMER_RETURNS_DISABLED'))return reply({success:false,code:'CUSTOMER_RETURNS_DISABLED',message:'This store has disabled new return requests.'},403)
   throw error
  }
  if(data?.success!==true)return reply({success:false,message:data?.message||'Return could not be submitted.'},409)
  return reply(data,201)
 }catch(e){console.error('[RETURN CUSTOMER POST]',e?.code||e?.message);return reply({success:false,message:'Unable to submit return. Please try again.'},500)}
}
