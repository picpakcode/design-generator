import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const APP_ID  = process.env.CANTO_APP_ID!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const state = Buffer.from(JSON.stringify({ userId: user.id, ts: Date.now() })).toString('base64url')

  const redirect = `${APP_URL}/api/canto/callback`
  const url = new URL('https://oauth.canto.com/oauth/api/oauth2/auth')
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id',     APP_ID)
  url.searchParams.set('redirect_uri',  redirect)
  url.searchParams.set('state',         state)

  return NextResponse.redirect(url.toString())
}
