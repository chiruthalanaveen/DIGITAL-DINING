import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'

const schema = z.object({
  resortCode: z.string().regex(/^\d{5}$/), roomTypeId: z.string().uuid(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.coerce.number().int().min(1).max(20), children: z.coerce.number().int().min(0).max(20),
  guestName: z.string().trim().min(1).max(120), guestMobile: z.string().regex(/^\d{10}$/),
  guestEmail: z.string().trim().email().max(200).or(z.literal('')).default(''), guestAddress: z.string().trim().max(500).default(''), specialRequest: z.string().trim().max(2000).default(''),
})

function admin() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL; const key=process.env.SUPABASE_SERVICE_ROLE_KEY
  if(!url||!key) throw new Error('Server database configuration is missing.')
  return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}})
}

export async function POST(request){
  try{
    const input=schema.parse(await request.json())
    const today=new Date().toISOString().slice(0,10)
    if(input.checkIn<today||input.checkOut<=input.checkIn) return NextResponse.json({success:false,message:'Invalid stay dates.'},{status:400})
    const supabase=admin()
    const {data,error}=await supabase.rpc('create_public_room_booking',{p_resort_code:input.resortCode,p_room_id:input.roomTypeId,p_check_in:input.checkIn,p_check_out:input.checkOut,p_adults:input.adults,p_children:input.children,p_guest_name:input.guestName,p_guest_mobile:input.guestMobile,p_guest_email:input.guestEmail,p_guest_address:input.guestAddress,p_special_request:input.specialRequest,p_payment_mode:'pay_at_property'})
    if(error) throw error
    if(!data?.success) return NextResponse.json({success:false,message:data?.message||'Room is not available.'},{status:409})
    return NextResponse.json({success:true,booking:data.booking})
  }catch(error){
    console.error('[RESORT CREATE BOOKING]',error)
    if(error?.name==='ZodError') return NextResponse.json({success:false,message:'Please enter valid booking details.'},{status:400})
    return NextResponse.json({success:false,message:error?.message||'Unable to create booking.'},{status:500})
  }
}
