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

// ─── Upload (AWS S3 pre-signed POST flow) ────────────────────────────────────
//
// Canto upload is a 2-step process:
//   1. GET /api/v1/upload/setting  → AWS pre-signed credentials (valid 5h, cache them)
//   2. POST to the returned S3 URL → no Authorization header, uses pre-signed policy
//
// The `key` field returned by /upload/setting contains "${filename}" as a placeholder.

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

interface CantoUploadSettings {
  url:                    string  // S3 bucket URL
  key:                    string  // S3 key template — contains "${filename}"
  Policy:                 string
  acl:                    string
  // V2 signing (standard .canto.com domains)
  AWSAccessKeyId?:        string
  Signature?:             string
  // V4 signing (EU/CA domains: .de, .ca.canto.com)
  'x-amz-algorithm'?:    string
  'x-amz-credential'?:   string
  'x-amz-date'?:         string
  'x-amz-Signature'?:    string
  // Pre-filled metadata (overridden per upload)
  'x-amz-meta-file_name': string
  'x-amz-meta-tag':       string
  'x-amz-meta-scheme':    string
  'x-amz-meta-id':        string
  'x-amz-meta-album_id':  string
}

let cachedUploadSettings: CantoUploadSettings | null = null
let uploadSettingsExpiry = 0

async function getUploadSettings(token: string): Promise<CantoUploadSettings> {
  if (cachedUploadSettings && Date.now() < uploadSettingsExpiry) return cachedUploadSettings

  const res = await fetch(`${BASE}/api/v1/upload/setting`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Canto upload/setting ${res.status}: ${text}`)
  }

  const settings = await res.json() as CantoUploadSettings
  console.log(`[canto/upload-settings] fetched | S3: ${settings.url?.slice(0, 60)} | signing: ${settings['x-amz-algorithm'] ? 'V4' : 'V2'}`)
  cachedUploadSettings = settings
  uploadSettingsExpiry = Date.now() + (4 * 60 + 50) * 60 * 1000  // 4h50m (settings valid 5h)
  return settings
}

export async function uploadAsset(
  buffer:   Buffer,
  filename: string,
  albumId:  string,
  meta?:    CantoUploadMeta,
  userId?:  string,
): Promise<CantoUploadResult> {
  // Token for /upload/setting request (user OAuth preferred for attribution)
  let token: string
  if (userId) {
    const userTok = await getUserUploadToken(userId)
    token = userTok ?? await getAccessToken()
    console.log(`[canto/upload] token: ${userTok ? 'user OAuth' : 'CC fallback'}`)
  } else {
    token = await getAccessToken()
  }

  const ext     = filename.split('.').pop()?.toLowerCase() ?? 'png'
  const mime    = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
  const rawName = filename.includes('.') ? filename.slice(0, filename.lastIndexOf('.')) : filename
  const safeName = rawName.replace(/['"]/g, '').replace(/[^\w\s\-().]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
  // Canto docs: use unique filenames to avoid S3 conflicts; timestamp ensures uniqueness
  const uniqueFilename = `${safeName}-${Date.now()}.${ext}`

  // Step 1: Get upload settings (cached ~5 hours)
  const settings = await getUploadSettings(token)

  // Step 2: POST directly to S3 using pre-signed credentials (NO Authorization header)
  // The key template has "${filename}" which we substitute with our actual filename.
  // Retry up to 3 times on transient S3 500/503 errors (AWS recommendation).
  const fileBlob = new Blob([new Uint8Array(buffer)], { type: mime })
  const buildForm = (fname: string): FormData => {
    const s3Key = settings.key.replace('${filename}', fname)
    const f = new FormData()
    f.append('key', s3Key)
    f.append('acl', settings.acl)
    if (settings['x-amz-algorithm']) {
      // V4 signing (EU / CA tenant domains)
      f.append('Policy',            settings.Policy)
      f.append('x-amz-algorithm',   settings['x-amz-algorithm']!)
      f.append('x-amz-credential',  settings['x-amz-credential']!)
      f.append('x-amz-date',        settings['x-amz-date']!)
      f.append('x-amz-Signature',   settings['x-amz-Signature']!)
    } else {
      // V2 signing (standard .canto.com US domain)
      f.append('AWSAccessKeyId', settings.AWSAccessKeyId!)
      f.append('Policy',         settings.Policy)
      f.append('Signature',      settings.Signature!)
    }
    f.append('x-amz-meta-file_name', fname)
    f.append('x-amz-meta-tag',       meta?.tags?.join(',') ?? '')
    f.append('x-amz-meta-scheme',    '')  // empty = new asset
    f.append('x-amz-meta-id',        '')  // empty = new asset
    f.append('x-amz-meta-album_id',  albumId)
    f.append('file', fileBlob, fname)     // file MUST be last (AWS requirement)
    return f
  }

  let lastError = ''
  for (let attempt = 1; attempt <= 3; attempt++) {
    // Use a fresh timestamp per attempt so retries never collide with the prior attempt's key
    const fname = attempt === 1 ? uniqueFilename : `${safeName}-${Date.now()}.${ext}`
    const s3Res = await fetch(settings.url, { method: 'POST', body: buildForm(fname) })
    const s3Body = await s3Res.text()
    console.log(`[canto/upload] "${safeName}" → album ${albumId} | S3 ${s3Res.status} | attempt ${attempt} | ${s3Body.slice(0, 200)}`)

    if (s3Res.status === 204) return { id: fname, name: safeName }

    if (s3Res.status === 403) {
      cachedUploadSettings = null
      uploadSettingsExpiry = 0
      throw new Error(`Canto S3 upload forbidden (403) — credentials expired`)
    }

    if ((s3Res.status === 500 || s3Res.status === 503) && attempt < 3) {
      await new Promise(r => setTimeout(r, 1000 * attempt))  // 1s then 2s backoff
      continue
    }

    lastError = `Canto S3 upload failed ${s3Res.status}: ${s3Body.slice(0, 400)}`
  }
  throw new Error(lastError)
}
