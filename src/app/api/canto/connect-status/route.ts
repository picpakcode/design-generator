import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ connected: false })

  const admin = createAdminClient()
  const { data } = await admin
    .from('canto_tokens')
    .select('expires_at')
    .eq('user_id', user.id)
    .single()

  const connected = !!data && new Date(data.expires_at).getTime() > Date.now()
  return NextResponse.json({ connected })
}
