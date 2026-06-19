// Shared auth check for all /api/mcp/* routes.
// Set MCP_API_KEY in .env.local to enable access.
export function checkMcpAuth(req: Request): boolean {
  const key = process.env.MCP_API_KEY
  if (!key) return false
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${key}`
}

// Extract the user ID passed from the MCP server via X-User-Id header.
export function getMcpUserId(req: Request): string | null {
  return req.headers.get('x-user-id') ?? null
}

export function unauthorized(msg = 'Unauthorized') {
  return Response.json({ error: msg }, { status: 401 })
}
