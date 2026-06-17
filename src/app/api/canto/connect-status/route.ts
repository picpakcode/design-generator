import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ connected: false })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('canto_tokens')
    .select('expires_at, access_token')
    .eq('user_id', user.id)
    .single()

  if (!data) return NextResponse.json({ connected: false, debug: error?.message })

  const expiresAt = new Date(data.expires_at).getTime()
  const connected = expiresAt > Date.now()
  return NextResponse.json({
    connected,
    expires_at: data.expires_at,
    token_prefix: data.access_token.slice(0, 8),
  })
}
