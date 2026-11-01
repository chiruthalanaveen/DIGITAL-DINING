import { getAdminSupabase } from './adminSupabase'

const SETTINGS_KEY = 'website_status'
const REQUEST_TIMEOUT_MS = 3000

export function defaultMaintenanceEnabled() {
  return process.env.MAINTENANCE_MODE !== 'false'
}

function normalizeSetting(row) {
  if (row && !['Working', 'Not Working'].includes(row.status)) {
    throw new Error('Invalid maintenance setting.')
  }

  return {
    enabled: row ? row.status === 'Not Working' : defaultMaintenanceEnabled(),
    updatedAt: row?.updated_at || null,
  }
}

export async function getMaintenanceSettings(admin = getAdminSupabase()) {
  const { data, error } = await admin
    .from('platform_settings')
    .select('status,updated_at')
    .eq('key', SETTINGS_KEY)
    .maybeSingle()
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS))

  if (error) throw new Error('Unable to load maintenance settings.')
  return normalizeSetting(data)
}

export async function maintenanceEnabled() {
  try {
    // Read shared storage on each page request, including after an admin change.
    return (await getMaintenanceSettings()).enabled
  } catch {
    // A database outage must not prevent the maintenance notice or admin access.
    return defaultMaintenanceEnabled()
  }
}

export async function setMaintenanceSettings(enabled, admin = getAdminSupabase()) {
  const { data, error } = await admin
    .from('platform_settings')
    .upsert({
      key: SETTINGS_KEY,
      status: enabled ? 'Not Working' : 'Working',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })
    .select('status,updated_at')
    .single()
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS))

  if (error || !data) throw new Error('Unable to save maintenance settings.')
  return normalizeSetting(data)
}
