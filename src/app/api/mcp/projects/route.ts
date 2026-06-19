import { checkMcpAuth, unauthorized } from '../_auth'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: Request) {
  if (!checkMcpAuth(req)) return unauthorized()

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('projects')
    .select('id, name, project_type, updated_at')
    .order('updated_at', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json(
    (data ?? []).map(p => ({
      id: p.id,
      name: p.name,
      type: p.project_type ?? 'amazon',
      updated_at: p.updated_at,
    })),
  )
}
