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

// Valid 1×1 black PNG (known-good)
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

async function probe(method: string, path: string, token: string, body?: FormData, extraHeaders?: Record<string, string>): Promise<{ status: number; location: string | null; body: string }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
    body,
    redirect: 'manual',
  })
  const text = await res.text().catch(() => '')
  return { status: res.status, location: res.headers.get('location'), body: text.slice(0, 300) }
}

function makeForm(albumId: string, withId = false) {
  const f = new FormData()
  f.append('file', new Blob([PNG_1X1], { type: 'image/png' }), 'api-test.png')
  f.append('name', 'api-test')
  f.append('scheme', 'image')
  if (withId) f.append('id', albumId)
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

    // Focus on the working endpoint: /api/v1/album/{id}/upload
    // Try variations of form fields
    results['album_path_no_id_field']   = await probe('POST', `/api/v1/album/${upload}/upload`, tok, makeForm(upload, false))
    results['album_path_with_id_field'] = await probe('POST', `/api/v1/album/${upload}/upload`, tok, makeForm(upload, true))

    // Also try /api/v1/album/{id} without /upload suffix
    results['album_path_no_suffix']     = await probe('POST', `/api/v1/album/${upload}`, tok, makeForm(upload, false))

    // Try with CC_TOKEN directly
    if (CC_TOKEN) {
      results['album_path_cc_token'] = await probe('POST', `/api/v1/album/${upload}/upload`, CC_TOKEN, makeForm(upload, false))
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
