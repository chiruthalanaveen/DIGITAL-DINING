// Destination: app/api/admin/delivery-seasonal-ads/upload/route.js
import 'server-only'
import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const LIMIT = 3 * 1024 * 1024
const bucket = 'delivery-seasonal-ads'
const reply = (body, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'private, no-store' },
})
function inspectImage(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return ['image/jpeg', 'jpg']
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return ['image/png', 'png']
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString() === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString() === 'WEBP') return ['image/webp', 'webp']
  return null
}
export async function POST(request) {
  const session = requireAdmin(request)
  if (!session) return reply({ success: false, message: 'Super Admin login required.' }, 401)
  try {
    const form = await request.formData()
    const restaurantId = String(form.get('restaurantId') || '')
    const file = form.get('file')
    if (!UUID.test(restaurantId) || !file || typeof file.arrayBuffer !== 'function') {
      return reply({ success: false, message: 'Choose a store and a valid image file.' }, 400)
    }
    if (file.size <= 0 || file.size > LIMIT) return reply({ success: false, message: 'Image must be under 3 MB.' }, 400)
    const admin = getAdminSupabase()
    const { data: store, error: storeError } = await admin.from('restaurants')
      .select('id,plan_code').eq('id', restaurantId).maybeSingle()
    if (storeError) throw storeError
    if (!store || !['delivery', 'restaurant_delivery', 'restaurant_resort_delivery'].includes(store.plan_code)) {
      return reply({ success: false, message: 'Invalid Delivery store.' }, 400)
    }
    const bytes = Buffer.from(await file.arrayBuffer())
    const type = inspectImage(bytes)
    if (!type || file.type !== type[0]) return reply({ success: false, message: 'Only valid JPEG, PNG or WebP images are supported.' }, 415)
    const key = `${restaurantId}/${randomUUID()}.${type[1]}`
    const { error } = await admin.storage.from(bucket).upload(key, bytes, {
      contentType: type[0], cacheControl: '3600', upsert: false,
    })
    if (error) throw error
    const { data } = admin.storage.from(bucket).getPublicUrl(key)
    if (!data?.publicUrl?.startsWith('https://')) throw new Error('Public image URL unavailable')
    return reply({ success: true, imageUrl: data.publicUrl })
  } catch (error) {
    console.error('[SEASONAL ADS UPLOAD]', error.code || error.message)
    return reply({ success: false, message: 'Unable to upload the banner. Check the Storage bucket and permissions.' }, 503)
  }
}