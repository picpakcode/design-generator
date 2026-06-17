// Server-only — never import from client components

const BASE    = process.env.CANTO_BASE_URL!          // https://docsdiesel.canto.com
const APP_ID  = process.env.CANTO_APP_ID!
const SECRET  = process.env.CANTO_APP_SECRET!
const CC_TOKEN = process.env.CANTO_CLIENT_CREDENTIALS_TOKEN ?? ''

// ─── Token cache ─────────────────────────────────────────────────────────────

let cachedToken: string | null = null
let tokenExpiry = 0

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken

  const res = await fetch('https://oauth.canto.com/oauth/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     APP_ID,
      client_secret: SECRET,
      scope:         'admin',
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    // Fall back to pre-generated token if OAuth exchange fails
    if (CC_TOKEN) return CC_TOKEN
    throw new Error(`Canto auth failed ${res.status}: ${text}`)
  }

  // Canto may return camelCase (accessToken) or standard snake_case (access_token)
  const data = await res.json() as { accessToken?: string; access_token?: string; expiresIn?: string | number; expires_in?: string | number }
  const token = data.accessToken ?? data.access_token
  if (!token) {
    if (CC_TOKEN) return CC_TOKEN
    throw new Error(`Canto auth: token exchange succeeded but response had no token. Keys: ${Object.keys(data).join(', ')}`)
  }
  cachedToken = token
  const expiresIn = data.expiresIn ?? data.expires_in
  tokenExpiry = Date.now() + ((Number(expiresIn) || 3600) - 60) * 1000
  return cachedToken
}

// ─── API helpers ─────────────────────────────────────────────────────────────

async function cantoFetch(path: string, params?: Record<string, string>) {
  const token = await getAccessToken()
  const url = new URL(`${BASE}/api/v1${path}`)
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Canto ${path} failed ${res.status}: ${text}`)
  }
  return res.json()
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface CantoAsset {
  id: string
  name: string
  tag: string[]
  keyword: string[]
  scheme: string          // 'image' | 'video' | etc.
  url: {
    directUrlOriginal: string
    directUrlPreview:  string
    preview:           string
  }
  width:  number
  height: number
}

export async function searchAssets(query: string, limit = 20): Promise<CantoAsset[]> {
  const data = await cantoFetch('/search', {
    keyword:      query,
    limit:        String(limit),
    sortBy:       'name',
    sortDirection: 'ascending',
  })
  return (data.results ?? []) as CantoAsset[]
}

export interface CantoFolder {
  id: string
  name: string
  namePath: string
  scheme?: string     // 'folder' | 'album' — only albums accept uploads
  children?: CantoFolder[]
}

function flattenTree(nodes: CantoFolder[]): CantoFolder[] {
  const out: CantoFolder[] = []
  for (const n of nodes) {
    out.push({ id: n.id, name: n.name, namePath: n.namePath, scheme: n.scheme })
    if (n.children?.length) out.push(...flattenTree(n.children))
  }
  return out
}

export async function getFolders(): Promise<CantoFolder[]> {
  const data = await cantoFetch('/tree')
  return flattenTree((data.results ?? []) as CantoFolder[])
}

// Canto returns assets under different keys depending on endpoint version
function extractAssets(data: Record<string, unknown>): CantoAsset[] {
  for (const key of ['results', 'images', 'content', 'items', 'assets']) {
    const val = data[key]
    if (Array.isArray(val)) return val as CantoAsset[]
  }
  if (Array.isArray(data)) return data as CantoAsset[]
  return []
}

export async function getAlbumContents(folderId: string, limit = 100): Promise<CantoAsset[]> {
  const params = { limit: String(limit), sortBy: 'name', sortDirection: 'ascending' }

  // Try /folder/ first (works for folder-type IDs like NHMFF)
  try {
    const data = await cantoFetch(`/folder/${folderId}`, params)
    console.log(`[canto] /folder/${folderId} top-level keys:`, Object.keys(data), '| results len:', Array.isArray(data.results) ? data.results.length : typeof data.results)
    const assets = extractAssets(data as Record<string, unknown>)
    if (assets.length > 0) return assets
  } catch (e) {
    console.warn(`[canto] /folder/${folderId} failed:`, String(e))
  }

  // Fallback: try /album/ (album-type IDs like QH34D may use this endpoint)
  try {
    const data = await cantoFetch(`/album/${folderId}`, params)
    console.log(`[canto] /album/${folderId} top-level keys:`, Object.keys(data))
    return extractAssets(data as Record<string, unknown>)
  } catch (e) {
    console.warn(`[canto] /album/${folderId} also failed:`, String(e))
  }

  return []
}

// Proxy an asset through the server so html-to-image doesn't hit CORS
export function proxyUrl(directUrl: string): string {
  return `/api/canto/proxy?url=${encodeURIComponent(directUrl)}`
}

// ─── User OAuth token (required for uploads) ──────────────────────────────────

export async function getUserUploadToken(userId: string): Promise<string | null> {
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('canto_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    console.log(`[canto/token] no stored token for user ${userId}:`, error?.message)
    return null
  }

  const expiresAt = new Date(data.expires_at).getTime()
  const valid = expiresAt > Date.now()
  console.log(`[canto/token] found token for user ${userId} | expires ${data.expires_at} | valid=${valid} | prefix=${data.access_token.slice(0,8)}...`)

  if (valid) return data.access_token

  if (!data.refresh_token) return null

  // Refresh the token
  const res = await fetch('https://oauth.canto.com/oauth/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: data.refresh_token,
      client_id:     APP_ID,
      client_secret: SECRET,
    }),
  })
  if (!res.ok) return null

  const refreshed = await res.json() as {
    accessToken?: string;  access_token?: string
    refreshToken?: string; refresh_token?: string
    expiresIn?: number;    expires_in?: number
  }
  const newToken   = refreshed.accessToken  ?? refreshed.access_token
  const newRefresh = refreshed.refreshToken ?? refreshed.refresh_token ?? data.refresh_token
  const newExpires = Number(refreshed.expiresIn ?? refreshed.expires_in ?? 3600)
  if (!newToken) return null

  const newExpiresAt = new Date(Date.now() + (newExpires - 60) * 1000).toISOString()
  await admin
    .from('canto_tokens')
    .update({ access_token: newToken, refresh_token: newRefresh, expires_at: newExpiresAt, updated_at: new Date().toISOString() })
    .eq('user_id', userId)

  return newToken
}

// ─── Upload ───────────────────────────────────────────────────────────────────

export interface CantoUploadMeta {
  tags?:        string[]
  keywords?:    string[]
  description?: string
}

export interface CantoUploadResult {
  id:      string
  name?:   string
  scheme?: string
}

export async function uploadAsset(
  buffer:   Buffer,
  filename: string,  // e.g. "widgetpro-a1-desktop.png"
  albumId:  string,
  meta?:    CantoUploadMeta,
  userId?:  string,
): Promise<CantoUploadResult> {
  let token: string
  if (userId) {
    const userTok = await getUserUploadToken(userId)
    if (userTok) {
      console.log(`[canto/upload] using OAuth user token for ${userId}`)
      token = userTok
    } else {
      console.log(`[canto/upload] no user token found, falling back to client credentials (upload will likely fail)`)
      token = await getAccessToken()
    }
  } else {
    token = await getAccessToken()
  }
  const ext  = filename.split('.').pop()?.toLowerCase() ?? 'png'
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`

  // Sanitize: strip special chars Canto dislikes, cap name at 100 chars
  const rawName = filename.includes('.') ? filename.slice(0, filename.lastIndexOf('.')) : filename
  const safeName = rawName.replace(/['"]/g, '').replace(/[^\w\s\-().]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)
  const safeFilename = `${safeName}.${ext}`

  // Build raw multipart instead of using Node.js FormData — avoids serialization quirks
  const boundary = `----CantoUpload${Math.random().toString(36).slice(2, 10)}`
  const CRLF = '\r\n'
  const field = (name: string, value: string) =>
    Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}${value}${CRLF}`)

  const fileBytes = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const filePart = Buffer.concat([
    Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${safeFilename}"${CRLF}Content-Type: ${mime}${CRLF}${CRLF}`),
    Buffer.from(fileBytes),
    Buffer.from(CRLF),
  ])

  const parts: Buffer[] = [
    filePart,
    field('name',   safeName),
    field('scheme', 'image'),
  ]
  if (meta?.description)      parts.push(field('description', meta.description))
  if (meta?.keywords?.length) parts.push(field('keyword',     meta.keywords.join(',')))
  if (meta?.tags?.length)     parts.push(field('tag',         meta.tags.join(',')))
  parts.push(Buffer.from(`--${boundary}--${CRLF}`))

  const body = Buffer.concat(parts)

  const res = await fetch(`${BASE}/api/v1/album/${albumId}/upload`, {
    method:   'POST',
    headers:  { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body:     new Uint8Array(body),
    redirect: 'manual',
  })

  // Single log line per upload: status + body combined to stay within Vercel's 50-line cap
  const responseText = await res.text()
  console.log(`[canto/upload] "${safeName}" → album ${albumId} | status ${res.status} | body: ${responseText.slice(0, 300)}`)

  // 3xx — unexpected redirect
  if (res.status >= 300 && res.status < 400) {
    throw new Error(`Canto upload redirected (${res.status}) to ${res.headers.get('location') ?? '?'}.`)
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Canto upload permission denied (${res.status}): ${responseText.slice(0, 200)}`)
    }
    throw new Error(`Canto upload failed ${res.status}: ${responseText.slice(0, 400)}`)
  }

  // responseText already read above — parse if JSON
  try { return JSON.parse(responseText) as CantoUploadResult } catch { /* not JSON */ }
  return { id: safeName }
}
