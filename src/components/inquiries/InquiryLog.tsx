import { formatRelativeTime } from '@/lib/utils'
import { INQUIRY_TYPE_LABELS } from '@/types'
import type { Inquiry } from '@/types'
import { MessageCircle, Mail, Phone, FileText } from 'lucide-react'

const iconMap = {
  whatsapp: { icon: MessageCircle, color: 'text-green-400 bg-green-500/10' },
  email:    { icon: Mail,          color: 'text-blue-400 bg-blue-500/10' },
  call:     { icon: Phone,         color: 'text-[#DA7756] bg-[#DA7756]/10' },
  note:     { icon: FileText,      color: 'text-[#9B9AAF] bg-[#9B9AAF]/10' },
}

export default function InquiryLog({ inquiries }: { inquiries: Inquiry[] }) {
  if (inquiries.length === 0) {
    return <p className="text-[#9B9AAF] text-sm text-center py-6">אין פניות עדיין</p>
  }

  return (
    <div className="space-y-3">
      {inquiries.map((inq) => {
        const { icon: Icon, color } = iconMap[inq.type]
        return (
          <div key={inq.id} className="flex items-start gap-3 p-3 rounded-xl bg-[#141220] border border-[rgba(218,119,86,0.08)]">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
              <Icon size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-[#F5F1EB]">
                  {INQUIRY_TYPE_LABELS[inq.type]}
                </span>
                <span className="text-xs text-[#6B6A7F] shrink-0">
                  {formatRelativeTime(inq.sent_at)}
                </span>
              </div>
              {inq.property && (
                <p className="text-xs text-[#9B9AAF] mt-0.5 truncate">
                  עבור: {inq.property.title}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
