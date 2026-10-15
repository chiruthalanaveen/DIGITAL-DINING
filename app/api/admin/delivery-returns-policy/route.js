import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const reply = (data,status=200) => NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}})
export async function GET(request) {
 const session=requireAdmin(request)
 if (!session) return reply({success:false,message:'Admin login required.'},401)
 try {
  const admin=getAdminSupabase()
  const [{data:stores,error:e1},{data:settings,error:e2}]=await Promise.all([
   admin.from('restaurants').select('id,name,restaurant_code').order('name').limit(2000),
   admin.from('delivery_settings').select('restaurant_id,customer_returns_enabled').limit(2000)
  ])
  if(e1||e2) throw e1||e2
  const lookup=new Map((settings||[]).map(s=>[s.restaurant_id,s.customer_returns_enabled===true]))
  return reply({success:true,stores:(stores||[]).filter(s=>lookup.has(s.id)).map(s=>({...s,returnsEnabled:lookup.get(s.id)}))})
 }catch(e){console.error('[RETURNS POLICY ADMIN GET]',e?.code||e?.message);return reply({success:false,message:'Unable to load store returns settings.'},500)}
}
export async function POST(request) {
 const session=requireAdmin(request)
 if (!session) return reply({success:false,message:'Admin login required.'},401)
 const body=await request.json().catch(()=>null)
 const restaurantId=String(body?.restaurantId||'')
 if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(restaurantId) || typeof body?.enabled!=='boolean')
  return reply({success:false,message:'Choose a valid store and returns setting.'},400)
 try {
  const {data,error}=await getAdminSupabase().rpc('delivery_customer_returns_write_internal',{
   p_restaurant_id:restaurantId,p_enabled:body.enabled,p_actor_role:'admin',p_actor_label:String(session.email||'Super Admin').slice(0,160)
  })
  if(error) throw error
  if(data?.success!==true) return reply(data||{success:false,message:'Unable to save.'},409)
  return reply({...data,message:'Store customer returns setting saved.'})
 }catch(e){console.error('[RETURNS POLICY ADMIN POST]',e?.code||e?.message);return reply({success:false,message:'Unable to save returns setting.'},500)}
}
