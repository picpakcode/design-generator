import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const BASE = process.env.CANTO_BASE_URL!

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
  const tokenValid = expiresAt > Date.now()
  const tokenPrefix = data.access_token.slice(0, 8)

  // Verify the token actually works against Canto's API
  let cantoReachable = false
  let cantoError = ''
  try {
    const res = await fetch(`${BASE}/api/v1/search?keyword=test&limit=1`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    })
    cantoReachable = res.ok
    if (!res.ok) cantoError = `${res.status}: ${(await res.text()).slice(0, 200)}`
  } catch (e) {
    cantoError = String(e)
  }

  return NextResponse.json({
    connected: tokenValid && cantoReachable,
    token_valid: tokenValid,
    expires_at: data.expires_at,
    token_prefix: tokenPrefix,
    canto_api_ok: cantoReachable,
    canto_error: cantoError || undefined,
  })
}
