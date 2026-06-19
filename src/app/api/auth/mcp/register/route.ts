// POST /api/auth/mcp/register
// OAuth 2.0 Dynamic Client Registration (RFC 7591)
// claude.ai calls this before starting the OAuth flow to obtain a client_id.
// Auth is entirely PKCE-based so client_id is just an opaque identifier — we
// generate one per registration without persisting it.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return new Response(null, { headers: CORS })
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* empty body is fine */ }

  const origin = new URL(req.url).origin
  const client_id = crypto.randomUUID()

  return Response.json(
    {
      client_id,
      client_name:              'Design Generator',
      logo_uri:                 `${origin}/Favicon.png`,
      client_uri:               origin,
      client_secret_expires_at: 0,
      redirect_uris:            (body.redirect_uris as string[]) ?? [],
      grant_types:              ['authorization_code'],
      response_types:           ['code'],
      token_endpoint_auth_method: 'none',
      code_challenge_methods_supported: ['S256'],
    },
    { status: 201, headers: CORS },
  )
}
