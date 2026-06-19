// Remote MCP server — JSON-RPC 2.0 over HTTP
// Each request is stateless. Auth via Bearer token from mcp_access_tokens table.
// Discoverable by claude.ai via /.well-known/oauth-authorization-server.
import { createAdminClient } from '@/lib/supabase/admin'
import { handleTool } from '@/lib/mcp-handlers'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, mcp-session-id',
}

// ─── Tool manifest ────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'list_projects',
    description: 'List all design projects. Returns id, name, type (amazon/shopify), and last updated time. Call this first to get a project_id for other tools.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_products',
    description: 'List products in a project that has Template Mode data (CSV uploaded). Returns each product\'s SKU, name, and slot count.',
    inputSchema: {
      type: 'object',
      properties: { project_id: { type: 'string', description: 'Project ID from list_projects' } },
      required: ['project_id'],
    },
  },
  {
    name: 'get_product_slots',
    description: 'Get the full slot content for one product — titles, descriptions, icon callouts, and any assigned photos.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        sku:        { type: 'string', description: 'Product SKU' },
      },
      required: ['project_id', 'sku'],
    },
  },
  {
    name: 'update_product_name',
    description: 'Rename a product — changes the product\'s display name in the product list and in export filenames. This is NOT the same as a slot title. Use this when the user asks to rename a product, change its label, or update what it\'s called in the sidebar.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string' },
        sku:        { type: 'string' },
        name:       { type: 'string', description: 'New product name' },
      },
      required: ['project_id', 'sku', 'name'],
    },
  },
  {
    name: 'update_product_slot',
    description: 'Update the COPY inside a design image slot — the heading text (title) and body copy (desc) that appear on an A+ or gallery image. This is NOT the product name. Use this only when the user wants to change what text is written inside a specific design image (a1, b1, c1… or g1, g2…).',
    inputSchema: {
      type: 'object',
      properties: {
        project_id:    { type: 'string' },
        sku:           { type: 'string' },
        slot_index:    { type: 'number', description: '0-based (a1=0, b1=1, c1=2… or g1=0, g2=1…)' },
        is_gallery:    { type: 'boolean', description: 'true for gallery slots, false for A+ slots' },
        title:         { type: 'string' },
        desc:          { type: 'string' },
        icon_callouts: { type: 'array', items: { type: 'string' }, maxItems: 4 },
      },
      required: ['project_id', 'sku', 'slot_index'],
    },
  },
  {
    name: 'search_canto',
    description: 'Search the Canto DAM for images by keyword or SKU. Lifestyle-tagged photos are ranked first. Returns id, name, preview_url, and full_url.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword, SKU, or product name fragment' },
        limit: { type: 'number', description: 'Max results (default 20, max 100)', default: 20 },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_canto_albums',
    description: 'List all Canto albums and folders. Use to find the right album ID when exporting.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'assign_photo',
    description: 'Assign a Canto image to a product slot as its photo. Run search_canto first to get the asset details.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id:       { type: 'string' },
        sku:              { type: 'string' },
        slot_index:       { type: 'number', default: 0 },
        is_gallery:       { type: 'boolean' },
        canto_asset_id:   { type: 'string' },
        canto_asset_name: { type: 'string' },
        canto_asset_url:  { type: 'string', description: 'full_url from search_canto' },
      },
      required: ['project_id', 'sku', 'canto_asset_id', 'canto_asset_name', 'canto_asset_url'],
    },
  },
]

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function getUserIdFromToken(req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data, error } = await db
    .from('mcp_access_tokens')
    .select('user_id')
    .eq('token', token)
    .single() as { data: { user_id: string } | null; error: unknown }

  if (error || !data) return null

  // Update last_used_at (fire-and-forget)
  db.from('mcp_access_tokens').update({ last_used_at: new Date().toISOString() }).eq('token', token)

  return data.user_id
}

// ─── JSON-RPC helpers ─────────────────────────────────────────────────────────

function rpcResult(id: unknown, result: unknown) {
  return Response.json({ jsonrpc: '2.0', id, result }, { headers: CORS })
}

function rpcError(id: unknown, code: number, message: string) {
  return Response.json({ jsonrpc: '2.0', id, error: { code, message } }, { headers: CORS })
}

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function OPTIONS() {
  return new Response(null, { headers: CORS })
}

export async function GET(req: Request) {
  const origin = new URL(req.url).origin
  return Response.json(
    { name: 'design-generator', version: '1.0.0', protocol: 'MCP/1.0', logo_uri: `${origin}/Favicon.png` },
    { headers: CORS },
  )
}

export async function POST(req: Request) {
  const userId = await getUserIdFromToken(req)
  if (!userId) {
    return Response.json(
      { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Unauthorized' } },
      { status: 401, headers: CORS },
    )
  }

  let body: { jsonrpc?: string; method?: string; params?: Record<string, unknown>; id?: unknown }
  try {
    body = await req.json()
  } catch {
    return rpcError(null, -32700, 'Parse error')
  }

  const { method, params = {}, id } = body

  switch (method) {
    case 'initialize':
      return rpcResult(id, {
        protocolVersion: '2024-11-05',
        capabilities:    { tools: {} },
        serverInfo:      { name: 'design-generator', version: '1.0.0' },
      })

    case 'notifications/initialized':
      return new Response(null, { status: 204, headers: CORS })

    case 'tools/list':
      return rpcResult(id, { tools: TOOLS })

    case 'tools/call': {
      const toolName = params.name as string
      const toolArgs = (params.arguments ?? {}) as Record<string, unknown>
      const result   = await handleTool(toolName, toolArgs, userId)
      return rpcResult(id, result)
    }

    case 'ping':
      return rpcResult(id, {})

    default:
      return rpcError(id, -32601, `Method not found: ${method}`)
  }
}
