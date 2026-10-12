import { z } from 'zod'

export const organizationSchema = z.object({
  name: z.string().min(1, 'נדרש שם ארגון / סוכנות').max(200, 'שם ארוך מדי').trim(),
})

export type OrganizationFormData = z.infer<typeof organizationSchema>
