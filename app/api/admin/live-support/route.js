import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/server/adminSession'
import { getAdminSupabase } from '@/lib/server/adminSupabase'
import { isSameOriginAdminRequest } from '@/lib/server/adminRequestOrigin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const json = (data, status = 200) => NextResponse.json(data, {
  status,
  headers: { 'Cache-Control': 'private, no-store, max-age=0' },
})
const failure = (message, status = 400) => json({ success: false, message }, status)


// The current Super Admin session uses one server-configured account.
// ADMIN_DISPLAY_NAME identifies that configured account, not a distinct
// employee when multiple people share the same login credentials.
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

function verifiedAdminDisplayName(actor) {
  const configured = String(process.env.ADMIN_DISPLAY_NAME || '').trim()
  if (configured) return configured.slice(0, 120)
  // Show the authenticated account's email rather than invent an employee name.
  return String(actor?.email || '').trim().slice(0, 120) || 'Super Admin'
}

async function audit(admin, actor, action, supportSession, meta = {}) {
  // Never put message text into the audit log. Audit failures cannot undo
  // an already-saved chat message or misreport it as unsent to the Admin UI.
  try {
    const { error } = await admin.from('admin_audit_logs').insert({
      actor_email: String(actor?.email || 'Admin').slice(0, 250),
      action,
      entity_type: 'live_support',
      entity_id: String(supportSession.id),
      metadata: {
        restaurant_id: supportSession.restaurant_id,
        ...meta,
      },
    })
    if (error) console.warn('[LIVE SUPPORT AUDIT]', error.code || error.message)
  } catch (error) {
    console.warn('[LIVE SUPPORT AUDIT]', error?.message || error)
  }
}

function readableSession(row, restaurant) {
  return {
    ...row,
    restaurant_name: restaurant?.name || row.restaurant_name || 'Restaurant',
    restaurant_code: restaurant?.restaurant_code || row.restaurant_code || '-----',
  }
}

async function getHistory(admin, sessionId) {
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
  const actor = requireAdmin(request)
  if (!actor) return failure('Admin authentication required.', 401)

  try {
    const admin = getAdminSupabase()
    const requestedId = String(new URL(request.url).searchParams.get('sessionId') || '').trim()
    if (requestedId && !UUID_RE.test(requestedId)) return failure('Invalid support session ID.')

    const { data: allSessions, error } = await admin.from('support_chat_sessions')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(300)
    if (error) throw error

    const rows = allSessions || []
    const ids = [...new Set(rows.map(s => s.restaurant_id).filter(Boolean))]
    const restaurants = {}
    if (ids.length) {
      const result = await admin.from('restaurants')
        .select('id,name,restaurant_code').in('id', ids)
      if (result.error) throw result.error
      for (const restaurant of result.data || []) restaurants[String(restaurant.id)] = restaurant
    }

    const sessions = rows.map(s => readableSession(s, restaurants[String(s.restaurant_id)]))
      .sort((a, b) => {
        const priority = { pending: 0, connected: 1, closed: 2 }
        const delta = (priority[a.status] ?? 3) - (priority[b.status] ?? 3)
        return delta || new Date(b.updated_at || b.requested_at || 0) - new Date(a.updated_at || a.requested_at || 0)
      })

    let selectedSession = requestedId
      ? sessions.find(s => String(s.id) === requestedId) || null
      : null
    // Preserve access to a selected closed conversation even if it has aged
    // beyond the most recent 300 sessions in the inbox.
    if (requestedId && !selectedSession) {
      const r = await admin.from('support_chat_sessions').select('*').eq('id', requestedId).maybeSingle()
      if (r.error) throw r.error
      if (!r.data) return failure('Support session not found.', 404)
      let info = restaurants[String(r.data.restaurant_id)]
      if (!info) {
        const lookup = await admin.from('restaurants')
          .select('id,name,restaurant_code').eq('id', r.data.restaurant_id).maybeSingle()
        if (lookup.error) throw lookup.error
        info = lookup.data
      }
      selectedSession = readableSession(r.data, info)
    }

    const messages = selectedSession ? await getHistory(admin, selectedSession.id) : []
    const pending = sessions.filter(s => s.status === 'pending').length
    const connected = sessions.filter(s => s.status === 'connected').length
    return json({
      success: true,
      sessions,
      selectedSession,
      messages,
      messageLimit: 500,
      counts: { pending, connected, total: sessions.length },
    })
  } catch (error) {
    const diagnostic = publicSupportFailure(error, '[ADMIN SUPPORT GET]')
    return json({ success: false, code: diagnostic.code, message: diagnostic.message }, 503)
  }
}

export async function POST(request) {
  const actor = requireAdmin(request)
  if (!actor) return failure('Admin authentication required.', 401)
  if (!isSameOriginAdminRequest(request)) return failure('Cross-origin request rejected.', 403)

  try {
    const body = await request.json().catch(() => ({}))
    const action = String(body?.action || '').trim()
    const sessionId = String(body?.sessionId || '').trim()
    if (!UUID_RE.test(sessionId)) return failure('Invalid support session ID.')
    const admin = getAdminSupabase()

    const current = await admin.from('support_chat_sessions')
      .select('*').eq('id', sessionId).maybeSingle()
    if (current.error) throw current.error
    const session = current.data
    if (!session) return failure('Support session not found.', 404)

    if (action === 'accept') {
      if (session.status === 'closed') return failure('Closed chats cannot be accepted.', 409)
      const result = await admin.from('support_chat_sessions').update({
        status: 'connected',
        accepted_at: session.accepted_at || new Date().toISOString(),
        accepted_by: session.accepted_by || actor.email || 'Admin',
        updated_at: new Date().toISOString(),
      }).eq('id', sessionId).eq('status', 'pending').select('*').maybeSingle()
      if (result.error) throw result.error
      // Another Admin may have changed the status between read and update.
      let next = result.data
      if (!next) {
        const latest = await admin.from('support_chat_sessions')
          .select('*').eq('id', sessionId).maybeSingle()
        if (latest.error) throw latest.error
        if (latest.data?.status !== 'connected') {
          return failure('This request is no longer available for acceptance.', 409)
        }
        next = latest.data
      }
      await audit(admin, actor, 'live_support_accept', session)
      return json({ success: true, session: next })
    }

    if (action === 'close') {
      if (session.status === 'closed') return json({ success: true, session })
      const result = await admin.from('support_chat_sessions').update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        closed_by: actor.email || 'Admin',
        updated_at: new Date().toISOString(),
      }).eq('id', sessionId).neq('status', 'closed').select('*').maybeSingle()
      if (result.error) throw result.error
      if (!result.data) return failure('This chat was already closed.', 409)
      await audit(admin, actor, 'live_support_close', session)
      return json({ success: true, session: result.data })
    }

    if (action === 'send') {
      if (session.status !== 'connected') return failure('Accept this chat before replying.', 409)
      const message = String(body?.message || '').trim()
      if (!message || message.length > 2000) return failure('Enter a message of 1–2000 characters.')

      const newMessage = {
        restaurant_id: session.restaurant_id, // Never trust client-supplied restaurantId.
        support_session_id: sessionId,
        sender: 'admin',
        sender_name: verifiedAdminDisplayName(actor),
        message,
      }
      let result = await admin.from('messages')
        .insert(newMessage).select('*').single()
      let senderNameNeedsMigration = false
      if (result.error && missingSenderNameColumn(result.error)) {
        senderNameNeedsMigration = true
        const { sender_name: omitted, ...legacyMessage } = newMessage
        result = await admin.from('messages')
          .insert(legacyMessage).select('*').single()
      }
      if (result.error) throw result.error
      const stamp = await admin.from('support_chat_sessions')
        .update({ updated_at: new Date().toISOString() }).eq('id', sessionId)
      if (stamp.error) console.warn('[ADMIN SUPPORT STAMP]', stamp.error.code)
      await audit(admin, actor, 'live_support_reply', session, { message_length: message.length })
      return json({ success: true, message: publicMessage(result.data), ...(senderNameNeedsMigration ? { warning: 'Message saved; sender-name database migration is still required.' } : {}) })
    }

    return failure('Unknown Live Support action.')
  } catch (error) {
    const diagnostic = publicSupportFailure(error, '[ADMIN SUPPORT POST]')
    return json({ success: false, code: diagnostic.code, message: diagnostic.message }, 503)
  }
}