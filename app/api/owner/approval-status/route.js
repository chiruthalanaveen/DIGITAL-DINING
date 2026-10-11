import { NextResponse } from 'next/server'
import { getOwnerApprovalAccess } from '@/lib/server/ownerApproval'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function respond(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

// Authenticated owners may check their own status, even while pending.
// No service-role key or administrative fields are returned to the browser.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const access = await getOwnerApprovalAccess(
      request,
      searchParams.get('restaurantId')
    )
    if (!access.ok) {
      return respond({ success: false, code: access.code, message: access.message }, access.status)
    }

    return respond({
      success: true,
      restaurantId: access.restaurantId,
      restaurantName: access.restaurantName,
      approvalStatus: access.approvalStatus,
      canAccessPortal: access.approvalStatus === 'approved',
      approvalNote: access.approvalStatus === 'rejected' ? access.approvalNote : '',
    })
  } catch (error) {
    console.error('[OWNER APPROVAL STATUS]', error)
    return respond({ success: false, message: 'Could not verify account approval.' }, 500)
  }
}
