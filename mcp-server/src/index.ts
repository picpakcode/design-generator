import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const APP_URL = (process.env.DESIGN_GENERATOR_URL ?? 'http://localhost:3000').replace(/\/$/, '')
const API_KEY = process.env.MCP_API_KEY ?? ''
const USER_ID = process.env.USER_ID ?? ''

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function api<T = unknown>(
  path: string,
  opts?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${APP_URL}${path}`, {
    method: opts?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'X-User-Id': USER_ID,
    },
    ...(opts?.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${path} failed ${res.status}: ${text}`)
  }
  return res.json() as T
}

function ok(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

function err(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e)
  return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true }
}

// ─── Server setup ─────────────────────────────────────────────────────────────

const server = new Server(
  { name: 'design-generator', version: '1.0.0' },
  { capabilities: { tools: {} } },
)

// ─── Tool definitions ─────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'list_projects',
      description:
        'List all design projects. Returns id, name, type (amazon/shopify), and last updated time. Call this first to get a project_id for other tools.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'list_products',
      description:
        'List products in a project that has Template Mode data (a CSV was uploaded). Returns each product\'s SKU, name, and number of A+ and gallery slots.',
      inputSchema: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: 'Project ID from list_projects' },
        },
        required: ['project_id'],
      },
    },
    {
      name: 'get_product_slots',
      description:
        'Get the full slot content for one product — titles, descriptions, icon callouts, and any assigned Canto photos.',
      inputSchema: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: 'Project ID' },
          sku: { type: 'string', description: 'Product SKU' },
        },
        required: ['project_id', 'sku'],
      },
    },
    {
      name: 'update_product_slot',
      description:
        'Update text content in a product slot. Provide only the fields you want to change — omitted fields are left as-is. A+ slots use slot_index 0–7 (a1=0, b1=1, …). Gallery slots use slot_index 0–N with is_gallery: true.',
      inputSchema: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: 'Project ID' },
          sku: { type: 'string', description: 'Product SKU' },
          slot_index: {
            type: 'number',
            description: '0-based slot index (a1=0, b1=1, c1=2, … for A+; g1=0, g2=1, … for gallery)',
          },
          is_gallery: {
            type: 'boolean',
            description: 'true to target a gallery slot (g1, g2…), false for A+ slots (default: false)',
          },
          title: { type: 'string', description: 'New title' },
          desc: { type: 'string', description: 'New description / body copy' },
          icon_callouts: {
            type: 'array',
            items: { type: 'string' },
            maxItems: 4,
            description: 'Up to 4 icon callout labels',
          },
        },
        required: ['project_id', 'sku', 'slot_index'],
      },
    },
    {
      name: 'search_canto',
      description:
        'Search the Canto DAM for images. SKU-based search is most accurate (exact tag match). Lifestyle-tagged photos are ranked first. Returns id, name, and a preview URL.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Keyword, SKU, or product name fragment',
          },
          limit: {
            type: 'number',
            description: 'Max results (default 20, max 100)',
            default: 20,
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'list_canto_albums',
      description:
        'List all Canto albums and folders. Use to find the right album ID when exporting.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'assign_photo',
      description:
        'Assign a Canto image to a product slot as its photo asset. Run search_canto first to get the asset details. The slot_index selects which A+ or gallery slot gets the photo.',
      inputSchema: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: 'Project ID' },
          sku: { type: 'string', description: 'Product SKU' },
          slot_index: {
            type: 'number',
            description: '0-based slot index',
            default: 0,
          },
          is_gallery: {
            type: 'boolean',
            description: 'true for gallery slot, false for A+ slot (default: false)',
          },
          canto_asset_id: { type: 'string', description: 'Asset id from search_canto' },
          canto_asset_name: { type: 'string', description: 'Asset name from search_canto' },
          canto_asset_url: {
            type: 'string',
            description: 'directUrlOriginal from search_canto (full-res URL)',
          },
        },
        required: ['project_id', 'sku', 'canto_asset_id', 'canto_asset_name', 'canto_asset_url'],
      },
    },
  ],
}))

// ─── Tool handlers ────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  // args is Record<string, unknown> from the SDK
  const a = (args ?? {}) as Record<string, unknown>

  try {
    switch (name) {
      case 'list_projects': {
        const data = await api('/api/mcp/projects')
        return ok(JSON.stringify(data, null, 2))
      }

      case 'list_products': {
        const data = await api(`/api/mcp/projects/${a.project_id}/products`)
        return ok(JSON.stringify(data, null, 2))
      }

      case 'get_product_slots': {
        const data = await api(`/api/mcp/projects/${a.project_id}/products/${encodeURIComponent(String(a.sku))}`)
        return ok(JSON.stringify(data, null, 2))
      }

      case 'update_product_slot': {
        const body: Record<string, unknown> = {
          slot_index: a.slot_index,
          is_gallery: a.is_gallery ?? false,
        }
        if (a.title !== undefined) body.title = a.title
        if (a.desc !== undefined) body.desc = a.desc
        if (a.icon_callouts !== undefined) body.icon_callouts = a.icon_callouts

        const data = await api(
          `/api/mcp/projects/${a.project_id}/products/${encodeURIComponent(String(a.sku))}`,
          { method: 'PATCH', body },
        )
        return ok(JSON.stringify(data, null, 2))
      }

      case 'search_canto': {
        const limit = Math.min(Number(a.limit ?? 20), 100)
        const data = await api(`/api/mcp/canto/search?q=${encodeURIComponent(String(a.query))}&limit=${limit}`)
        return ok(JSON.stringify(data, null, 2))
      }

      case 'list_canto_albums': {
        const data = await api('/api/mcp/canto/albums')
        return ok(JSON.stringify(data, null, 2))
      }

      case 'assign_photo': {
        const body = {
          slot_index: a.slot_index ?? 0,
          is_gallery: a.is_gallery ?? false,
          canto_asset_id: a.canto_asset_id,
          canto_asset_name: a.canto_asset_name,
          canto_asset_url: a.canto_asset_url,
        }
        const data = await api(
          `/api/mcp/projects/${a.project_id}/products/${encodeURIComponent(String(a.sku))}/photo`,
          { method: 'PATCH', body },
        )
        return ok(JSON.stringify(data, null, 2))
      }

      default:
        return err(`Unknown tool: ${name}`)
    }
  } catch (e) {
    return err(e)
  }
})

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
