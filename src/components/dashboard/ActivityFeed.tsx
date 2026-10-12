import { formatRelativeTime } from '@/lib/utils'
import { INQUIRY_TYPE_LABELS } from '@/types'
import type { Inquiry } from '@/types'
import { MessageCircle, Mail, Phone, FileText } from 'lucide-react'

const iconMap = {
  whatsapp: { icon: MessageCircle, color: 'text-green-400' },
  email:    { icon: Mail,          color: 'text-blue-400' },
  call:     { icon: Phone,         color: 'text-[#DA7756]' },
  note:     { icon: FileText,      color: 'text-[#9B9AAF]' },
}

export default function ActivityFeed({ inquiries }: { inquiries: Inquiry[] }) {
  if (inquiries.length === 0) {
    return (
      <p className="text-[#9B9AAF] text-sm text-center py-8">אין פעילות עדיין</p>
    )
  }

  return (
    <div className="space-y-0">
      {inquiries.map((inq, i) => {
        const { icon: Icon, color } = iconMap[inq.type]
        return (
          <div key={inq.id} className="flex gap-4 relative">
            {i < inquiries.length - 1 && (
              <div className="absolute end-5 top-10 bottom-0 w-px bg-[rgba(218,119,86,0.1)]" />
            )}
            <div className={`w-10 h-10 rounded-full bg-[#221F30] border border-[rgba(218,119,86,0.15)] flex items-center justify-center shrink-0 ${color}`}>
              <Icon size={16} />
            </div>
            <div className="pb-5 flex-1 min-w-0">
              <p className="text-sm text-[#F5F1EB]">
                <span className="font-medium">{INQUIRY_TYPE_LABELS[inq.type]}</span>
                {' נשלח ל'}
                <span className="text-[#DA7756]"> {inq.client?.name ?? 'לקוח'}</span>
                {inq.property && (
                  <>
                    {' עבור '}
                    <span className="text-[#9B9AAF]">{inq.property.title}</span>
                  </>
                )}
              </p>
              <p className="text-xs text-[#6B6A7F] mt-0.5">
                {formatRelativeTime(inq.sent_at)}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
