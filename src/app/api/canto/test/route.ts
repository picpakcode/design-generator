import { NextResponse } from 'next/server'
import { getFolders, searchAssets } from '@/lib/canto'

const BASE   = process.env.CANTO_BASE_URL ?? ''
const APP_ID = process.env.CANTO_APP_ID  ?? ''
const SECRET = process.env.CANTO_APP_SECRET ?? ''

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

// Valid 1×1 black PNG
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const PNG_BYTES = Buffer.from(PNG_B64, 'base64')

// Hand-rolled multipart — bypasses any Node.js FormData serialization quirks
function buildMultipart(albumId: string): { body: Buffer; contentType: string } {
  const boundary = `----CantoUploadBoundary${Date.now()}`
  const crlf = '\r\n'

  const textPart = (name: string, value: string) =>
    Buffer.from(`--${boundary}${crlf}Content-Disposition: form-data; name="${name}"${crlf}${crlf}${value}${crlf}`)

  const filePart = Buffer.concat([
    Buffer.from(`--${boundary}${crlf}Content-Disposition: form-data; name="file"; filename="test.png"${crlf}Content-Type: image/png${crlf}${crlf}`),
    PNG_BYTES,
    Buffer.from(crlf),
  ])

  const closing = Buffer.from(`--${boundary}--${crlf}`)

  const body = Buffer.concat([
    filePart,
    textPart('name', 'api-test'),
    textPart('id', albumId),
    textPart('scheme', 'image'),
    closing,
  ])
  return { body, contentType: `multipart/form-data; boundary=${boundary}` }
}

async function postRaw(path: string, token: string, body: Buffer, contentType: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
    body: new Uint8Array(body),
    redirect: 'manual',
  })
  const text = await res.text().catch(() => '')
  return { status: res.status, body: text.slice(0, 400) }
}

async function postForm(path: string, token: string, form: FormData): Promise<{ status: number; body: string }> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
    redirect: 'manual',
  })
  const text = await res.text().catch(() => '')
  return { status: res.status, body: text.slice(0, 400) }
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
    const tok = await getOAuthToken()
    if (!tok) return NextResponse.json({ error: 'OAuth exchange failed' }, { status: 500 })

    const r: Record<string, unknown> = {}

    // 1. Hand-rolled multipart to /api/v1/album/{id}/upload
    const { body: mp1, contentType: ct1 } = buildMultipart(upload)
    r['manual_multipart_album_path'] = await postRaw(`/api/v1/album/${upload}/upload`, tok, mp1, ct1)

    // 2. Hand-rolled multipart to /api/v1/upload (original endpoint — maybe now works with right token?)
    const { body: mp2, contentType: ct2 } = buildMultipart(upload)
    r['manual_multipart_v1_upload'] = await postRaw('/api/v1/upload', tok, mp2, ct2)

    // 3. FormData to /api/v1/album/{id}/upload for comparison
    const f = new FormData()
    f.append('file', new Blob([PNG_BYTES], { type: 'image/png' }), 'test.png')
    f.append('name', 'api-test')
    f.append('id', upload)
    r['formdata_album_path'] = await postForm(`/api/v1/album/${upload}/upload`, tok, f)

    // 4. Text-only (no file) — does Canto describe what's missing?
    const { body: mpText, contentType: ctText } = (() => {
      const boundary = '----TextOnly'
      const crlf = '\r\n'
      const b = Buffer.concat([
        Buffer.from(`--${boundary}${crlf}Content-Disposition: form-data; name="id"${crlf}${crlf}${upload}${crlf}`),
        Buffer.from(`--${boundary}${crlf}Content-Disposition: form-data; name="name"${crlf}${crlf}api-test${crlf}`),
        Buffer.from(`--${boundary}--${crlf}`),
      ])
      return { body: b, contentType: `multipart/form-data; boundary=${boundary}` }
    })()
    r['text_fields_only_no_file'] = await postRaw(`/api/v1/album/${upload}/upload`, tok, mpText, ctText)

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
