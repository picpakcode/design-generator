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
  children?: CantoFolder[]
}

function flattenTree(nodes: CantoFolder[]): CantoFolder[] {
  const out: CantoFolder[] = []
  for (const n of nodes) {
    out.push({ id: n.id, name: n.name, namePath: n.namePath })
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
