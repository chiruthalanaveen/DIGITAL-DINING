import { NextResponse } from 'next/server'

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna'

const SYSTEM_INSTRUCTIONS = `
You are Digital Dining AI Support, the first-line technical support assistant for restaurant owners and managers.

Your job is to understand the restaurant's problem, ask focused follow-up questions, and provide clear step-by-step guidance.

Supported areas include:
- Login and account access
- Menu and food items
- Billing and GST
- Razorpay and payment problems
- QR menu and customer ordering
- Kitchen and order flow
- Waiter portal
- Delivery
- Subscription and plan questions
- Technical problems

Rules:
1. Be concise, friendly, and practical.
2. Ask one or two useful follow-up questions at a time instead of giving a large generic checklist.
3. Do not claim that you can see, change, or inspect the restaurant database or dashboard.
4. Never ask the restaurant to send passwords, API secrets, Razorpay secret keys, Supabase keys, or other sensitive credentials.
5. You may explain where a setting is located, but never invent a feature that you are not sure exists.
6. When the issue needs a human or remains unresolved, tell the user to use "Connect to Admin".
7. Do not say that you have contacted Admin unless the application actually performs that action.
8. The user may be an owner or manager. Address them as restaurant staff.
9. Keep the response focused on solving the reported issue.
`

function normalizeMessages(value) {
  if (!Array.isArray(value)) return []

  return value
    .slice(-20)
    .map((item) => {
      const role = item?.role === 'assistant' ? 'assistant' : 'user'
      const content = String(item?.content || '').trim().slice(0, 2500)

      return {
        role,
        content: content || '(empty message)',
      }
    })
}

function extractResponseText(payload) {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim()
  }

  const output = Array.isArray(payload?.output) ? payload.output : []
  const chunks = []

  for (const item of output) {
    if (item?.type !== 'message' || !Array.isArray(item?.content)) continue

    for (const content of item.content) {
      if (
        content?.type === 'output_text' &&
        typeof content?.text === 'string' &&
        content.text.trim()
      ) {
        chunks.push(content.text.trim())
      }
    }
  }

  return chunks.join('\n').trim()
}

export async function POST(request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY?.trim()

    if (!apiKey) {
      return NextResponse.json(
        {
          success: false,
          message:
            'AI support is not configured. Please connect to Admin Support.',
        },
        { status: 503 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const messages = normalizeMessages(body?.messages)
    const issueCategory = String(body?.issueCategory || '')
      .trim()
      .slice(0, 200)

    if (!messages.length) {
      return NextResponse.json(
        {
          success: false,
          message: 'Please choose an issue or enter your problem.',
        },
        { status: 400 }
      )
    }

    const input = [
      ...(issueCategory
        ? [
            {
              role: 'user',
              content: `Selected issue category: ${issueCategory}`,
            },
          ]
        : []),
      ...messages,
    ]

    const openAiResponse = await fetch(
      'https://api.openai.com/v1/responses',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          instructions: SYSTEM_INSTRUCTIONS,
          input,
          max_output_tokens: 600,
          store: false,
        }),
      }
    )

    const payload = await openAiResponse.json().catch(() => ({}))

    if (!openAiResponse.ok) {
      console.error('OpenAI API error:', {
        status: openAiResponse.status,
        payload,
      })

      return NextResponse.json(
        {
          success: false,
          message:
            'AI support is temporarily unavailable. Please try again or connect to Admin Support.',
        },
        { status: 502 }
      )
    }

    const reply = extractResponseText(payload)

    if (!reply) {
      return NextResponse.json(
        {
          success: false,
          message:
            'AI support returned no response. Please connect to Admin Support.',
        },
        { status: 502 }
      )
    }

    return NextResponse.json({
      success: true,
      reply,
      model: DEFAULT_MODEL,
    })
  } catch (error) {
    console.error('AI support route error:', error)

    return NextResponse.json(
      {
        success: false,
        message:
          'AI support is temporarily unavailable. Please connect to Admin Support.',
      },
      { status: 500 }
    )
  }
}
