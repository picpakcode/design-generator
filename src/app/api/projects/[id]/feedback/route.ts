import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const COMMENT_FIELDS = 'id, block_id, parent_id, author_name, author_type, body, created_at, resolved_at, resolved_by, reactions'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: project } = await admin.from('projects').select('user_id').eq('id', params.id).single()
  if (!project || project.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const [commentsRes, approvalsRes] = await Promise.all([
    admin.from('project_comments')
      .select(COMMENT_FIELDS)
      .eq('project_id', params.id)
      .order('created_at', { ascending: true }),
    admin.from('block_approvals')
      .select('id, block_id, author_name, status, created_at')
      .eq('project_id', params.id)
      .order('created_at', { ascending: true }),
  ])

  return NextResponse.json({
    comments:  commentsRes.data  ?? [],
    approvals: approvalsRes.data ?? [],
  })
}
