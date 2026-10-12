'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { propertySchema, type PropertyFormData } from '@/lib/validations/property.schema'
import type { Property } from '@/types'

interface Props {
  defaultValues?: Partial<Property>
  propertyId?: string
}

const inputClass =
  'w-full px-4 py-3 rounded-xl bg-[#141220] border border-[rgba(218,119,86,0.15)] text-[#F5F1EB] placeholder-[#6B6A7F] focus:outline-none focus:border-[#DA7756] transition-colors text-sm'
const labelClass = 'block text-sm font-medium text-[#9B9AAF] mb-2'
const errorClass = 'text-red-400 text-xs mt-1'

export default function PropertyForm({ defaultValues, propertyId }: Props) {
  const router = useRouter()
  const [serverError, setServerError] = useState('')
  const isEdit = !!propertyId

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PropertyFormData>({
    resolver: zodResolver(propertySchema),
    defaultValues: {
      title:       defaultValues?.title ?? '',
      type:        defaultValues?.type ?? 'apartment',
      price:       defaultValues?.price,
      address:     defaultValues?.address ?? '',
      city:        defaultValues?.city ?? '',
      rooms:       defaultValues?.rooms,
      size_sqm:    defaultValues?.size_sqm,
      floor:       defaultValues?.floor,
      parking:     defaultValues?.parking ?? false,
      elevator:    defaultValues?.elevator ?? false,
      description: defaultValues?.description ?? '',
      status:      defaultValues?.status ?? 'available',
    },
  })

  async function onSubmit(data: PropertyFormData) {
    setServerError('')
    const url = isEdit ? `/api/properties/${propertyId}` : '/api/properties'
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

    router.push('/properties')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Title */}
        <div className="md:col-span-2">
          <label className={labelClass}>שם הנכס *</label>
          <input type="text" {...register('title')} className={inputClass} placeholder="דירה 4 חדרים ברמת אביב" maxLength={200} />
          {errors.title && <p className={errorClass}>{errors.title.message}</p>}
        </div>

        {/* Type */}
        <div>
          <label className={labelClass}>סוג נכס *</label>
          <select {...register('type')} className={inputClass}>
            <option value="apartment">דירה</option>
            <option value="house">בית פרטי</option>
            <option value="penthouse">פנטהאוז</option>
            <option value="land">קרקע</option>
            <option value="office">משרד</option>
          </select>
          {errors.type && <p className={errorClass}>{errors.type.message}</p>}
        </div>

        {/* Status */}
        <div>
          <label className={labelClass}>סטטוס *</label>
          <select {...register('status')} className={inputClass}>
            <option value="available">זמין</option>
            <option value="pending">ממתין</option>
            <option value="rented">מושכר</option>
            <option value="sold">נמכר</option>
          </select>
        </div>

        {/* Price */}
        <div>
          <label className={labelClass}>מחיר (₪) *</label>
          <input type="number" {...register('price', { valueAsNumber: true })} className={inputClass} placeholder="1500000" min={0} />
          {errors.price && <p className={errorClass}>{errors.price.message}</p>}
        </div>

        {/* City */}
        <div>
          <label className={labelClass}>עיר *</label>
          <input type="text" {...register('city')} className={inputClass} placeholder="תל אביב" maxLength={100} />
          {errors.city && <p className={errorClass}>{errors.city.message}</p>}
        </div>

        {/* Address */}
        <div className="md:col-span-2">
          <label className={labelClass}>כתובת *</label>
          <input type="text" {...register('address')} className={inputClass} placeholder="רחוב הרצל 10" maxLength={300} />
          {errors.address && <p className={errorClass}>{errors.address.message}</p>}
        </div>

        {/* Rooms */}
        <div>
          <label className={labelClass}>חדרים</label>
          <input type="number" {...register('rooms', { valueAsNumber: true })} className={inputClass} placeholder="3.5" min={0} max={50} step={0.5} />
          {errors.rooms && <p className={errorClass}>{errors.rooms.message}</p>}
        </div>

        {/* Size */}
        <div>
          <label className={labelClass}>גודל (מ"ר)</label>
          <input type="number" {...register('size_sqm', { valueAsNumber: true })} className={inputClass} placeholder="85" min={0} />
          {errors.size_sqm && <p className={errorClass}>{errors.size_sqm.message}</p>}
        </div>

        {/* Floor */}
        <div>
          <label className={labelClass}>קומה</label>
          <input type="number" {...register('floor', { valueAsNumber: true })} className={inputClass} placeholder="3" min={-5} max={200} />
          {errors.floor && <p className={errorClass}>{errors.floor.message}</p>}
        </div>

        {/* Checkboxes */}
        <div className="flex items-center gap-6 pt-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" {...register('parking')} className="w-4 h-4 accent-[#DA7756]" />
            <span className="text-sm text-[#F5F1EB]">חניה</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" {...register('elevator')} className="w-4 h-4 accent-[#DA7756]" />
            <span className="text-sm text-[#F5F1EB]">מעלית</span>
          </label>
        </div>

        {/* Description */}
        <div className="md:col-span-2">
          <label className={labelClass}>תיאור</label>
          <textarea
            {...register('description')}
            rows={4}
            className={inputClass + ' resize-none'}
            placeholder="תיאור הנכס..."
            maxLength={2000}
          />
          {errors.description && <p className={errorClass}>{errors.description.message}</p>}
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
          {isSubmitting ? 'שומר...' : isEdit ? 'עדכן נכס' : 'הוסף נכס'}
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
