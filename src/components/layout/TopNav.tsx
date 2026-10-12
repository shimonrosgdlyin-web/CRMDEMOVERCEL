import { createClient } from '@/lib/supabase/server'

export default async function TopNav({ title }: { title: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let profile = null
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('full_name, agency_name')
      .eq('id', user.id)
      .single()
    profile = data
  }

  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-[rgba(218,119,86,0.15)] bg-[#1A1825]/50 backdrop-blur-sm">
      <h1 className="text-lg font-semibold text-[#F5F1EB]">{title}</h1>
      {profile && (
        <div className="flex items-center gap-3">
          <div className="text-end">
            <p className="text-sm font-medium text-[#F5F1EB]">{profile.full_name}</p>
            {profile.agency_name && (
              <p className="text-xs text-[#9B9AAF]">{profile.agency_name}</p>
            )}
          </div>
          <div className="w-9 h-9 rounded-full bg-[#DA7756]/20 border border-[#DA7756]/30 flex items-center justify-center text-[#DA7756] font-bold text-sm">
            {profile.full_name?.charAt(0) ?? '?'}
          </div>
        </div>
      )}
    </header>
  )
}
