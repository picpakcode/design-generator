import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Visit this endpoint in your browser while logged into the app.
// It returns your user ID to put in the Claude Desktop MCP config.
export async function GET() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Not logged in' }, { status: 401 })

  return Response.json({ user_id: user.id, email: user.email })
}
