import {
  NextResponse,
} from 'next/server'

import {
  requireAdmin,
} from '@/lib/server/adminSession'

import {
  getAdminSupabase,
} from '@/lib/server/adminSupabase'

export const runtime =
  'nodejs'

export const dynamic =
  'force-dynamic'

function cleanText(
  value,
  max = 2000
) {
  return String(
    value ?? ''
  )
    .trim()
    .slice(
      0,
      max
    )
}

function unauthorized() {
  return NextResponse.json(
    {
      success: false,
      message:
        'Admin authentication required.',
    },
    {
      status: 401,
      headers: {
        'Cache-Control':
          'no-store',
      },
    }
  )
}

async function writeAudit(
  admin,
  session,
  {
    action,
    entityId,
    metadata = {},
  }
) {
  try {
    await admin
      .from(
        'admin_audit_logs'
      )
      .insert({
        actor_email:
          session.email,
        action:
          cleanText(
            action,
            120
          ),
        entity_type:
          'live_support',
        entity_id:
          cleanText(
            entityId,
            200
          ),
        metadata,
      })
  } catch (error) {
    console.warn(
      '[ADMIN LIVE SUPPORT AUDIT]',
      error?.message ||
        error
    )
  }
}

function sanitizeSession(
  row,
  restaurantsById
) {
  const restaurant =
    restaurantsById[
      String(
        row?.restaurant_id ||
          ''
      )
    ] || {}

  return {
    id:
      row?.id || '',
    restaurant_id:
      row?.restaurant_id ||
      '',
    restaurant_name:
      restaurant?.name ||
      row?.restaurant_name ||
      'Restaurant',
    restaurant_code:
      restaurant?.restaurant_code ||
      row?.restaurant_code ||
      '-----',
    status:
      row?.status ||
      'pending',
    requested_at:
      row?.requested_at ||
      row?.created_at ||
      null,
    accepted_at:
      row?.accepted_at ||
      null,
    accepted_by:
      row?.accepted_by ||
      '',
    closed_at:
      row?.closed_at ||
      null,
    closed_by:
      row?.closed_by ||
      '',
    updated_at:
      row?.updated_at ||
      null,

    // Optional newer AI-support fields are returned when present.
    issue_category:
      row?.issue_category ||
      row?.support_type ||
      '',
    ai_summary:
      row?.ai_summary ||
      '',
    ai_transcript:
      Array.isArray(
        row?.ai_transcript
      )
        ? row.ai_transcript
        : [],
  }
}

function sanitizeMessage(
  row
) {
  return {
    id:
      row?.id || '',
    restaurant_id:
      row?.restaurant_id ||
      '',
    support_session_id:
      row?.support_session_id ||
      '',
    sender:
      row?.sender ||
      '',
    message:
      row?.message ||
      '',
    created_at:
      row?.created_at ||
      null,
  }
}

async function loadRestaurants(
  admin,
  restaurantIds
) {
  if (
    !restaurantIds.length
  ) {
    return {}
  }

  const {
    data,
    error,
  } =
    await admin
      .from(
        'restaurants'
      )
      .select(
        'id,name,restaurant_code'
      )
      .in(
        'id',
        restaurantIds
      )

  if (error) {
    throw error
  }

  return Object.fromEntries(
    (data || []).map(
      (row) => [
        String(
          row.id
        ),
        row,
      ]
    )
  )
}

export async function GET(
  request
) {
  const session =
    requireAdmin(
      request
    )

  if (!session) {
    return unauthorized()
  }

  try {
    const admin =
      getAdminSupabase()

    const url =
      new URL(
        request.url
      )

    const requestedSessionId =
      cleanText(
        url.searchParams.get(
          'sessionId'
        ),
        100
      )

    const {
      data: sessionRows,
      error: sessionsError,
    } =
      await admin
        .from(
          'support_chat_sessions'
        )
        .select('*')
        .order(
          'updated_at',
          {
            ascending: false,
          }
        )
        .limit(150)

    if (sessionsError) {
      throw sessionsError
    }

    const rows =
      Array.isArray(
        sessionRows
      )
        ? sessionRows
        : []

    const restaurantIds =
      [
        ...new Set(
          rows
            .map(
              (row) =>
                String(
                  row?.restaurant_id ||
                    ''
                )
            )
            .filter(Boolean)
        ),
      ]

    const restaurantsById =
      await loadRestaurants(
        admin,
        restaurantIds
      )

    const sessions =
      rows
        .map(
          (row) =>
            sanitizeSession(
              row,
              restaurantsById
            )
        )
        .sort(
          (a, b) => {
            const rank = {
              pending: 0,
              connected: 1,
              closed: 2,
            }

            const statusDelta =
              (rank[
                a.status
              ] ?? 9) -
              (rank[
                b.status
              ] ?? 9)

            if (
              statusDelta !== 0
            ) {
              return statusDelta
            }

            return (
              new Date(
                b.updated_at ||
                  b.requested_at ||
                  0
              ).getTime() -
              new Date(
                a.updated_at ||
                  a.requested_at ||
                  0
              ).getTime()
            )
          }
        )

    let selectedSession =
      null

    let messages = []

    if (
      requestedSessionId
    ) {
      selectedSession =
        sessions.find(
          (row) =>
            String(
              row.id
            ) ===
            requestedSessionId
        ) || null

      if (!selectedSession) {
        return NextResponse.json(
          {
            success: false,
            message:
              'Live support session was not found.',
          },
          {
            status: 404,
          }
        )
      }

      const {
        data: messageRows,
        error:
          messagesError,
      } =
        await admin
          .from(
            'messages'
          )
          .select('*')
          .eq(
            'support_session_id',
            requestedSessionId
          )
          .order(
            'created_at',
            {
              ascending: true,
            }
          )
          .limit(1000)

      if (messagesError) {
        throw messagesError
      }

      messages =
        (messageRows || [])
          .map(
            sanitizeMessage
          )
    }

    const pendingCount =
      sessions.filter(
        (row) =>
          row.status ===
          'pending'
      ).length

    const connectedCount =
      sessions.filter(
        (row) =>
          row.status ===
          'connected'
      ).length

    return NextResponse.json(
      {
        success: true,
        sessions,
        selectedSession,
        messages,
        counts: {
          pending:
            pendingCount,
          connected:
            connectedCount,
          total:
            sessions.length,
        },
      },
      {
        headers: {
          'Cache-Control':
            'no-store',
        },
      }
    )
  } catch (error) {
    console.error(
      '[ADMIN LIVE SUPPORT GET]',
      error
    )

    const missingBackend =
      String(
        error?.message ||
          ''
      ).includes(
        'support_chat_sessions'
      )

    return NextResponse.json(
      {
        success: false,
        message:
          missingBackend
            ? 'Live Support backend is not installed. Run the support-chat backend SQL first.'
            : error?.message ||
              'Unable to load Live Support.',
      },
      {
        status: 500,
        headers: {
          'Cache-Control':
            'no-store',
        },
      }
    )
  }
}

export async function POST(
  request
) {
  const session =
    requireAdmin(
      request
    )

  if (!session) {
    return unauthorized()
  }

  try {
    const admin =
      getAdminSupabase()

    const body =
      await request
        .json()
        .catch(
          () => ({})
        )

    const action =
      cleanText(
        body?.action,
        50
      )

    const sessionId =
      cleanText(
        body?.sessionId,
        100
      )

    if (!sessionId) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Support session ID is required.',
        },
        {
          status: 400,
        }
      )
    }

    const {
      data: supportSession,
      error:
        sessionError,
    } =
      await admin
        .from(
          'support_chat_sessions'
        )
        .select('*')
        .eq(
          'id',
          sessionId
        )
        .maybeSingle()

    if (sessionError) {
      throw sessionError
    }

    if (!supportSession) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Live support session was not found.',
        },
        {
          status: 404,
        }
      )
    }

    if (
      action ===
      'accept'
    ) {
      if (
        supportSession.status ===
        'closed'
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              'Closed Live Support sessions cannot be accepted.',
          },
          {
            status: 409,
          }
        )
      }

      const {
        data: updated,
        error,
      } =
        await admin
          .from(
            'support_chat_sessions'
          )
          .update({
            status:
              'connected',
            accepted_at:
              supportSession.accepted_at ||
              new Date().toISOString(),
            accepted_by:
              supportSession.accepted_by ||
              session.email ||
              'Admin',
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            'id',
            sessionId
          )
          .select('*')
          .single()

      if (error) {
        throw error
      }

      await writeAudit(
        admin,
        session,
        {
          action:
            'live_support_accept',
          entityId:
            sessionId,
          metadata: {
            restaurant_id:
              supportSession.restaurant_id,
          },
        }
      )

      return NextResponse.json({
        success: true,
        session:
          updated,
      })
    }

    if (
      action ===
      'close'
    ) {
      if (
        supportSession.status ===
        'closed'
      ) {
        return NextResponse.json({
          success: true,
          session:
            supportSession,
        })
      }

      const {
        data: updated,
        error,
      } =
        await admin
          .from(
            'support_chat_sessions'
          )
          .update({
            status:
              'closed',
            closed_at:
              new Date().toISOString(),
            closed_by:
              session.email ||
              'Admin',
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            'id',
            sessionId
          )
          .select('*')
          .single()

      if (error) {
        throw error
      }

      await writeAudit(
        admin,
        session,
        {
          action:
            'live_support_close',
          entityId:
            sessionId,
          metadata: {
            restaurant_id:
              supportSession.restaurant_id,
          },
        }
      )

      return NextResponse.json({
        success: true,
        session:
          updated,
      })
    }

    if (
      action ===
      'send'
    ) {
      if (
        supportSession.status !==
        'connected'
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              'Accept the Live Support request before replying.',
          },
          {
            status: 409,
          }
        )
      }

      const message =
        cleanText(
          body?.message,
          2000
        )

      if (!message) {
        return NextResponse.json(
          {
            success: false,
            message:
              'Message cannot be empty.',
          },
          {
            status: 400,
          }
        )
      }

      const {
        data: inserted,
        error,
      } =
        await admin
          .from(
            'messages'
          )
          .insert({
            restaurant_id:
              supportSession.restaurant_id,
            support_session_id:
              sessionId,
            sender:
              'admin',
            message,
          })
          .select('*')
          .single()

      if (error) {
        throw error
      }

      await admin
        .from(
          'support_chat_sessions'
        )
        .update({
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          'id',
          sessionId
        )

      await writeAudit(
        admin,
        session,
        {
          action:
            'live_support_reply',
          entityId:
            sessionId,
          metadata: {
            restaurant_id:
              supportSession.restaurant_id,
            message_length:
              message.length,
          },
        }
      )

      return NextResponse.json({
        success: true,
        message:
          sanitizeMessage(
            inserted
          ),
      })
    }

    return NextResponse.json(
      {
        success: false,
        message:
          'Unknown Live Support action.',
      },
      {
        status: 400,
      }
    )
  } catch (error) {
    console.error(
      '[ADMIN LIVE SUPPORT POST]',
      error
    )

    return NextResponse.json(
      {
        success: false,
        message:
          error?.message ||
          'Live Support action failed.',
      },
      {
        status: 500,
        headers: {
          'Cache-Control':
            'no-store',
        },
      }
    )
  }
}
