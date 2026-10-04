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

function backendMissingMessage(
  error
) {
  const message =
    String(
      error?.message ||
        ''
    )

  if (
    message.includes(
      'Could not find the function'
    ) ||
    message.includes(
      'schema cache'
    ) ||
    message.includes(
      'admin_get_support_chats'
    ) ||
    message.includes(
      'get_support_chat_state'
    ) ||
    message.includes(
      'support_chat_send_message'
    ) ||
    message.includes(
      'admin_accept_support_chat'
    ) ||
    message.includes(
      'admin_close_support_chat'
    )
  ) {
    return (
      'Live Support backend RPCs are missing or not refreshed in Supabase. ' +
      'Run the Live Support backend repair SQL and reload the schema cache.'
    )
  }

  return (
    error?.message ||
    'Unable to load Live Support.'
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

    const sessionId =
      cleanText(
        url.searchParams.get(
          'sessionId'
        ),
        100
      )

    const {
      data: inboxData,
      error: inboxError,
    } =
      await admin.rpc(
        'admin_get_support_chats'
      )

    if (inboxError) {
      throw inboxError
    }

    if (
      inboxData?.success ===
      false
    ) {
      throw new Error(
        inboxData?.message ||
          'Unable to load support inbox.'
      )
    }

    const sessions =
      Array.isArray(
        inboxData?.sessions
      )
        ? inboxData.sessions
        : []

    let selectedSession =
      null

    let messages = []

    if (sessionId) {
      selectedSession =
        sessions.find(
          (row) =>
            String(
              row?.id ||
                ''
            ) ===
            sessionId
        ) || null

      /*
       * If a selected session disappeared from the active inbox because
       * it was just closed, return the list without crashing.
       */
      if (
        selectedSession
          ?.restaurant_id
      ) {
        const {
          data: stateData,
          error: stateError,
        } =
          await admin.rpc(
            'get_support_chat_state',
            {
              p_restaurant_id:
                String(
                  selectedSession.restaurant_id
                ),
            }
          )

        if (stateError) {
          throw stateError
        }

        if (
          stateData?.success ===
          false
        ) {
          throw new Error(
            stateData?.message ||
              'Unable to load support conversation.'
          )
        }

        selectedSession =
          stateData?.session ||
          selectedSession

        messages =
          Array.isArray(
            stateData?.messages
          )
            ? stateData.messages
            : []
      }
    }

    return NextResponse.json(
      {
        success: true,

        sessions,

        selectedSession,

        messages,

        counts: {
          pending:
            sessions.filter(
              (row) =>
                String(
                  row?.status ||
                    ''
                ).toLowerCase() ===
                'pending'
            ).length,

          connected:
            sessions.filter(
              (row) =>
                String(
                  row?.status ||
                    ''
                ).toLowerCase() ===
                'connected'
            ).length,

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

    return NextResponse.json(
      {
        success: false,
        message:
          backendMissingMessage(
            error
          ),
        details:
          process.env.NODE_ENV ===
          'development'
            ? String(
                error?.message ||
                  ''
              )
            : undefined,
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

    if (
      action ===
      'accept'
    ) {
      const {
        data,
        error,
      } =
        await admin.rpc(
          'admin_accept_support_chat',
          {
            p_session_id:
              sessionId,

            p_admin_name:
              session.email ||
              'Admin',
          }
        )

      if (error) {
        throw error
      }

      if (
        data?.success ===
        false
      ) {
        throw new Error(
          data?.message ||
            'Unable to accept support chat.'
        )
      }

      await writeAudit(
        admin,
        session,
        {
          action:
            'live_support_accept',

          entityId:
            sessionId,
        }
      )

      return NextResponse.json({
        success: true,
        session:
          data?.session ||
          null,
      })
    }

    if (
      action ===
      'close'
    ) {
      const {
        data,
        error,
      } =
        await admin.rpc(
          'admin_close_support_chat',
          {
            p_session_id:
              sessionId,

            p_admin_name:
              session.email ||
              'Admin',
          }
        )

      if (error) {
        throw error
      }

      if (
        data?.success ===
        false
      ) {
        throw new Error(
          data?.message ||
            'Unable to close support chat.'
        )
      }

      await writeAudit(
        admin,
        session,
        {
          action:
            'live_support_close',

          entityId:
            sessionId,
        }
      )

      return NextResponse.json({
        success: true,
        session:
          data?.session ||
          null,
      })
    }

    if (
      action ===
      'send'
    ) {
      const restaurantId =
        cleanText(
          body?.restaurantId,
          100
        )

      const message =
        cleanText(
          body?.message,
          2000
        )

      if (!restaurantId) {
        return NextResponse.json(
          {
            success: false,
            message:
              'Restaurant ID is required to send a Live Support message.',
          },
          {
            status: 400,
          }
        )
      }

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
        data,
        error,
      } =
        await admin.rpc(
          'support_chat_send_message',
          {
            p_restaurant_id:
              restaurantId,

            p_session_id:
              sessionId,

            p_sender:
              'admin',

            p_message:
              message,
          }
        )

      if (error) {
        throw error
      }

      if (
        data?.success ===
        false
      ) {
        throw new Error(
          data?.message ||
            'Unable to send support reply.'
        )
      }

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
              restaurantId,

            message_length:
              message.length,
          },
        }
      )

      return NextResponse.json({
        success: true,
        message:
          data?.message ||
          null,
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
          backendMissingMessage(
            error
          ),
        details:
          process.env.NODE_ENV ===
          'development'
            ? String(
                error?.message ||
                  ''
              )
            : undefined,
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