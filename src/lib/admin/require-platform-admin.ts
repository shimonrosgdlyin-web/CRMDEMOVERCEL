// `server-only` makes importing this module from a 'use client' file a BUILD
// error rather than silent dead weight. This is the platform-admin
// authorization gate — it must never be bundled into, or inspectable from,
// browser code. It is the first module in this repo to carry the guard; see
// src/lib/CLAUDE.md.
import 'server-only'

import { NextResponse } from 'next/server'
import { notFound, redirect } from 'next/navigation'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

/**
 * Platform-admin (cross-tenant operator) access, resolved server-side.
 *
 * THREE THINGS TO UNDERSTAND BEFORE CHANGING ANYTHING HERE:
 *
 * 1. This is NOT the security boundary. `is_platform_admin()` in the database
 *    (migration 013) is — it requires a platform_admins grant, an aal2 (MFA)
 *    session, and a non-suspended account, and every admin RPC raises without
 *    it. This module exists so the panel can render sensible UI and the API
 *    can return clean Hebrew errors instead of leaking a raw Postgres
 *    exception. If this file were deleted entirely, the data would still be
 *    safe. Same posture src/lib/org/current-org.ts documents for the
 *    current-org cookie: "never the security boundary — RLS is".
 *
 * 2. Every /api/admin/* route MUST call requirePlatformAdmin() as its first
 *    statement. src/middleware.ts's matcher excludes `api/` entirely
 *    (middleware.ts:102), so those routes get ZERO middleware protection.
 *    There is no framework-level net under them.
 *
 * 3. The denial order is load-bearing — unauthenticated → not_admin →
 *    mfa_required. A caller who is not a platform admin must never learn that
 *    MFA is the next hurdle; only a confirmed admin gets 'mfa_required' (and
 *    the MFA_REQUIRED code) so the UI can route them to /admin/mfa. Reordering
 *    these turns the endpoint into an oracle for "is this account a platform
 *    admin", which is exactly the enumeration a phishing campaign wants.
 */
export type PlatformAdminDenialReason = 'unauthenticated' | 'not_admin' | 'mfa_required'

export type PlatformAdminGate =
  | { ok: true; user: User; supabase: SupabaseClient }
  | { ok: false; reason: PlatformAdminDenialReason; status: 401 | 403 }

interface ResolvedPlatformAdmin {
  user: User | null
  supabase: SupabaseClient
  /** Holds a platform_admins row. Readable at aal1 — see below. */
  hasGrant: boolean
  /** Session has completed a second factor. */
  isAal2: boolean
}

/**
 * Reads the caller's platform-admin standing without deciding what to do
 * about it.
 *
 * The grant lookup deliberately queries `platform_admins` directly rather than
 * calling the `is_platform_admin()` RPC: that function also requires aal2, so
 * a freshly-granted admin who has not enrolled a TOTP factor yet would fail
 * it — and could then never reach /admin/mfa to enroll one. platform_admins'
 * own RLS policy (`using (user_id = auth.uid())`, migration 013) exposes
 * exactly one row, the caller's own, with no assurance-level requirement.
 * That is the intended and only MFA bootstrap path.
 */
async function resolvePlatformAdmin(): Promise<ResolvedPlatformAdmin> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return { user: null, supabase, hasGrant: false, isAal2: false }
  }

  const { data: grant } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  return {
    user,
    supabase,
    hasGrant: Boolean(grant),
    isAal2: await sessionIsAal2(supabase),
  }
}

/**
 * True when the session has completed a second factor.
 *
 * Primary path is supabase-js's own getAuthenticatorAssuranceLevel(). The
 * fallback decodes the `aal` claim straight off the access token because that
 * helper is not exercised anywhere else in this codebase and its behaviour
 * over an @supabase/ssr cookie session is worth not betting the gate on. A
 * JWT with no `aal` claim is aal1 by definition
 * (https://supabase.com/docs/guides/auth/auth-mfa).
 *
 * Reading the token here is safe in a way `getSession()`-for-identity is not:
 * nothing is trusted from it except a UI-affecting boolean. The database
 * re-derives the same claim independently via auth.jwt() and refuses the
 * actual data if it disagrees.
 */
async function sessionIsAal2(supabase: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (!error && data?.currentLevel) return data.currentLevel === 'aal2'
  } catch {
    // fall through to the token-claim path
  }

  try {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return false

    const payload = token.split('.')[1]
    if (!payload) return false

    // base64url → base64 before decoding; JWT segments are base64url-encoded.
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    return (JSON.parse(json) as { aal?: string }).aal === 'aal2'
  } catch {
    // Malformed token — fail closed.
    return false
  }
}

/** Full gate for /api/admin/* route handlers. */
export async function requirePlatformAdmin(): Promise<PlatformAdminGate> {
  const { user, supabase, hasGrant, isAal2 } = await resolvePlatformAdmin()

  if (!user) return { ok: false, reason: 'unauthenticated', status: 401 }
  if (!hasGrant) return { ok: false, reason: 'not_admin', status: 403 }
  if (!isAal2) return { ok: false, reason: 'mfa_required', status: 403 }

  return { ok: true, user, supabase }
}

/**
 * Turns a denial into the response shape every other route in this app uses
 * ({ error: string }, Hebrew user-facing text — see src/app/api/CLAUDE.md).
 *
 * `code: 'MFA_REQUIRED'` is attached ONLY to the mfa_required denial, so the
 * client can route to /admin/mfa. A non-admin gets a bare, generic 403 that
 * says nothing about why.
 */
export function platformAdminErrorResponse(
  gate: Extract<PlatformAdminGate, { ok: false }>
): NextResponse {
  if (gate.reason === 'unauthenticated') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (gate.reason === 'mfa_required') {
    return NextResponse.json(
      { error: 'נדרש אימות דו-שלבי כדי לגשת לפאנל הניהול', code: 'MFA_REQUIRED' },
      { status: 403 }
    )
  }

  return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
}

/**
 * Page-level gate for everything under /admin except /admin/mfa.
 *
 * A non-admin gets notFound() — a real 404 — rather than a redirect or a
 * "forbidden" page. The panel should not confirm its own existence to someone
 * who has no business there.
 */
export async function requirePlatformAdminPage(): Promise<{ user: User; supabase: SupabaseClient }> {
  const { user, supabase, hasGrant, isAal2 } = await resolvePlatformAdmin()

  if (!user) redirect('/login?redirect=%2Fadmin')
  if (!hasGrant) notFound()
  if (!isAal2) redirect('/admin/mfa')

  return { user, supabase }
}

/**
 * Gate for /admin/mfa itself — requires a session and a platform_admins grant,
 * but deliberately NOT aal2. This is the one page a platform admin must be
 * able to reach before they have a second factor; gating it on aal2 would make
 * enrollment impossible and lock the panel permanently on first use.
 */
export async function requirePlatformAdminGrantPage(): Promise<{
  user: User
  supabase: SupabaseClient
  isAal2: boolean
}> {
  const { user, supabase, hasGrant, isAal2 } = await resolvePlatformAdmin()

  if (!user) redirect('/login?redirect=%2Fadmin')
  if (!hasGrant) notFound()

  return { user, supabase, isAal2 }
}
