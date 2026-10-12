import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The current-org cookie is a UX/query-scoping convenience for multi-org
 * users, never the security boundary — RLS (is_org_member/is_org_admin,
 * see supabase/CLAUDE.md) is the actual boundary regardless of what this
 * cookie says. A tampered or stale value must never be trusted blindly:
 * every read here is validated against the caller's real
 * organization_members rows before being used to scope a query.
 */
export const CURRENT_ORG_COOKIE = 'current_org_id'

export interface CurrentOrgResult {
  organizationId: string | null
  /** true only when the user has zero organization_members rows at all */
  hasNoOrganizations: boolean
}

/**
 * Resolves which org the current request should be scoped to:
 * 1. If the cookie is present AND matches a real membership, use it.
 * 2. Otherwise (missing, or pointing at an org the user isn't a member of —
 *    tampered, stale, or they were removed from that org), fall back to
 *    their most-recently-created membership.
 * 3. If they have no memberships at all, organizationId is null and
 *    hasNoOrganizations is true — callers must handle this explicitly
 *    (e.g. a clear "no organization" message), not treat it as a crash.
 *
 * Read-only — does not set/repair the cookie itself, so it's safe to call
 * from Server Components (which cannot set cookies) as well as Route
 * Handlers. Callers running in a Route Handler that want to persist a
 * freshly-resolved value should follow up with `setCurrentOrgCookie`.
 */
export async function resolveCurrentOrg(
  supabase: SupabaseClient,
  userId: string
): Promise<CurrentOrgResult> {
  const cookieStore = await cookies()
  const cookieOrgId = cookieStore.get(CURRENT_ORG_COOKIE)?.value ?? null

  if (cookieOrgId) {
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', userId)
      .eq('organization_id', cookieOrgId)
      .maybeSingle()

    if (membership) {
      return { organizationId: membership.organization_id as string, hasNoOrganizations: false }
    }
    // Cookie didn't match a real membership — fall through and re-derive.
  }

  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)

  const fallbackId = (memberships?.[0]?.organization_id as string | undefined) ?? null
  return { organizationId: fallbackId, hasNoOrganizations: fallbackId === null }
}

/**
 * Convenience wrapper for the common case (dashboard pages / API routes
 * that just need a scoping value, not the "zero organizations" distinction
 * — the login flow's own route handles that case explicitly).
 */
export async function getCurrentOrgId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { organizationId } = await resolveCurrentOrg(supabase, userId)
  return organizationId
}

/**
 * Sets the httpOnly current-org cookie. Only callable from a Route Handler
 * or Server Action context (cookies() throws/no-ops on write from a Server
 * Component render) — used by the signup and login flows after resolving
 * which org a session should start in.
 */
export async function setCurrentOrgCookie(organizationId: string) {
  const cookieStore = await cookies()
  cookieStore.set(CURRENT_ORG_COOKIE, organizationId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
}
