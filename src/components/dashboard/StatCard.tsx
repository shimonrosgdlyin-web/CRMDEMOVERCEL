import type { LucideIcon } from 'lucide-react'

interface Props {
  title: string
  value: number | string
  icon: LucideIcon
  color?: 'orange' | 'blue' | 'green' | 'purple' | 'red'
}

const colorMap = {
  orange: { bg: 'bg-[#DA7756]/10', text: 'text-[#DA7756]', border: 'border-[#DA7756]/20' },
  blue:   { bg: 'bg-blue-500/10',  text: 'text-blue-400',  border: 'border-blue-500/20' },
  green:  { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' },
  purple: { bg: 'bg-purple-500/10',text: 'text-purple-400',border: 'border-purple-500/20' },
  // added for the admin panel's suspended-count tiles — a suspension count
  // rendered in green reads as "all good", which is the opposite of the truth
  red:    { bg: 'bg-red-500/10',   text: 'text-red-400',   border: 'border-red-500/20' },
}

export default function StatCard({ title, value, icon: Icon, color = 'orange' }: Props) {
  const c = colorMap[color]
  return (
    <div className="bg-[#1A1825] rounded-2xl p-6 border border-[rgba(218,119,86,0.15)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[#9B9AAF] text-sm mb-1">{title}</p>
          <p className="text-3xl font-bold text-[#F5F1EB]">{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-xl ${c.bg} border ${c.border} flex items-center justify-center`}>
          <Icon size={22} className={c.text} />
        </div>
      </div>
    </div>
  )
}
