// Destination: app/api/ecommerce/owner/product-images/route.js
import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const BUCKET = 'ecommerce-product-images'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const reply = (data, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
const fail = (message, status = 400) => reply({ success: false, message }, status)

async function access(request, storeId, productId, editing = false) {
  if (!UUID.test(storeId || '') || !UUID.test(productId || '')) return { response: fail('Invalid store or product ID.') }
  const bearer = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') || '')
  if (!bearer) return { response: fail('Owner login required.', 401) }
  const admin = getAdminSupabase()
  const { data: auth, error: authError } = await admin.auth.getUser(bearer[1])
  if (authError || !auth?.user?.id) return { response: fail('Session expired.', 401) }
  const { data: member, error: memberError } = await admin.from('ecommerce_store_members').select('store_id').eq('store_id', storeId).eq('user_id', auth.user.id).eq('role', 'owner').maybeSingle()
  if (memberError) throw memberError
  if (!member) return { response: fail('You do not own this store.', 403) }
  const { data: store, error: storeError } = await admin.from('ecommerce_stores').select('id,approval_status,is_active').eq('id', storeId).maybeSingle()
  if (storeError) throw storeError
  if (!store) return { response: fail('Store not found.', 404) }
  if (editing && (store.approval_status !== 'approved' || !store.is_active)) return { response: fail('Store must be approved and active.', 403) }
  const { data: product, error: productError } = await admin.from('ecommerce_products').select('id,name').eq('store_id', storeId).eq('id', productId).maybeSingle()
  if (productError) throw productError
  if (!product) return { response: fail('Product not found in your store.', 404) }
  return { admin, product }
}

export async function GET(request) {
  try {
    const u = new URL(request.url)
    const storeId = u.searchParams.get('storeId'), productId = u.searchParams.get('productId')
    const a = await access(request, storeId, productId)
    if (a.response) return a.response
    const { data, error } = await a.admin.from('ecommerce_product_images').select('id,storage_path,alt_text,sort_order,created_at').eq('store_id', storeId).eq('product_id', productId).order('sort_order').order('created_at').limit(30)
    if (error) throw error
    const items = await Promise.all((data || []).map(async x => {
      const { data: signed, error: signError } = await a.admin.storage.from(BUCKET).createSignedUrl(x.storage_path, 3600)
      if (signError) throw signError
      return { id: x.id, alt: x.alt_text, sortOrder: x.sort_order, url: signed.signedUrl }
    }))
    return reply({ success: true, images: items })
  } catch (e) { console.error('[PRODUCT IMAGES GET]', e); return fail('Unable to load product images.', 500) }
}

export async function POST(request) {
  let uploadedPath = null, adminForCleanup = null
  try {
    if (Number(request.headers.get('content-length') || 0) > 6 * 1024 * 1024) return fail('Upload too large.', 413)
    const form = await request.formData()
    const storeId = String(form.get('storeId') || ''), productId = String(form.get('productId') || '')
    const a = await access(request, storeId, productId, true)
    if (a.response) return a.response
    const { count, error: countError } = await a.admin.from('ecommerce_product_images').select('id', { count: 'exact', head: true }).eq('store_id', storeId).eq('product_id', productId)
    if (countError) throw countError
    if (count >= 10) return fail('Maximum 10 photos per product.', 409)
    const file = form.get('image'), alt = String(form.get('alt') || a.product.name).trim().slice(0, 200)
    if (!(file instanceof File) || file.size < 100 || file.size > 5 * 1024 * 1024) return fail('Select an image up to 5 MB.')
    const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
    const ext = extensions[file.type]
    if (!ext) return fail('Only JPEG, PNG and WebP are allowed.')
    const bytes = new Uint8Array(await file.arrayBuffer())
    const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
    const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
    if (!(file.type === 'image/jpeg' && jpg || file.type === 'image/png' && png || file.type === 'image/webp' && webp)) return fail('Image content does not match its file type.')
    uploadedPath = `${storeId}/${productId}/${crypto.randomUUID()}.${ext}`
    adminForCleanup = a.admin
    const { error: uploadError } = await a.admin.storage.from(BUCKET).upload(uploadedPath, bytes, { contentType: file.type, upsert: false })
    if (uploadError) throw uploadError
    const { data, error } = await a.admin.from('ecommerce_product_images').insert({ store_id: storeId, product_id: productId, storage_path: uploadedPath, alt_text: alt, sort_order: count }).select('id').single()
    if (error) throw error
    uploadedPath = null
    return reply({ success: true, id: data.id }, 201)
  } catch (e) { console.error('[PRODUCT IMAGES POST]', e); return fail('Unable to upload product image.', 500) }
  finally { if (uploadedPath && adminForCleanup) await adminForCleanup.storage.from(BUCKET).remove([uploadedPath]) }
}

export async function DELETE(request) {
  try {
    const body = await request.json().catch(() => null)
    const a = await access(request, body?.storeId, body?.productId, true)
    if (a.response) return a.response
    if (!UUID.test(body?.imageId || '')) return fail('Invalid image ID.')
    const { data: item, error: readError } = await a.admin.from('ecommerce_product_images').select('id,storage_path').eq('store_id', body.storeId).eq('product_id', body.productId).eq('id', body.imageId).maybeSingle()
    if (readError) throw readError
    if (!item) return fail('Image not found.', 404)
    const { error: storageError } = await a.admin.storage.from(BUCKET).remove([item.storage_path])
    if (storageError) throw storageError
    const { error: deleteError } = await a.admin.from('ecommerce_product_images').delete().eq('store_id', body.storeId).eq('product_id', body.productId).eq('id', item.id)
    if (deleteError) throw deleteError
    return reply({ success: true })
  } catch (e) { console.error('[PRODUCT IMAGES DELETE]', e); return fail('Unable to delete product image.', 500) }
}