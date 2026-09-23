import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import Razorpay from 'razorpay'
import { z } from 'zod'

const schema = z.object({
  bookingId: z.string().uuid(),
  razorpayOrderId: z.string().min(5).max(120),
  razorpayPaymentId: z.string().min(5).max(120),
  razorpaySignature: z.string().min(10).max(200),
})

function admin() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL; const key=process.env.SUPABASE_SERVICE_ROLE_KEY
  if(!url||!key) throw new Error('Server database configuration is missing.')
  return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}})
}

function safeEqualHex(a,b){
  try{
    const aa=Buffer.from(a,'hex'); const bb=Buffer.from(b,'hex')
    return aa.length===bb.length && crypto.timingSafeEqual(aa,bb)
  }catch{return false}
}

export async function POST(request){
  try{
    const input=schema.parse(await request.json())
    const supabase=admin()
    const {data:booking,error:bookingError}=await supabase.from('room_bookings').select('id,restaurant_id,razorpay_order_id,total_amount,booking_number,booking_status').eq('id',input.bookingId).maybeSingle()
    if(bookingError) throw bookingError
    if(!booking) return NextResponse.json({success:false,message:'Booking not found.'},{status:404})
    if(!booking.razorpay_order_id || booking.razorpay_order_id!==input.razorpayOrderId) return NextResponse.json({success:false,message:'Payment order mismatch.'},{status:400})
    const {data:restaurant,error:restaurantError}=await supabase.from('restaurants').select('razorpay_secret,razorpay_key_id').eq('id',booking.restaurant_id).maybeSingle()
    if(restaurantError||!restaurant?.razorpay_secret) throw new Error('Payment verification configuration is missing.')

    const expected=crypto.createHmac('sha256',restaurant.razorpay_secret).update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`).digest('hex')
    if(!safeEqualHex(expected,input.razorpaySignature)) return NextResponse.json({success:false,message:'Payment verification failed.'},{status:400})

    // Ask Razorpay for the payment to confirm that the payment reference belongs to the order.
    const razorpay=new Razorpay({key_id:restaurant.razorpay_key_id,key_secret:restaurant.razorpay_secret})
    const payment=await razorpay.payments.fetch(input.razorpayPaymentId)
    if(!payment || payment.order_id!==input.razorpayOrderId || payment.status!=='captured') return NextResponse.json({success:false,message:'Payment has not been captured.'},{status:400})
    if(Math.round(Number(payment.amount||0))!==Math.round(Number(booking.total_amount||0)*100)) return NextResponse.json({success:false,message:'Payment amount mismatch.'},{status:400})

    const {data:confirmed,error:confirmError}=await supabase.rpc('confirm_room_booking_payment',{p_booking_id:input.bookingId,p_razorpay_order_id:input.razorpayOrderId,p_razorpay_payment_id:input.razorpayPaymentId,p_razorpay_signature:input.razorpaySignature})
    if(confirmError) throw confirmError
    if(!confirmed?.success) return NextResponse.json({success:false,message:confirmed?.message||'Booking could not be confirmed.'},{status:409})

    const {data:publicData}=await supabase.rpc('get_public_room_booking',{p_resort_code:(await supabase.from('restaurants').select('restaurant_code').eq('id',booking.restaurant_id).maybeSingle()).data?.restaurant_code,p_booking_number:booking.booking_number})
    return NextResponse.json({success:true,booking:publicData?.booking||confirmed})
  }catch(error){
    console.error('[RESORT VERIFY PAYMENT]',error)
    if(error?.name==='ZodError') return NextResponse.json({success:false,message:'Invalid payment verification data.'},{status:400})
    return NextResponse.json({success:false,message:'Unable to verify payment.'},{status:500})
  }
}
