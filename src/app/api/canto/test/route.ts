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

const PNG_1X1 = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
  'hex'
)

async function probe(method: string, path: string, token: string, body?: FormData | string, extraHeaders?: Record<string, string>): Promise<{ status: number; location: string | null; body: string }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
    body,
    redirect: 'manual',
  })
  const text = await res.text().catch(() => '')
  return { status: res.status, location: res.headers.get('location'), body: text.slice(0, 150) }
}

function makeForm(albumId: string) {
  const f = new FormData()
  f.append('file', new Blob([PNG_1X1], { type: 'image/png' }), 'test.png')
  f.append('id', albumId)
  f.append('name', 'api-test')
  return f
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q      = searchParams.get('q')
  const auth   = searchParams.get('auth')
  const upload = searchParams.get('upload')

  if (auth) {
    const t = await getOAuthToken()
    return NextResponse.json({
      exchangeOk: !!t,
      snippet: t ? `${t.slice(0, 6)}...${t.slice(-4)}` : null,
      ccPresent: !!CC_TOKEN,
    })
  }

  if (upload) {
    const tok = await getOAuthToken() ?? CC_TOKEN
    const results: Record<string, unknown> = {}

    // 1. GET probe — does /api/v1/upload even exist?
    results['GET_/api/v1/upload'] = await probe('GET', '/api/v1/upload', tok)

    // 2. Standard POST with multipart to /api/v1/upload
    results['POST_/api/v1/upload_multipart'] = await probe('POST', '/api/v1/upload', tok, makeForm(upload))

    // 3. POST to /api/v1/image (scheme-specific)
    results['POST_/api/v1/image_multipart'] = await probe('POST', '/api/v1/image', tok, makeForm(upload))

    // 4. POST with album in URL path
    results['POST_/api/v1/album/ID/upload'] = await probe('POST', `/api/v1/album/${upload}/upload`, tok, makeForm(upload))

    // 5. POST with query params instead of form fields + raw binary body
    const qPath = `/api/v1/upload?id=${upload}&name=api-test&scheme=image`
    results['POST_/api/v1/upload_queryparams'] = await probe('POST', qPath, tok, PNG_1X1 as unknown as string, { 'Content-Type': 'image/png' })

    // 6. POST JSON body to /api/v1/upload (two-step initiate?)
    results['POST_/api/v1/upload_json'] = await probe('POST', '/api/v1/upload', tok, JSON.stringify({ id: upload, name: 'api-test', scheme: 'image' }), { 'Content-Type': 'application/json' })

    // 7. CC_TOKEN directly for standard multipart
    if (CC_TOKEN) {
      results['POST_/api/v1/upload_cctoken'] = await probe('POST', '/api/v1/upload', CC_TOKEN, makeForm(upload))
    }

    return NextResponse.json(results)
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
