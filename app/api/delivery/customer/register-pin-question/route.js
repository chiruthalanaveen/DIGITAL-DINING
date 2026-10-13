import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/server/adminSupabase'
import { getSignupPolicy, enforceSignupThrottle, validStoreCode, cleanMobile, validMobile, validPin, safeText, QUESTION_KEYS, CUSTOMER_COOKIE, CUSTOMER_COOKIE_MAX_AGE, respond } from '@/lib/server/deliveryCustomerSignupSecurity'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function POST(request){
 try{
  const body=await request.json().catch(()=>null)
  const restaurantCode=String(body?.restaurantCode||'').trim()
  const mobile=cleanMobile(body?.mobile)
  const pin=String(body?.pin||'')
  const name=safeText(body?.name,100)
  const securityQuestionKey=String(body?.securityQuestionKey||'')
  const securityAnswer=String(body?.securityAnswer||'').trim()
  if(!validStoreCode(restaurantCode)||!validMobile(mobile)||!validPin(pin)||name.length<2||
    !QUESTION_KEYS.includes(securityQuestionKey)||securityAnswer.length<8||new TextEncoder().encode(securityAnswer).length>72){
   return respond({success:false,message:'Enter a valid name, mobile, PIN, security question and 8+ character private answer (72 bytes maximum).'},400)
  }
  const admin=getAdminSupabase()
  const policy=await getSignupPolicy(admin)
  if(policy.signup_mode!=='pin_question') return respond({success:false,code:'MODE_CHANGED',message:'Admin requires mobile OTP. Reload signup.'},409)
  if(!(await enforceSignupThrottle(request,'register',restaurantCode,mobile,5))) return respond({success:false,message:'Too many attempts. Please wait 30 minutes.'},429)
  const {data,error}=await admin.rpc('delivery_customer_register_with_question',{
   p_restaurant_code:restaurantCode,p_name:name,p_mobile:mobile,p_pin:pin,
   p_device_label:'Delivery PIN + question signup (mobile unverified)',
   p_question_key:securityQuestionKey,p_answer:securityAnswer,
  })
  if (error) {
   // Avoid logging customer PIN, security answer, or request body.
   console.error('[PIN QUESTION SIGNUP][DATABASE]', {
     code: error.code, message: error.message, hint: error.hint,
   })
   const missingFunction = ['PGRST202', '42883'].includes(String(error.code || ''))
   const permissions = String(error.code || '') === '42501'
   const missingTable = String(error.code || '') === '42P01'
   return respond({
     success: false,
     code: missingFunction ? 'REGISTRATION_RPC_MISSING' :
       permissions ? 'REGISTRATION_PERMISSION_DENIED' :
       missingTable ? 'REGISTRATION_DATABASE_NOT_READY' : 'REGISTRATION_DATABASE_ERROR',
     message: missingFunction
       ? 'PIN registration function is missing. Ask your administrator to install the signup database migration.'
       : permissions
         ? 'PIN registration permission is not configured. Please contact the administrator.'
         : missingTable
           ? 'PIN registration database tables are not installed. Please contact the administrator.'
           : 'PIN registration failed on the server. Please contact the administrator with the error code.',
   }, 503)
  }
  if(data?.success!==true) return respond({success:false,code:data?.code||'REGISTRATION_FAILED',message:data?.message||'Unable to register.'},data?.code==='ACCOUNT_EXISTS'?409:400)
  const token=String(data.session_token||'');const recoveryCode=String(data.recovery_code||'')
  if(!/^[a-f0-9]{64}$/i.test(token)||!/^DD-[A-Za-z0-9]{12}$/.test(recoveryCode)){
   return respond({success:false,message:'Account created but session could not be established. Contact support; do not retry registration.'},500)
  }
  const response=NextResponse.json({success:true,recoveryCode,
    message:'Your PIN account was created. Your phone number has not been verified.'},
    {headers:{'Cache-Control':'private, no-store'}})
  response.cookies.set(CUSTOMER_COOKIE,token,{
   httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:CUSTOMER_COOKIE_MAX_AGE,
  })
  return response
 } catch (error) {
  // Log configuration and database failures only on the server.
  console.error('[PIN QUESTION SIGNUP][SERVER]', error?.message)
  const missingPepper = String(error?.message || '').includes('DELIVERY_AUTH_THROTTLE_PEPPER')
  return respond({
    success: false,
    code: missingPepper ? 'REGISTRATION_THROTTLE_UNCONFIGURED' : 'REGISTRATION_SERVER_ERROR',
    message: missingPepper
      ? 'The registration security configuration is incomplete. Ask the administrator to configure the signup rate limiter.'
      : 'Registration service is temporarily unavailable. Please contact the administrator.',
  }, 503)
 }
}
