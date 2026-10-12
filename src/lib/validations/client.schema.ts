import { z } from 'zod'
import { optionalNumber } from './common'

export const baseClientSchema = z.object({
  name: z.string().min(1, 'נדרש שם לקוח').max(100, 'שם ארוך מדי').trim(),
  phone: z
    .string()
    .regex(/^[0-9\-\+\s()]{7,20}$/, 'מספר טלפון לא תקין')
    .optional()
    .or(z.literal('')),
  email: z
    .string()
    .email('כתובת מייל לא תקינה')
    .max(200)
    .optional()
    .or(z.literal('')),
  // optionalNumber: empty type="number" input -> valueAsNumber gives NaN,
  // not undefined -> must preprocess before .optional() sees it (see common.ts)
  budget_min: optionalNumber(z.number().positive('תקציב מינימלי חייב להיות חיובי')),
  budget_max: optionalNumber(z.number().positive('תקציב מקסימלי חייב להיות חיובי')),
  property_types: z
    .array(z.enum(['apartment', 'house', 'penthouse', 'land', 'office']))
    .default([]),
  preferred_cities: z.array(z.string().trim().max(100)).default([]),
  rooms_min: optionalNumber(z.number().min(0).max(50)),
  rooms_max: optionalNumber(z.number().min(0).max(50)),
  notes: z.string().max(2000, 'הערות ארוכות מדי').trim().optional(),
  status: z
    .enum(['new', 'contacted', 'meeting', 'offer', 'signed', 'closed'])
    .default('new'),
})

export const clientSchema = baseClientSchema
  .refine(
    (d) =>
      d.budget_min === undefined ||
      d.budget_max === undefined ||
      d.budget_min <= d.budget_max,
    { message: 'תקציב מינימלי חייב להיות קטן ממקסימלי', path: ['budget_min'] }
  )
  .refine(
    (d) =>
      d.rooms_min === undefined ||
      d.rooms_max === undefined ||
      d.rooms_min <= d.rooms_max,
    { message: 'חדרים מינימלי חייב להיות קטן ממקסימלי', path: ['rooms_min'] }
  )

// Use baseClientSchema.partial() for PATCH routes (ZodEffects doesn't support .partial())
export const patchClientSchema = baseClientSchema.partial()

export type ClientFormData = z.infer<typeof clientSchema>
