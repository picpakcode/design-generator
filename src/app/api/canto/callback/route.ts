import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const APP_ID  = process.env.CANTO_APP_ID!
const SECRET  = process.env.CANTO_APP_SECRET!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(`${APP_URL}?canto_error=${encodeURIComponent(error)}`)
  }
  if (!code || !state) {
    return NextResponse.redirect(`${APP_URL}?canto_error=missing_params`)
  }

  let userId: string
  try {
    const parsed = JSON.parse(Buffer.from(state, 'base64url').toString()) as { userId: string }
    userId = parsed.userId
    if (!userId) throw new Error('no userId')
  } catch {
    return NextResponse.redirect(`${APP_URL}?canto_error=invalid_state`)
  }

  const redirect = `${APP_URL}/api/canto/callback`
  const tokenRes = await fetch('https://oauth.canto.com/oauth/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      client_id:     APP_ID,
      client_secret: SECRET,
      redirect_uri:  redirect,
    }),
  })

  if (!tokenRes.ok) {
    const text = await tokenRes.text()
    console.error('[canto/callback] token exchange failed:', tokenRes.status, text.slice(0, 400))
    return NextResponse.redirect(`${APP_URL}?canto_error=token_exchange_failed`)
  }

  const data = await tokenRes.json() as {
    accessToken?: string;  access_token?: string
    refreshToken?: string; refresh_token?: string
    expiresIn?: number;    expires_in?: number
  }

  const accessToken  = data.accessToken  ?? data.access_token
  const refreshToken = data.refreshToken ?? data.refresh_token ?? null
  const expiresIn    = Number(data.expiresIn ?? data.expires_in ?? 3600)

  if (!accessToken) {
    return NextResponse.redirect(`${APP_URL}?canto_error=no_token`)
  }

  const expiresAt = new Date(Date.now() + (expiresIn - 60) * 1000).toISOString()

  const admin = createAdminClient()
  const { error: dbError } = await admin
    .from('canto_tokens')
    .upsert(
      { user_id: userId, access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )

  if (dbError) {
    console.error('[canto/callback] DB upsert failed:', dbError)
    return NextResponse.redirect(`${APP_URL}?canto_error=db_error`)
  }

  return NextResponse.redirect(`${APP_URL}?canto_connected=1`)
}
