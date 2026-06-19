// Shared auth check for all /api/mcp/* routes.
// Set MCP_API_KEY in .env.local to enable access.
export function checkMcpAuth(req: Request): boolean {
  const key = process.env.MCP_API_KEY
  if (!key) return false
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${key}`
}

export function unauthorized() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 })
}
