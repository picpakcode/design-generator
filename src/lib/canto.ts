// Server-only — never import from client components

const BASE    = process.env.CANTO_BASE_URL!          // https://docsdiesel.canto.com
const APP_ID  = process.env.CANTO_APP_ID!
const SECRET  = process.env.CANTO_APP_SECRET!
const CC_TOKEN = process.env.CANTO_CLIENT_CREDENTIALS_TOKEN!

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
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Canto auth failed ${res.status}: ${text}`)
  }

  // Canto returns camelCase fields and expiresIn as a string
  const data = await res.json() as { accessToken: string; expiresIn?: string | number }
  cachedToken = data.accessToken
  tokenExpiry = Date.now() + ((Number(data.expiresIn) || 3600) - 60) * 1000
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
): Promise<CantoUploadResult> {
  const token = await getAccessToken()
  const ext   = filename.split('.').pop()?.toLowerCase() ?? 'png'
  const mime  = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
  const name  = filename.includes('.') ? filename.slice(0, filename.lastIndexOf('.')) : filename

  const form = new FormData()
  const arrayBuf = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
  form.append('file', new Blob([arrayBuf], { type: mime }), filename)
  form.append('id',   albumId)
  form.append('name', name)
  if (meta?.description)    form.append('description', meta.description)
  if (meta?.keywords?.length) form.append('keyword', meta.keywords.join(','))
  if (meta?.tags?.length)     form.append('tag',     meta.tags.join(','))

  const res = await fetch(`${BASE}/api/v1/upload`, {
    method:   'POST',
    headers:  { Authorization: `Bearer ${token}` },
    body:     form,
    redirect: 'manual',   // don't silently follow auth redirects
  })

  console.log(`[canto/upload] ${filename} → album ${albumId} | status ${res.status} | content-type: ${res.headers.get('content-type')} | location: ${res.headers.get('location')}`)

  // 3xx → typically a redirect to the login page (auth token missing upload scope)
  if (res.status >= 300 && res.status < 400) {
    throw new Error(
      `Canto upload redirected (${res.status}) to ${res.headers.get('location') ?? '?'}. ` +
      `This usually means the OAuth app lacks the upload scope — enable it in Canto Settings → API.`
    )
  }

  if (!res.ok) {
    const text = await res.text()
    console.log(`[canto/upload] error body:`, text.slice(0, 600))
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Canto upload permission denied (${res.status}). ` +
        `Ensure your OAuth app has upload scope enabled in Canto admin settings.`
      )
    }
    throw new Error(`Canto upload failed ${res.status}: ${text.slice(0, 400)}`)
  }

  // Canto may return JSON, plain text, or HTML on success.
  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const json = await res.json() as CantoUploadResult
    console.log(`[canto/upload] success JSON:`, JSON.stringify(json).slice(0, 200))
    return json
  }
  const text = await res.text()
  console.log(`[canto/upload] success body (non-JSON):`, text.slice(0, 400))
  try { return JSON.parse(text) as CantoUploadResult } catch { /* not JSON */ }
  return { id: name }
}
