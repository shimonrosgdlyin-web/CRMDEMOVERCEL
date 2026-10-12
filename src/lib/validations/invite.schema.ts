import { z } from 'zod'

// Deliberately excludes 'owner' — mirrors organization_invites.role's CHECK
// constraint (010_organization_invites.sql). Ownership transfer is a
// separate, more sensitive operation than "invite a teammate."
export const inviteSchema = z.object({
  email: z.string().email('כתובת מייל לא תקינה').max(200).trim().toLowerCase(),
  role: z.enum(['admin', 'agent'], { required_error: 'נדרש תפקיד' }).default('agent'),
})

export type InviteFormData = z.infer<typeof inviteSchema>

export const acceptInviteSchema = z.object({
  token: z.string().uuid('טוקן הזמנה לא תקין'),
})
