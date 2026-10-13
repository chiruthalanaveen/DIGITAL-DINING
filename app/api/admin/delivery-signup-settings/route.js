import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'
import { getSignupPolicy, respond } from '@/lib/server/deliveryCustomerSignupSecurity'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function GET(request) {
  const session=requireAdmin(request)
  if (!session) return respond({success:false,message:'Admin sign-in required.'},401)
  try {
    const admin=getAdminSupabase()
    const policy=await getSignupPolicy(admin)
    const {data:history,error}=await admin.from('delivery_customer_signup_policy_audit')
      .select('id,previous_mode,new_mode,changed_by_admin,changed_at')
      .order('changed_at',{ascending:false}).limit(20)
    if(error) throw error
    return respond({success:true,signupMode:policy.signup_mode,updatedAt:policy.updated_at,
      loggedInAdmin:session.email, history:history||[]})
  } catch(error) {
    console.error('[ADMIN SIGNUP SETTINGS GET]',error?.message)
    return respond({success:false,message:'Could not load signup policy.'},500)
  }
}
export async function POST(request) {
  const session=requireAdmin(request)
  if (!session) return respond({success:false,message:'Admin sign-in required.'},401)
  let body
  try {body=await request.json()}catch{return respond({success:false,message:'Invalid input.'},400)}
  if(!['otp','pin_question'].includes(body?.signupMode)) return respond({success:false,message:'Choose OTP or PIN + security question.'},400)
  try {
    const {data,error}=await getAdminSupabase().rpc('admin_set_delivery_signup_mode',{
      p_mode:body.signupMode,p_admin_email:session.email
    })
    if(error || data?.success!==true) throw error||new Error('Could not save mode')
    return respond({success:true,signupMode:data.signupMode,message:'Signup method updated.'})
  } catch(error){
    console.error('[ADMIN SIGNUP SETTINGS POST]',error?.message)
    return respond({success:false,message:'Unable to update signup method.'},500)
  }
}
