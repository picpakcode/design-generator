import { NextResponse } from 'next/server'
import { getFolders, searchAssets } from '@/lib/canto'

const BASE   = process.env.CANTO_BASE_URL ?? ''
const APP_ID = process.env.CANTO_APP_ID  ?? ''
const SECRET = process.env.CANTO_APP_SECRET ?? ''
const CC_TOKEN = process.env.CANTO_CLIENT_CREDENTIALS_TOKEN ?? ''

async function getRawToken(): Promise<{ token: string | null; exchangeStatus: number; exchangeBody: string; scope?: string }> {
  const res = await fetch('https://oauth.canto.com/oauth/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: APP_ID, client_secret: SECRET, scope: 'admin' }),
  })
  const text = await res.text()
  let parsed: Record<string, unknown> = {}
  try { parsed = JSON.parse(text) } catch { /* not json */ }
  const token = (parsed.accessToken ?? parsed.access_token) as string | undefined
  return { token: token ?? null, exchangeStatus: res.status, exchangeBody: text.slice(0, 200), scope: parsed.scope as string | undefined }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q      = searchParams.get('q')
  const auth   = searchParams.get('auth')
  const upload = searchParams.get('upload') // ?upload=ALBUM_ID

  // ?auth=1 — OAuth exchange diagnostic
  if (auth) {
    const { token, exchangeStatus, exchangeBody, scope } = await getRawToken()
    return NextResponse.json({
      exchangeStatus,
      exchangeOk: exchangeStatus === 200,
      gotToken: !!token,
      tokenSnippet: token ? `${token.slice(0, 6)}...${token.slice(-4)}` : null,
      scope,
      ccTokenPresent: !!CC_TOKEN,
      appIdPresent: !!APP_ID,
      rawBody: exchangeBody,
    })
  }

  // ?upload=ALBUM_ID — try uploading a tiny 1×1 PNG to confirm upload scope
  if (upload) {
    const { token, exchangeStatus, exchangeBody } = await getRawToken()
    if (!token) {
      return NextResponse.json({ error: 'token exchange failed', exchangeStatus, exchangeBody }, { status: 500 })
    }

    // Minimal 1×1 white PNG (67 bytes)
    const PNG_1X1 = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
      'hex'
    )
    const form = new FormData()
    form.append('file', new Blob([PNG_1X1], { type: 'image/png' }), 'test-1x1.png')
    form.append('id',   upload)
    form.append('name', 'test-1x1')

    // Try Bearer in header
    const resHeader = await fetch(`${BASE}/api/v1/upload`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form, redirect: 'manual',
    })
    const headerStatus  = resHeader.status
    const headerLocn    = resHeader.headers.get('location')
    const headerCT      = resHeader.headers.get('content-type')
    const headerBody    = await resHeader.text().catch(() => '')

    // Try token as query param (some Canto versions use this)
    const form2 = new FormData()
    form2.append('file', new Blob([PNG_1X1], { type: 'image/png' }), 'test-1x1.png')
    form2.append('id',   upload)
    form2.append('name', 'test-1x1')
    const resQuery = await fetch(`${BASE}/api/v1/upload?authorization=${token}`, {
      method: 'POST', body: form2, redirect: 'manual',
    })
    const queryStatus = resQuery.status
    const queryLocn   = resQuery.headers.get('location')
    const queryBody   = await resQuery.text().catch(() => '')

    return NextResponse.json({
      token: `${token.slice(0, 6)}...${token.slice(-4)}`,
      bearerHeader:   { status: headerStatus, location: headerLocn, contentType: headerCT, body: headerBody.slice(0, 300) },
      queryParam:     { status: queryStatus,  location: queryLocn,  body: queryBody.slice(0, 300) },
    })
  }

  try {
    if (q) {
      const results = await searchAssets(q, 10)
      return NextResponse.json({ query: q, count: results.length, results })
    }
    const folders = await getFolders()
    return NextResponse.json({ folders })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
