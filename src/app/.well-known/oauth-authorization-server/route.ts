// OAuth 2.0 Authorization Server Metadata (RFC 8414)
// MCP clients discover our OAuth endpoints from here.
export async function GET(req: Request) {
  const origin = new URL(req.url).origin
  return Response.json({
    issuer:                             origin,
    authorization_endpoint:            `${origin}/connect`,
    token_endpoint:                     `${origin}/api/auth/mcp/token`,
    response_types_supported:          ['code'],
    grant_types_supported:             ['authorization_code'],
    code_challenge_methods_supported:  ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  }, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
}
