import { NextResponse } from 'next/server'

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna'

const SYSTEM_INSTRUCTIONS = `
You are Digital Dining AI Support, the first-line technical support assistant for restaurant owners and managers.

Your job is to understand the restaurant's problem, ask focused follow-up questions, and then give practical step-by-step guidance that the user can follow in the Digital Dining website.

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

Conversation flow:
1. When the restaurant first selects an issue category, DO NOT immediately give a long generic checklist.
2. First acknowledge the selected category and ask a very clear question about what is actually wrong. Give a few short examples so the user knows what detail to provide.
3. After the user explains the exact problem, diagnose it and give concise numbered steps to try.
4. Ask the user to tell you what happened after those steps. Continue troubleshooting based on their answer.
5. If the issue cannot be safely resolved from the information available, recommend “Connect to Admin”.

Category-specific first questions:
- Login / Account: ask whether login fails, password is rejected, OTP/email verification is the issue, or the wrong page/account opens.
- Menu / Food Items: ask whether the item is missing, cannot be edited, price/image/category is wrong, or the customer QR menu is not updating.
- Billing / GST: ask whether the problem is GST number/setup, CGST/SGST rate, tax not appearing on the bill, wrong tax amount/total, invoice details, restaurant name/signature, or a paid invoice problem.
- Razorpay / Payment: ask whether the problem is Razorpay setup, checkout not opening, payment failing, payment succeeding but order not appearing, or payment status mismatch.
- QR Menu / Ordering: ask whether the QR page is not opening, menu items are missing, offers/cart are not working, Pay at Counter is missing, or order placement is failing.
- Kitchen / Orders: ask whether new orders are not appearing, the alarm is not working, order status is not updating, or today's order history is missing.
- Waiter: ask whether the waiter cannot log in, cannot see orders, cannot send orders, or order status/notifications are not updating.
- Delivery: ask whether the issue is COD, prepaid delivery, creating/assigning a delivery order, or delivery status tracking.
- Subscription: ask whether the problem is plan selection, subscription payment, plan activation, or a feature not appearing after payment.
- Technical Problem: ask what page/function is failing and what message or error they see.
- Other: ask the user to describe the exact problem in one or two sentences.

Billing/GST troubleshooting guidance:
- First identify the exact symptom before suggesting steps.
- If the user says tax is wrong, ask for the displayed subtotal, CGST, SGST, and total amount (not secrets or payment credentials).
- If GST is missing, ask whether GST is enabled/configured for the restaurant and whether the issue affects all orders or only one order.
- If the invoice details are wrong, ask which field is wrong (restaurant name, GST details, customer details, tax lines, signature, amount, or order number).
- Explain that GST-ready billing in Digital Dining uses configurable SGST and CGST; do not invent a tax rate that the user has not provided.
- Do not ask for passwords, API secrets, Razorpay secret keys, Supabase keys, or other sensitive credentials.

Rules:
1. Be concise, friendly, and practical.
2. Ask one or two useful follow-up questions at a time instead of giving a large generic checklist.
3. Do not claim that you can see, change, or inspect the restaurant database or dashboard.
4. Never ask the restaurant to send passwords, API secrets, Razorpay secret keys, Supabase keys, or other sensitive credentials.
5. You may explain where a setting is located, but never invent a feature that you are not sure exists.
6. When the issue needs a human or remains unresolved, tell the user to use “Connect to Admin”.
7. Do not say that you have contacted Admin unless the application actually performs that action.
8. The user may be an owner or manager. Address them as restaurant staff.
9. Keep the response focused on solving the reported issue.
10. When giving troubleshooting steps, use simple numbered steps and avoid unnecessary technical jargon.
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
    const stage = String(body?.stage || 'conversation')
      .trim()
      .slice(0, 50)

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
      ...(stage === 'category_selected'
        ? [
            {
              role: 'user',
              content:
                'The restaurant has just selected this category. Ask one clear, category-specific question to identify the exact problem. Do not give a long troubleshooting checklist yet.',
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
