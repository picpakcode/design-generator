import { NextResponse } from 'next/server'
import { getFolders, searchAssets } from '@/lib/canto'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q    = searchParams.get('q')
  const auth = searchParams.get('auth')

  // ?auth=1 — expose raw OAuth exchange response for diagnostics
  if (auth) {
    const APP_ID = process.env.CANTO_APP_ID ?? '(missing)'
    const SECRET = process.env.CANTO_APP_SECRET ?? ''
    const CC_TOKEN = process.env.CANTO_CLIENT_CREDENTIALS_TOKEN ?? '(missing)'
    try {
      const res = await fetch('https://oauth.canto.com/oauth/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: APP_ID,
          client_secret: SECRET,
        }),
      })
      const text = await res.text()
      let parsed: unknown = null
      try { parsed = JSON.parse(text) } catch { /* not json */ }
      return NextResponse.json({
        status: res.status,
        ok: res.ok,
        rawKeys: parsed && typeof parsed === 'object' ? Object.keys(parsed as object) : null,
        hasAccessToken: parsed && typeof parsed === 'object' ? 'accessToken' in (parsed as object) : false,
        hasAccess_token: parsed && typeof parsed === 'object' ? 'access_token' in (parsed as object) : false,
        ccTokenPresent: !!CC_TOKEN && CC_TOKEN !== '(missing)',
        appIdPresent: !!APP_ID && APP_ID !== '(missing)',
        snippet: text.slice(0, 120),
      })
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 500 })
    }
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
