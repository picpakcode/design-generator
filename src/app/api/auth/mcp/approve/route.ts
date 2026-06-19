// POST /api/auth/mcp/approve
// Called when the user clicks "Allow" on the /connect page.
// Generates a one-time auth code, stores it, and redirects to the client's redirect_uri.
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { randomBytes } from 'crypto'

export async function POST(req: Request) {
  const cookieStore = await cookies()

  // Verify the user is logged in
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json() as {
    redirect_uri: string
    state: string
    code_challenge: string
    code_challenge_method?: string
  }

  if (!body.redirect_uri || !body.code_challenge) {
    return Response.json({ error: 'Missing required params' }, { status: 400 })
  }

  const code = randomBytes(32).toString('hex')
  const admin = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin as any).from('mcp_auth_codes').insert({
    code,
    user_id:        user.id,
    redirect_uri:   body.redirect_uri,
    code_challenge: body.code_challenge,
  })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const redirectUrl = new URL(body.redirect_uri)
  redirectUrl.searchParams.set('code', code)
  if (body.state) redirectUrl.searchParams.set('state', body.state)

  return Response.json({ redirect_to: redirectUrl.toString() })
}
