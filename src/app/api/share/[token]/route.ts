import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

type ShareRow = { project_id: string; access_level: 'view' | 'edit'; is_public: boolean; created_by: string }
type ProjectRow = { id: string; name: string; state: unknown; template_state: unknown; updated_at: string }

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: share }: { data: ShareRow | null } = await supabase
    .from('project_shares')
    .select('project_id, access_level, is_public, created_by')
    .eq('token', params.token)
    .single()

  if (!share || !share.is_public) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: project }: { data: ProjectRow | null } = await supabase
    .from('projects')
    .select('id, name, state, template_state, updated_at')
    .eq('id', share.project_id)
    .single()

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const { data: owner } = await supabase.auth.admin.getUserById(share.created_by)

  return NextResponse.json({
    projectId: share.project_id,
    accessLevel: share.access_level,
    projectName: project.name,
    ownerEmail: owner?.user?.email ?? null,
    state: project.state,
    templateState: project.template_state ?? null,
    updatedAt: project.updated_at,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
