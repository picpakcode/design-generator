import { NextResponse } from 'next/server'
import { getFolders, searchAssets, getUserUploadToken } from '@/lib/canto'
import { createClient } from '@/lib/supabase/server'

const BASE   = process.env.CANTO_BASE_URL ?? ''
const APP_ID = process.env.CANTO_APP_ID  ?? ''
const SECRET = process.env.CANTO_APP_SECRET ?? ''

async function getCCToken(): Promise<string | null> {
  const res = await fetch('https://oauth.canto.com/oauth/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: APP_ID, client_secret: SECRET, scope: 'admin' }),
  })
  if (!res.ok) return null
  const d = await res.json() as Record<string, unknown>
  return (d.accessToken ?? d.access_token) as string | null
}

// Valid 1×1 black PNG
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const PNG_BYTES = Buffer.from(PNG_B64, 'base64')

function buildMultipart(albumId: string, extraFields?: Record<string, string>): { body: Buffer; contentType: string } {
  const boundary = `----CantoTestBoundary`
  const crlf = '\r\n'

  const textPart = (name: string, value: string) =>
    Buffer.from(`--${boundary}${crlf}Content-Disposition: form-data; name="${name}"${crlf}${crlf}${value}${crlf}`)

  const filePart = Buffer.concat([
    Buffer.from(`--${boundary}${crlf}Content-Disposition: form-data; name="file"; filename="test.png"${crlf}Content-Type: image/png${crlf}${crlf}`),
    PNG_BYTES,
    Buffer.from(crlf),
  ])

  const parts: Buffer[] = [
    filePart,
    textPart('name', 'api-test'),
    textPart('scheme', 'image'),
  ]
  if (extraFields) {
    for (const [k, v] of Object.entries(extraFields)) parts.push(textPart(k, v))
  }
  parts.push(Buffer.from(`--${boundary}--${crlf}`))

  const body = Buffer.concat(parts)
  return { body, contentType: `multipart/form-data; boundary=${boundary}` }
}

async function postRaw(
  path: string,
  token: string,
  body: Buffer,
  contentType: string,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType,
      'Accept': 'application/json',
      ...extraHeaders,
    },
    body: new Uint8Array(body),
    redirect: 'manual',
  })
  const text = await res.text().catch(() => '')
  const headers: Record<string, string> = {}
  res.headers.forEach((v, k) => { headers[k] = v })
  return { status: res.status, body: text.slice(0, 500), headers }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q      = searchParams.get('q')
  const auth   = searchParams.get('auth')
  const upload = searchParams.get('upload')  // album ID, uses CC token
  const uploadUser = searchParams.get('uploadUser')  // album ID, uses user OAuth token

  if (auth) {
    const t = await getCCToken()
    return NextResponse.json({ exchangeOk: !!t, snippet: t ? `${t.slice(0,6)}...${t.slice(-4)}` : null })
  }

  if (uploadUser) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })

    const userTok = await getUserUploadToken(user.id)
    if (!userTok) return NextResponse.json({ error: 'No stored user OAuth token' }, { status: 400 })

    const r: Record<string, unknown> = {
      token_prefix: userTok.slice(0, 8),
      album: uploadUser,
    }

    // Test 1: minimal — file only, no extra fields
    const bound1 = `----TestFileOnly`
    const crlf = '\r\n'
    const fileOnlyBody = Buffer.concat([
      Buffer.from(`--${bound1}${crlf}Content-Disposition: form-data; name="file"; filename="test.png"${crlf}Content-Type: image/png${crlf}${crlf}`),
      PNG_BYTES,
      Buffer.from(crlf),
      Buffer.from(`--${bound1}--${crlf}`),
    ])
    r['user_token_file_only'] = await postRaw(
      `/api/v1/album/${uploadUser}/upload`,
      userTok,
      fileOnlyBody,
      `multipart/form-data; boundary=${bound1}`,
    )

    // Test 2: file + name + scheme (standard fields)
    const { body: b2, contentType: ct2 } = buildMultipart(uploadUser)
    r['user_token_standard'] = await postRaw(
      `/api/v1/album/${uploadUser}/upload`,
      userTok,
      b2,
      ct2,
    )

    // Test 3: standard + Origin/Referer headers
    const { body: b3, contentType: ct3 } = buildMultipart(uploadUser)
    r['user_token_with_browser_headers'] = await postRaw(
      `/api/v1/album/${uploadUser}/upload`,
      userTok,
      b3,
      ct3,
      { Origin: BASE, Referer: `${BASE}/` },
    )

    return NextResponse.json(r)
  }

  if (upload) {
    const tok = await getCCToken()
    if (!tok) return NextResponse.json({ error: 'CC token exchange failed' }, { status: 500 })

    const r: Record<string, unknown> = { token_type: 'client_credentials', album: upload }

    // CC token: file only
    const bound1 = `----TestCCFileOnly`
    const crlf = '\r\n'
    const fileOnlyBody = Buffer.concat([
      Buffer.from(`--${bound1}${crlf}Content-Disposition: form-data; name="file"; filename="test.png"${crlf}Content-Type: image/png${crlf}${crlf}`),
      PNG_BYTES,
      Buffer.from(crlf),
      Buffer.from(`--${bound1}--${crlf}`),
    ])
    r['cc_token_file_only'] = await postRaw(`/api/v1/album/${upload}/upload`, tok, fileOnlyBody, `multipart/form-data; boundary=${bound1}`)

    // CC token: standard fields
    const { body: b2, contentType: ct2 } = buildMultipart(upload)
    r['cc_token_standard'] = await postRaw(`/api/v1/album/${upload}/upload`, tok, b2, ct2)

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
