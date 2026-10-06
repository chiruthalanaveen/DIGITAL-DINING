import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const MAX_REQUIREMENTS_PER_MODULE = 50

function cleanText(value, maxLength = 200) {
  if (typeof value !== 'string') return ''

  return value
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLength)
}

function cleanPhone(value) {
  if (typeof value !== 'string') return ''

  return value
    .replace(/[^\d+]/g, '')
    .slice(0, 20)
}

function cleanRequirements(value) {
  if (!Array.isArray(value)) return []

  return value
    .slice(0, MAX_REQUIREMENTS_PER_MODULE)
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }

      const id = cleanText(item.id, 100)
      const title = cleanText(item.title, 200)

      if (!id || !title) {
        return null
      }

      return {
        id,
        title,
      }
    })
    .filter(Boolean)
}

export async function POST(request) {
  try {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      console.error(
        'Missing Supabase server environment variables'
      )

      return NextResponse.json(
        {
          ok: false,
          error:
            'Server configuration is incomplete.',
        },
        { status: 500 }
      )
    }

    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    )

    const body = await request.json()

    const customerName = cleanText(
      body?.customerName,
      100
    )

    const contactNumber = cleanPhone(
      body?.contactNumber
    )

    const email = cleanText(
      body?.email,
      200
    ).toLowerCase()

    const businessName = cleanText(
      body?.businessName,
      150
    )

    const businessCity = cleanText(
      body?.businessCity,
      100
    )

    const additionalRequirements = cleanText(
      body?.additionalRequirements,
      1500
    )

    const restaurantRequirements =
      cleanRequirements(
        body?.restaurantRequirements
      )

    const deliveryRequirements =
      cleanRequirements(
        body?.deliveryRequirements
      )

    const resortRequirements =
      cleanRequirements(
        body?.resortRequirements
      )

    if (!customerName) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Please enter your name.',
        },
        { status: 400 }
      )
    }

    const phoneDigits =
      contactNumber.replace(/\D/g, '')

    if (
      phoneDigits.length < 10 ||
      phoneDigits.length > 15
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Please enter a valid contact number.',
        },
        { status: 400 }
      )
    }

    if (
      email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Please enter a valid email address.',
        },
        { status: 400 }
      )
    }

    const totalRequirements =
      restaurantRequirements.length +
      deliveryRequirements.length +
      resortRequirements.length

    if (totalRequirements === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Please select at least one requirement.',
        },
        { status: 400 }
      )
    }

    const restaurantSelected =
      restaurantRequirements.length > 0

    const deliverySelected =
      deliveryRequirements.length > 0

    const resortSelected =
      resortRequirements.length > 0

    const { data, error } =
      await supabaseAdmin
        .from('custom_plan_requests')
        .insert({
          customer_name: customerName,
          contact_number: contactNumber,

          email: email || null,

          business_name:
            businessName || null,

          business_city:
            businessCity || null,

          restaurant_selected:
            restaurantSelected,

          delivery_selected:
            deliverySelected,

          resort_selected:
            resortSelected,

          restaurant_requirements:
            restaurantRequirements,

          delivery_requirements:
            deliveryRequirements,

          resort_requirements:
            resortRequirements,

          additional_requirements:
            additionalRequirements || null,

          status: 'new',
        })
        .select('id, created_at')
        .single()

    if (error) {
      console.error(
        'Custom plan insert error:',
        error
      )

      return NextResponse.json(
        {
          ok: false,
          error:
            'Unable to submit your requirements.',
        },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        ok: true,
        message:
          'Requirements submitted successfully.',
        requestId: data.id,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error(
      'Custom plan API error:',
      error
    )

    return NextResponse.json(
      {
        ok: false,
        error:
          'Unable to submit your requirements.',
      },
      { status: 500 }
    )
  }
}