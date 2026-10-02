import {
  NextResponse,
} from 'next/server'

export const dynamic =
  'force-dynamic'

function clean(value) {
  return String(
    value || ''
  ).trim()
}

function unique(values) {
  return [
    ...new Set(
      values
        .map(clean)
        .filter(Boolean)
    ),
  ]
}

export async function GET(
  request
) {
  try {
    const {
      searchParams,
    } = request.nextUrl

    const latitude =
      Number(
        searchParams.get('lat')
      )

    const longitude =
      Number(
        searchParams.get('lng')
      )

    if (
      !Number.isFinite(
        latitude
      ) ||
      latitude < -90 ||
      latitude > 90 ||
      !Number.isFinite(
        longitude
      ) ||
      longitude < -180 ||
      longitude > 180
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Invalid location coordinates.',
        },
        {
          status: 400,
        }
      )
    }

    const url =
      new URL(
        'https://nominatim.openstreetmap.org/reverse'
      )

    url.searchParams.set(
      'format',
      'jsonv2'
    )

    url.searchParams.set(
      'lat',
      String(latitude)
    )

    url.searchParams.set(
      'lon',
      String(longitude)
    )

    url.searchParams.set(
      'addressdetails',
      '1'
    )

    url.searchParams.set(
      'zoom',
      '18'
    )

    const response =
      await fetch(
        url.toString(),
        {
          method: 'GET',

          headers: {
            Accept:
              'application/json',

            'Accept-Language':
              'en',

            'User-Agent':
              'Digital-Dining/1.0 digitaldining077@gmail.com',
          },

          cache: 'no-store',
        }
      )

    if (!response.ok) {
      throw new Error(
        `Reverse geocoding failed (${response.status}).`
      )
    }

    const result =
      await response.json()

    const address =
      result?.address || {}

    const road =
      clean(
        address.road ||
          address.pedestrian ||
          address.residential ||
          address.footway ||
          address.path
      )

    const houseNumber =
      clean(
        address.house_number
      )

    const building =
      clean(
        address.building ||
          address.house_name
      )

    const areaParts =
      unique([
        address.neighbourhood,
        address.suburb,
        address.quarter,
        address.city_district,
      ])

    const city =
      clean(
        address.city ||
          address.town ||
          address.village ||
          address.municipality ||
          address.county
      )

    const state =
      clean(
        address.state ||
          address.state_district
      )

    const pincode =
      clean(
        address.postcode
      )
        .replace(/\D/g, '')
        .slice(0, 6)

    const landmark =
      clean(
        address.amenity ||
          address.shop ||
          address.tourism ||
          address.office ||
          address.leisure
      )

    let addressLine1 =
      unique([
        houseNumber,
        building,
        road,
      ]).join(', ')

    if (
      !addressLine1 &&
      result?.display_name
    ) {
      addressLine1 =
        String(
          result.display_name
        )
          .split(',')
          .slice(0, 2)
          .join(',')
          .trim()
    }

    return NextResponse.json({
      success: true,

      latitude,
      longitude,

      address: {
        addressLine1,
        addressLine2:
          areaParts.join(', '),

        landmark,

        city,

        state,

        pincode,

        displayName:
          clean(
            result?.display_name
          ),
      },
    })
  } catch (error) {
    console.error(
      'Reverse geocoding error:',
      error
    )

    return NextResponse.json(
      {
        success: false,

        message:
          'Location was found, but the written address could not be identified automatically.',
      },
      {
        status: 502,
      }
    )
  }
}