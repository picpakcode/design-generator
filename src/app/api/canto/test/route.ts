import { NextResponse } from 'next/server'
import { getFolders, searchAssets } from '@/lib/canto'

const BASE     = process.env.CANTO_BASE_URL ?? ''
const APP_ID   = process.env.CANTO_APP_ID  ?? ''
const SECRET   = process.env.CANTO_APP_SECRET ?? ''
const CC_TOKEN = process.env.CANTO_CLIENT_CREDENTIALS_TOKEN ?? ''

async function getOAuthToken(): Promise<string | null> {
  const res = await fetch('https://oauth.canto.com/oauth/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: APP_ID, client_secret: SECRET, scope: 'admin' }),
  })
  if (!res.ok) return null
  const d = await res.json() as Record<string, unknown>
  return (d.accessToken ?? d.access_token) as string | null
}

// Valid 1×1 black PNG as Uint8Array (avoids Buffer→Blob issues)
const PNG_BYTES = new Uint8Array(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
))

async function post(path: string, token: string, body: FormData | string | null, extraHeaders?: Record<string, string>): Promise<{ status: number; body: string }> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
    body: body ?? undefined,
    redirect: 'manual',
  })
  const text = await res.text().catch(() => '')
  return { status: res.status, body: text.slice(0, 300) }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q      = searchParams.get('q')
  const auth   = searchParams.get('auth')
  const upload = searchParams.get('upload')

  if (auth) {
    const t = await getOAuthToken()
    return NextResponse.json({ exchangeOk: !!t, snippet: t ? `${t.slice(0,6)}...${t.slice(-4)}` : null })
  }

  if (upload) {
    const tok = await getOAuthToken() ?? CC_TOKEN
    const r: Record<string, unknown> = {}

    // 1. Empty POST — what does Canto say without any body?
    r['empty_body'] = await post(`/api/v1/album/${upload}/upload`, tok, null)

    // 2. File only (no name, no scheme)
    const f1 = new FormData()
    f1.append('file', new Blob([PNG_BYTES], { type: 'image/png' }), 'test.png')
    r['file_only'] = await post(`/api/v1/album/${upload}/upload`, tok, f1)

    // 3. File + name (no scheme)
    const f2 = new FormData()
    f2.append('file', new Blob([PNG_BYTES], { type: 'image/png' }), 'test.png')
    f2.append('name', 'api-test')
    r['file_name'] = await post(`/api/v1/album/${upload}/upload`, tok, f2)

    // 4. File + name + scheme (current approach)
    const f3 = new FormData()
    f3.append('file', new Blob([PNG_BYTES], { type: 'image/png' }), 'test.png')
    f3.append('name', 'api-test')
    f3.append('scheme', 'image')
    r['file_name_scheme'] = await post(`/api/v1/album/${upload}/upload`, tok, f3)

    // 5. File + name — but with File object instead of Blob
    const f4 = new FormData()
    f4.append('file', new File([PNG_BYTES], 'test.png', { type: 'image/png' }))
    f4.append('name', 'api-test')
    r['file_obj_name'] = await post(`/api/v1/album/${upload}/upload`, tok, f4)

    // 6. Try test export album OH03P with file+name
    const f5 = new FormData()
    f5.append('file', new Blob([PNG_BYTES], { type: 'image/png' }), 'test.png')
    f5.append('name', 'api-test')
    r['test_album_OH03P'] = await post(`/api/v1/album/OH03P/upload`, tok, f5)

    return NextResponse.json(r)
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
