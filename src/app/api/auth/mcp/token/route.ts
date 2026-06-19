// POST /api/auth/mcp/token
// Exchanges a one-time auth code for a long-lived access token.
// Validates PKCE (S256) before issuing the token.
import { createAdminClient } from '@/lib/supabase/admin'
import { createHash, randomBytes } from 'crypto'

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function verifyS256(verifier: string, challenge: string): boolean {
  const computed = base64url(createHash('sha256').update(verifier).digest())
  return computed === challenge
}

export async function POST(req: Request) {
  // Accept both JSON and form-encoded bodies (MCP clients may use either)
  let params: Record<string, string>
  const ct = req.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) {
    params = await req.json()
  } else {
    const text = await req.text()
    params = Object.fromEntries(new URLSearchParams(text))
  }

  const { grant_type, code, redirect_uri, code_verifier } = params

  if (grant_type !== 'authorization_code') {
    return Response.json({ error: 'unsupported_grant_type' }, { status: 400 })
  }
  if (!code || !redirect_uri || !code_verifier) {
    return Response.json({ error: 'invalid_request' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Load the auth code
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = admin as any
  const { data: row, error } = await db
    .from('mcp_auth_codes')
    .select('*')
    .eq('code', code)
    .eq('used', false)
    .single() as { data: { user_id: string; expires_at: string; redirect_uri: string; code_challenge: string } | null; error: unknown }

  if (error || !row) {
    return Response.json({ error: 'invalid_grant', error_description: 'Code not found or already used' }, { status: 400 })
  }

  // Check expiry
  if (new Date(row.expires_at) < new Date()) {
    return Response.json({ error: 'invalid_grant', error_description: 'Code expired' }, { status: 400 })
  }

  // Validate redirect_uri matches
  if (row.redirect_uri !== redirect_uri) {
    return Response.json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' }, { status: 400 })
  }

  // Validate PKCE
  if (!verifyS256(code_verifier, row.code_challenge)) {
    return Response.json({ error: 'invalid_grant', error_description: 'PKCE verification failed' }, { status: 400 })
  }

  // Mark code as used
  await db.from('mcp_auth_codes').update({ used: true }).eq('code', code)

  // Issue access token
  const token = randomBytes(32).toString('hex')
  const { error: insertErr } = await db.from('mcp_access_tokens').insert({
    token,
    user_id: row.user_id,
  })

  if (insertErr) {
    return Response.json({ error: 'server_error' }, { status: 500 })
  }

  return Response.json({
    access_token: token,
    token_type:   'bearer',
  }, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
