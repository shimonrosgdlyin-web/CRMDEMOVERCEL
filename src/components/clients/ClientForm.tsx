'use client'

import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { clientSchema, type ClientFormData } from '@/lib/validations/client.schema'
import type { Client } from '@/types'

interface Props {
  defaultValues?: Partial<Client>
  clientId?: string
}

const inputClass =
  'w-full px-4 py-3 rounded-xl bg-[#141220] border border-[rgba(218,119,86,0.15)] text-[#F5F1EB] placeholder-[#6B6A7F] focus:outline-none focus:border-[#DA7756] transition-colors text-sm'
const labelClass = 'block text-sm font-medium text-[#9B9AAF] mb-2'
const errorClass = 'text-red-400 text-xs mt-1'

const PROPERTY_TYPES = [
  { value: 'apartment', label: 'דירה' },
  { value: 'house',     label: 'בית פרטי' },
  { value: 'penthouse', label: 'פנטהאוז' },
  { value: 'land',      label: 'קרקע' },
  { value: 'office',    label: 'משרד' },
]

export default function ClientForm({ defaultValues, clientId }: Props) {
  const router = useRouter()
  const [serverError, setServerError] = useState('')
  const [citiesInput, setCitiesInput] = useState(
    defaultValues?.preferred_cities?.join(', ') ?? ''
  )
  const isEdit = !!clientId

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name:             defaultValues?.name ?? '',
      phone:            defaultValues?.phone ?? '',
      email:            defaultValues?.email ?? '',
      budget_min:       defaultValues?.budget_min,
      budget_max:       defaultValues?.budget_max,
      property_types:   (defaultValues?.property_types as ClientFormData['property_types']) ?? [],
      preferred_cities: defaultValues?.preferred_cities ?? [],
      rooms_min:        defaultValues?.rooms_min,
      rooms_max:        defaultValues?.rooms_max,
      notes:            defaultValues?.notes ?? '',
      status:           defaultValues?.status ?? 'new',
    },
  })

  async function onSubmit(data: ClientFormData) {
    setServerError('')
    // Parse cities from comma-separated input
    const cities = citiesInput
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, 20)
    data.preferred_cities = cities

    const url = isEdit ? `/api/clients/${clientId}` : '/api/clients'
    const method = isEdit ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setServerError(json.error || 'שגיאה בשמירה, נסה שנית')
      return
    }

    router.push('/clients')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Name */}
        <div className="md:col-span-2">
          <label className={labelClass}>שם לקוח *</label>
          <input type="text" {...register('name')} className={inputClass} placeholder="ישראל ישראלי" maxLength={100} />
          {errors.name && <p className={errorClass}>{errors.name.message}</p>}
        </div>

        {/* Phone */}
        <div>
          <label className={labelClass}>טלפון</label>
          <input type="tel" {...register('phone')} className={inputClass} placeholder="050-0000000" maxLength={20} />
          {errors.phone && <p className={errorClass}>{errors.phone.message}</p>}
        </div>

        {/* Email */}
        <div>
          <label className={labelClass}>אימייל</label>
          <input type="email" {...register('email')} className={inputClass} placeholder="name@example.com" maxLength={200} />
          {errors.email && <p className={errorClass}>{errors.email.message}</p>}
        </div>

        {/* Status */}
        <div>
          <label className={labelClass}>סטטוס ליד</label>
          <select {...register('status')} className={inputClass}>
            <option value="new">ליד חדש</option>
            <option value="contacted">יצר קשר</option>
            <option value="meeting">פגישה</option>
            <option value="offer">הצעה</option>
            <option value="signed">חתם</option>
            <option value="closed">סגור</option>
          </select>
        </div>

        {/* Budget */}
        <div>
          <label className={labelClass}>תקציב מינימלי (₪)</label>
          <input type="number" {...register('budget_min', { valueAsNumber: true })} className={inputClass} placeholder="800000" min={0} />
          {errors.budget_min && <p className={errorClass}>{errors.budget_min.message}</p>}
        </div>

        <div>
          <label className={labelClass}>תקציב מקסימלי (₪)</label>
          <input type="number" {...register('budget_max', { valueAsNumber: true })} className={inputClass} placeholder="2000000" min={0} />
          {errors.budget_max && <p className={errorClass}>{errors.budget_max.message}</p>}
        </div>

        {/* Rooms */}
        <div>
          <label className={labelClass}>חדרים מינימום</label>
          <input type="number" {...register('rooms_min', { valueAsNumber: true })} className={inputClass} placeholder="3" min={0} max={50} step={0.5} />
          {errors.rooms_min && <p className={errorClass}>{errors.rooms_min.message}</p>}
        </div>

        <div>
          <label className={labelClass}>חדרים מקסימום</label>
          <input type="number" {...register('rooms_max', { valueAsNumber: true })} className={inputClass} placeholder="5" min={0} max={50} step={0.5} />
          {errors.rooms_max && <p className={errorClass}>{errors.rooms_max.message}</p>}
        </div>

        {/* Property types */}
        <div className="md:col-span-2">
          <label className={labelClass}>סוגי נכס מועדפים</label>
          <Controller
            name="property_types"
            control={control}
            render={({ field }) => (
              <div className="flex flex-wrap gap-2">
                {PROPERTY_TYPES.map((type) => {
                  const selected = field.value.includes(type.value as never)
                  return (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => {
                        const next = selected
                          ? field.value.filter((v) => v !== type.value)
                          : [...field.value, type.value as never]
                        field.onChange(next)
                      }}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                        selected
                          ? 'bg-[#DA7756]/15 text-[#DA7756] border-[#DA7756]/30'
                          : 'bg-[#141220] text-[#9B9AAF] border-[rgba(218,119,86,0.15)] hover:border-[#DA7756]/30'
                      }`}
                    >
                      {type.label}
                    </button>
                  )
                })}
              </div>
            )}
          />
        </div>

        {/* Cities */}
        <div className="md:col-span-2">
          <label className={labelClass}>ערים מועדפות (מופרדות בפסיקים)</label>
          <input
            type="text"
            value={citiesInput}
            onChange={(e) => setCitiesInput(e.target.value)}
            className={inputClass}
            placeholder="תל אביב, רמת גן, הרצליה"
            maxLength={500}
          />
        </div>

        {/* Notes */}
        <div className="md:col-span-2">
          <label className={labelClass}>הערות</label>
          <textarea
            {...register('notes')}
            rows={3}
            className={inputClass + ' resize-none'}
            placeholder="הערות נוספות על הלקוח..."
            maxLength={2000}
          />
          {errors.notes && <p className={errorClass}>{errors.notes.message}</p>}
        </div>
      </div>

      {serverError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm">
          {serverError}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-6 py-3 rounded-xl bg-[#DA7756] hover:bg-[#C45E3E] text-white font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'שומר...' : isEdit ? 'עדכן לקוח' : 'הוסף לקוח'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-6 py-3 rounded-xl bg-[#221F30] hover:bg-[#2a2640] text-[#9B9AAF] font-semibold transition-colors"
        >
          ביטול
        </button>
      </div>
    </form>
  )
}
