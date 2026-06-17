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

// Minimal valid 1×1 white PNG
const PNG_1X1 = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
  'hex'
)

async function tryUpload(token: string, endpoint: string, albumId: string): Promise<{ status: number; location: string | null; body: string }> {
  const form = new FormData()
  form.append('file', new Blob([PNG_1X1], { type: 'image/png' }), 'test-1x1.png')
  form.append('id',   albumId)
  form.append('name', 'test-1x1')
  const res = await fetch(`${BASE}${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    redirect: 'manual',
  })
  const body = await res.text().catch(() => '')
  return { status: res.status, location: res.headers.get('location'), body: body.slice(0, 200) }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q      = searchParams.get('q')
  const auth   = searchParams.get('auth')
  const upload = searchParams.get('upload') // ?upload=ALBUM_ID

  if (auth) {
    const oauthToken = await getOAuthToken()
    return NextResponse.json({
      exchangeOk: !!oauthToken,
      oauthTokenSnippet: oauthToken ? `${oauthToken.slice(0, 6)}...${oauthToken.slice(-4)}` : null,
      ccTokenSnippet: CC_TOKEN ? `${CC_TOKEN.slice(0, 6)}...${CC_TOKEN.slice(-4)}` : null,
      appIdPresent: !!APP_ID,
    })
  }

  if (upload) {
    const oauthToken = await getOAuthToken()
    const results: Record<string, unknown> = {}

    // Try multiple endpoint variants with OAuth token
    if (oauthToken) {
      results['oauth_/api/v1/upload']  = await tryUpload(oauthToken, '/api/v1/upload', upload)
      results['oauth_/api/v1/image']   = await tryUpload(oauthToken, '/api/v1/image', upload)
    }

    // Try same endpoints with CC_TOKEN
    if (CC_TOKEN) {
      results['cc_/api/v1/upload'] = await tryUpload(CC_TOKEN, '/api/v1/upload', upload)
      results['cc_/api/v1/image']  = await tryUpload(CC_TOKEN, '/api/v1/image', upload)
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
