import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/server/adminSupabase'
import { requireApprovedOwner } from '@/lib/server/ownerApproval'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const json = (data, status = 200) => NextResponse.json(data, {
  status,
  headers: { 'Cache-Control': 'private, no-store, max-age=0' },
})

function publicSupportFailure(error, context) {
  const code = String(error?.code || '').toUpperCase()
  const details = String(error?.message || '')
  // Log diagnostic details on the server only. Don't expose SQL, key details
  // or stack traces to the browser.
  console.error(context, { code, message: details })
  if (code === '42P01' || code === 'PGRST205' || /relation .* does not exist/i.test(details)) {
    return { code: 'SUPPORT_TABLES_MISSING', message: 'The Live Support database tables have not been installed in this Supabase project.' }
  }
  if (code === '42501' || /permission denied/i.test(details)) {
    return { code: 'SUPPORT_DB_PERMISSION', message: 'The support database role cannot read chat history. Verify the server service-role key and database grants.' }
  }
  if (code === '42703' || code === 'PGRST204' || /schema cache/i.test(details)) {
    return { code: 'SUPPORT_SCHEMA_OUTDATED', message: 'Live Support database columns or schema cache are out of date. Apply the support migration and reload the Supabase schema.' }
  }
  if (/Supabase Admin server configuration is incomplete|supabaseUrl is required|Invalid API key/i.test(details)) {
    return { code: 'SUPPORT_SERVER_CONFIG', message: 'Live Support server configuration needs attention. Check the server-only Supabase credentials.' }
  }
  if (/fetch failed|network|ECONN|ENOTFOUND|timeout/i.test(details)) {
    return { code: 'SUPPORT_CONNECTION', message: 'Unable to reach Supabase. Check the server connection and try again.' }
  }
  return { code: 'SUPPORT_READ_FAILED', message: 'Unable to load support history. Check the Next.js server log for the specific database error.' }
}

function publicMessage(row) {
  // Allow old messages without sender_name but don't expose other message fields.
  return {
    id: row?.id || '',
    restaurant_id: row?.restaurant_id || '',
    support_session_id: row?.support_session_id || '',
    sender: row?.sender || '',
    sender_name: row?.sender_name || null,
    message: row?.message || '',
    created_at: row?.created_at || null,
  }
}

function missingSenderNameColumn(error) {
  const code = String(error?.code || '').toUpperCase()
  const message = String(error?.message || '')
  return (code === '42703' || code === 'PGRST204' || code === 'PGRST116' || code === 'PGRST202')
    && /sender_name/i.test(message)
}

function badRequest(message, status = 400) {
  return json({ success: false, message }, status)
}

async function authorizedOwner(request, restaurantId) {
  const access = await requireApprovedOwner(request, restaurantId)
  if (!access.ok) return { response: badRequest(access.message, access.status) }
  return { admin: getAdminSupabase(), restaurantId: access.restaurantId, ownerUserId: access.userId }
}


// The server obtains the sender's name from the authenticated Supabase Auth
// account. The browser can never nominate a sender or sender_name.
function verifiedOwnerDisplayName(user) {
  const metadata = user?.user_metadata || {}
  const name = [metadata.full_name, metadata.name, metadata.display_name]
    .map(value => String(value || '').trim()).find(Boolean)
  if (name) return name.slice(0, 120)
  return String(user?.email || '').trim().slice(0, 120) || 'Restaurant owner'
}

async function getOwnerDisplayName(admin, ownerUserId) {
  // This only runs after requireApprovedOwner authorizes this restaurant.
  const { data, error } = await admin.auth.admin.getUserById(ownerUserId)
  if (error) {
    console.warn('[OWNER SUPPORT SENDER LOOKUP]', error.code || error.message)
    return 'Restaurant owner'
  }
  return verifiedOwnerDisplayName(data?.user)
}

async function readSessions(admin, restaurantId) {
  const { data, error } = await admin
    .from('support_chat_sessions')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('requested_at', { ascending: false })
    .limit(200)

  if (error) throw error
  return data || []
}

async function readConversation(admin, sessionId) {
  // Fetch the latest 500 messages in chronological display order; do not use
  // local browser storage as the message source of truth.
  const { data, error } = await admin
    .from('messages')
    .select('*')
    .eq('support_session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) throw error
  return (data || []).reverse().map(publicMessage)
}

export async function GET(request) {
  const params = new URL(request.url).searchParams
  const restaurantId = String(params.get('restaurantId') || '').trim()
  const selectedId = String(params.get('sessionId') || '').trim()

  try {
    const { admin, response, ownerUserId } = await authorizedOwner(request, restaurantId)
    if (response) return response
    if (selectedId && !UUID_RE.test(selectedId)) return badRequest('Invalid support session ID.')

    const sessions = await readSessions(admin, restaurantId)
    const selected = selectedId
      ? sessions.find((session) => String(session.id) === selectedId)
      : sessions.find((session) => ['pending', 'connected'].includes(session.status)) || sessions[0]

    if (selectedId && !selected) return badRequest('Support session not found in this account.', 404)
    const messages = selected ? await readConversation(admin, selected.id) : []

    return json({
      success: true,
      sessions,
      selectedSession: selected || null,
      messages,
      messageLimit: 500,
      historyAvailable: true,
    })
  } catch (error) {
    const failure = publicSupportFailure(error, '[OWNER SUPPORT GET]')
    return json({ success: false, message: failure.message, code: failure.code }, 503)
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const restaurantId = String(body?.restaurantId || '').trim()
    const action = String(body?.action || '').trim()
    const { admin, response, ownerUserId } = await authorizedOwner(request, restaurantId)
    if (response) return response

    if (action === 'start') {
      let sessions = await readSessions(admin, restaurantId)
      let session = sessions.find((item) => ['pending', 'connected'].includes(item.status))

      if (!session) {
        const { data, error } = await admin.from('support_chat_sessions')
          .insert({ restaurant_id: restaurantId, status: 'pending' })
          .select('*').single()
        if (error?.code === '23505') {
          sessions = await readSessions(admin, restaurantId)
          session = sessions.find((item) => ['pending', 'connected'].includes(item.status))
        } else if (error) {
          throw error
        } else {
          session = data
        }
      }

      if (!session?.id) throw new Error('Could not create a support conversation.')

      // Optional AI context, if the support schema includes these columns.
      // This is noncritical and cannot interfere with saved human messages.
      const aiSummary = String(body?.aiSummary || '').trim().slice(0, 4000)
      if (aiSummary) {
        const update = {
          issue_category: String(body?.issueCategory || 'AI support').slice(0, 120),
          ai_summary: aiSummary,
          ai_transcript: Array.isArray(body.aiTranscript) ? body.aiTranscript.slice(-30) : [],
        }
        const result = await admin.from('support_chat_sessions')
          .update(update).eq('id', session.id).eq('restaurant_id', restaurantId)
          .select('*').maybeSingle()
        if (!result.error && result.data) session = result.data
      }
      return json({ success: true, session })
    }

    if (action === 'send') {
      const sessionId = String(body?.sessionId || '').trim()
      const message = String(body?.message || '').trim()
      if (!UUID_RE.test(sessionId)) return badRequest('Invalid support session ID.')
      if (!message || message.length > 2000) {
        return badRequest('Enter a message of 1–2000 characters.')
      }

      const { data: session, error: sessionError } = await admin
        .from('support_chat_sessions')
        .select('id,restaurant_id,status')
        .eq('id', sessionId)
        .eq('restaurant_id', restaurantId)
        .maybeSingle()
      if (sessionError) throw sessionError
      if (!session) return badRequest('Support session not found in this account.', 404)
      if (session.status !== 'connected') {
        return badRequest('The Admin must accept your live support request before you can send messages.', 409)
      }

      const senderName = await getOwnerDisplayName(admin, ownerUserId)
      const newMessage = {
        restaurant_id: restaurantId,
        support_session_id: sessionId,
        sender: 'restaurant', // Never accept a sender role supplied by the client.
        sender_name: senderName, // Verified owner identity, not a browser field.
        message,
      }
      let result = await admin.from('messages')
        .insert(newMessage).select('*').single()
      // A database that has not installed the optional display-name column
      // should not block the owner's actual message. Never retry unrelated
      // errors or a request that may have succeeded.
      let senderNameNeedsMigration = false
      if (result.error && missingSenderNameColumn(result.error)) {
        senderNameNeedsMigration = true
        const { sender_name: omitted, ...legacyMessage } = newMessage
        result = await admin.from('messages')
          .insert(legacyMessage).select('*').single()
      }
      if (result.error) throw result.error
      const data = publicMessage(result.data)
      const { error: stampError } = await admin.from('support_chat_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', sessionId).eq('restaurant_id', restaurantId)
      if (stampError) console.warn('[OWNER SUPPORT STAMP]', stampError.code)

      return json({ success: true, message: data, ...(senderNameNeedsMigration ? { warning: 'Message saved; sender-name database migration is still required.' } : {}) })
    }

    return badRequest('Unknown support action.')
  } catch (error) {
    const failure = publicSupportFailure(error, '[OWNER SUPPORT POST]')
    return json({ success: false, code: failure.code, message: failure.message }, 503)
  }
}