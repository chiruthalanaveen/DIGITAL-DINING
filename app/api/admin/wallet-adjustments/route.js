import { NextResponse } from 'next/server'
import { randomUUID, createHash } from 'node:crypto'
import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUCKET = 'wallet-adjustment-proofs'
const MAX_BYTES = 5 * 1024 * 1024
const UUID_RE = /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i

function reply(payload, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}

function actorFromSession(session) {
  // The verified session, NEVER the browser request body, supplies identity.
  const actorEmail = String(session?.email || '').trim().toLowerCase()
  if (!actorEmail || actorEmail.length > 254) return null
  const userId = session?.adminId ?? session?.userId ?? null
  return { email: actorEmail, userId: userId ? String(userId).slice(0, 120) : '' }
}

function parseRupees(value) {
  const str = String(value ?? '').trim()
  if (!/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(str)) return null
  const [whole, decimal = ''] = str.split('.')
  const amount = Number(whole) * 100 + Number(decimal.padEnd(2, '0'))
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 10000000 ? amount : null
}

function detectProof(bytes) {
  if (bytes.length < 8) return null
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
    return { mime: 'application/pdf', ext: 'pdf' }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' }
  }
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    return { mime: 'image/png', ext: 'png' }
  }
  return null
}

function checkOrigin(request) {
  const origin = request.headers.get('origin')
  if (!origin) return false // Admin changes must originate from the app UI.
  try { return new URL(origin).origin === new URL(request.url).origin }
  catch { return false }
}

export async function GET(request) {
  const adminSession = requireAdmin(request)
  if (!adminSession) return reply({ success: false, message: 'Super Admin login required.' }, 401)
  const actor = actorFromSession(adminSession)
  if (!actor) return reply({ success: false, message: 'Your admin session has no verified email identity.' }, 403)

  try {
    const url = new URL(request.url)
    const restaurantId = String(url.searchParams.get('restaurantId') || '')
    if (!UUID_RE.test(restaurantId)) return reply({ success: false, message: 'Invalid restaurant ID.' }, 400)
    const admin = getAdminSupabase()
    const proofId = String(url.searchParams.get('proofId') || '')
    if (proofId) {
      if (!UUID_RE.test(proofId)) return reply({ success: false, message: 'Invalid proof request.' }, 400)
      const { data: adjustment, error } = await admin
        .from('delivery_wallet_admin_adjustments')
        .select('id,proof_path')
        .eq('restaurant_id', restaurantId).eq('id', proofId).maybeSingle()
      if (error) throw error
      if (!adjustment) return reply({ success: false, message: 'Proof not found.' }, 404)
      const { data: signed, error: signError } = await admin.storage.from(BUCKET)
        .createSignedUrl(adjustment.proof_path, 120)
      if (signError || !signed?.signedUrl) throw signError || new Error('Unable to open proof.')
      return reply({ success: true, url: signed.signedUrl })
    }

    const [wallet, history] = await Promise.all([
      admin.from('delivery_store_wallets')
        .select('balance_paise,pending_fee_paise,order_block_threshold_paise')
        .eq('restaurant_id', restaurantId).maybeSingle(),
      admin.from('delivery_wallet_admin_adjustments')
        .select('id,adjustment_kind,amount_paise,balance_before_paise,balance_after_paise,actor_email,actor_user_id,reason,reference_note,proof_mime,created_at')
        .eq('restaurant_id', restaurantId).order('created_at', { ascending: false }).limit(50),
    ])
    if (wallet.error) throw wallet.error
    if (history.error) throw history.error
    return reply({ success: true, actorEmail: actor.email,
      wallet: wallet.data || null, adjustments: history.data || [] })
  } catch (error) {
    console.error('[ADMIN WALLET ADJUSTMENTS GET]', error)
    return reply({ success: false, message: 'Unable to read wallet adjustment history.' }, 500)
  }
}

export async function POST(request) {
  const adminSession = requireAdmin(request)
  if (!adminSession) return reply({ success: false, message: 'Super Admin login required.' }, 401)
  const actor = actorFromSession(adminSession)
  if (!actor) return reply({ success: false, message: 'Verified admin identity is missing.' }, 403)
  if (!checkOrigin(request)) return reply({ success: false, message: 'Invalid request origin.' }, 403)
  if (Number(request.headers.get('content-length') || 0) > MAX_BYTES + 700000) {
    return reply({ success: false, message: 'Proof file is too large.' }, 413)
  }

  let uploadedPath = null
  let admin = null
  let rpcStarted = false
  let requestId = null
  try {
    const form = await request.formData()
    const restaurantId = String(form.get('restaurantId') || '').trim()
    const kind = String(form.get('kind') || '').trim()
    const reason = String(form.get('reason') || '').trim()
    const referenceNote = String(form.get('referenceNote') || '').trim()
    const amountPaise = parseRupees(form.get('amountRupees'))
    const file = form.get('proof')
    if (!UUID_RE.test(restaurantId) || !['credit','debit'].includes(kind) ||
        amountPaise === null || reason.length < 12 || reason.length > 1000 ||
        referenceNote.length > 120) {
      return reply({ success: false, message: 'Provide store, credit/debit, valid amount, and a reason of at least 12 characters.' }, 400)
    }
    if (!file || typeof file.arrayBuffer !== 'function' ||
        !Number.isFinite(file.size) || file.size < 8 || file.size > MAX_BYTES) {
      return reply({ success: false, message: 'Upload proof as PDF/JPEG/PNG (maximum 5 MB).' }, 400)
    }
    const bytes = Buffer.from(await file.arrayBuffer())
    const detected = detectProof(bytes)
    if (!detected || (file.type && file.type !== 'application/octet-stream' && file.type !== detected.mime)) {
      return reply({ success: false, message: 'Proof content must be a valid PDF, JPEG or PNG file.' }, 400)
    }
    const proofHash = createHash('sha256').update(bytes).digest('hex')
    requestId = randomUUID()
    const path = `${restaurantId}/${requestId}.${detected.ext}`
    admin = getAdminSupabase()

    const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: detected.mime, upsert: false, cacheControl: 'private, max-age=0',
    })
    if (uploadError) throw uploadError
    uploadedPath = path

    rpcStarted = true
    const { data: result, error: rpcError } = await admin.rpc('digital_dine_admin_adjust_wallet', {
      p_request_id: requestId,
      p_restaurant_id: restaurantId,
      p_kind: kind,
      p_amount_paise: amountPaise,
      p_reason: reason,
      p_reference_note: referenceNote,
      p_actor_email: actor.email,
      p_actor_user_id: actor.userId,
      p_proof_path: path,
      p_proof_mime: detected.mime,
      p_proof_size_bytes: bytes.length,
      p_proof_sha256: proofHash,
    })
    if (rpcError) throw rpcError
    if (result?.success !== true) throw new Error('Wallet adjustment was not confirmed by the database.')
    uploadedPath = null // Evidence must remain permanently associated with the ledger.
    return reply({ success: true, result,
      message: 'Wallet updated. Admin, proof, and before/after balances were recorded.' })
  } catch (error) {
    console.error('[ADMIN WALLET ADJUSTMENTS POST]', error)
    // A network timeout does NOT prove an RPC failed. A successful DB commit
    // must retain its proof, so never delete uploaded evidence after RPC began.
    // Only an upload-only failure (before RPC) may clean up its orphan file.
    if (uploadedPath && admin && !rpcStarted) {
      const { error: cleanupError } = await admin.storage.from(BUCKET).remove([uploadedPath])
      if (cleanupError) console.error('[ADMIN WALLET PROOF CLEANUP]', cleanupError)
    }
    // If a response was lost after SQL commit, check the durable audit by ID.
    // Do not blindly retry a balance adjustment as a new transaction.
    if (rpcStarted && admin && requestId) {
      try {
        const { data: existing, error: readError } = await admin
          .from('delivery_wallet_admin_adjustments')
          .select('id,balance_before_paise,balance_after_paise')
          .eq('request_id', requestId).maybeSingle()
        if (!readError && existing?.id) {
          return reply({ success: true, alreadyApplied: true,
            result: { success: true, adjustmentId: existing.id,
              balanceBeforePaise: existing.balance_before_paise,
              balanceAfterPaise: existing.balance_after_paise },
            message: 'Wallet adjustment confirmed in the audit history.' })
        }
      } catch (auditReadError) {
        console.error('[ADMIN WALLET POST-ERROR AUDIT CHECK]', auditReadError)
      }
    }
    const msg = String(error?.message || '')
    const publicMessage = /Insufficient wallet balance|reserved for pending platform fees|Restaurant wallet was not found/.test(msg)
      ? msg
      : rpcStarted
        ? 'Could not confirm the adjustment. Check adjustment history before submitting again; the transaction may have succeeded.'
        : 'Wallet adjustment could not be completed. No balance change was confirmed.'
    return reply({ success: false, message: publicMessage }, rpcStarted ? 503 : 400)
  }
}
