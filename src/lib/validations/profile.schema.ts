import { z } from 'zod'

// Mirrors client.schema.ts's phone regex for consistency — see
// crm/CLAUDE.md's Input Validation Rule ("phone fields accept only digits,
// spaces, +, -, ()"), which this profiles.phone field didn't actually honor
// until now (it only had client-side .slice() truncation).
export const profileSchema = z.object({
  full_name: z.string().min(1, 'נדרש שם מלא').max(100, 'שם ארוך מדי').trim(),
  phone: z
    .string()
    .regex(/^[0-9\-\+\s()]{7,20}$/, 'מספר טלפון לא תקין')
    .optional()
    .or(z.literal('')),
  agency_name: z.string().max(100, 'שם ארוך מדי').trim().optional().or(z.literal('')),
})

export type ProfileFormData = z.infer<typeof profileSchema>
