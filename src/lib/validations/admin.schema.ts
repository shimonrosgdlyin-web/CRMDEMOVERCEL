import { z } from 'zod'

/**
 * Validation for the platform super-admin panel (/admin, /api/admin/*).
 *
 * Unlike every other schema in this directory, these are NOT shared with a
 * react-hook-form resolver on a big multi-field form — the admin panel's only
 * write is a two-field suspension action. They are still defined here, in the
 * same place and the same naming convention as the rest, so there is exactly
 * one home for request validation.
 */

/**
 * Kept as a plain ZodObject alongside the `.refine()`d export below, because
 * `.refine()` produces a ZodEffects and ZodEffects does not support
 * `.partial()`. Same split, for the same reason, as
 * `baseClientSchema`/`clientSchema` — see src/lib/CLAUDE.md.
 */
export const baseSuspensionSchema = z.object({
  suspended: z.boolean({ required_error: 'יש לציין האם להשעות או לשחזר' }),
  reason: z.string().trim().max(500, 'סיבה ארוכה מדי (מקסימום 500 תווים)').optional(),
})

/**
 * A reason is REQUIRED to suspend and optional to restore. An audit row with
 * no reason on it tells you nothing six months later, and suspension is the
 * highest-consequence action in the product — it cuts off every member of an
 * organization at once. Restoring needs no justification: it returns things to
 * the default state.
 *
 * The database enforces this independently (admin_set_organization_suspended /
 * admin_set_user_suspended both raise on an empty reason when suspending), so
 * this is the friendly-error layer, not the guarantee.
 */
export const suspensionSchema = baseSuspensionSchema.refine(
  (data) => !data.suspended || Boolean(data.reason && data.reason.length > 0),
  { message: 'חובה לציין סיבה להשעיה', path: ['reason'] }
)

/**
 * Query params for the admin list endpoints. `z.coerce` because these arrive
 * as strings off `req.nextUrl.searchParams`.
 *
 * The `.max(100)` on limit is mirrored by a `least(greatest(...))` clamp inside
 * the RPCs themselves (migration 013) — a platform admin can call PostgREST
 * directly, so the bound has to exist on both sides rather than only here.
 */
export const adminListQuerySchema = z.object({
  search: z.string().trim().max(100, 'חיפוש ארוך מדי').optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export type SuspensionFormData = z.infer<typeof suspensionSchema>
export type AdminListQuery = z.infer<typeof adminListQuerySchema>
