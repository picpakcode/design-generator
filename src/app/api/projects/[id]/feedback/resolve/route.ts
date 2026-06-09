import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any

  const { data: project } = await admin.from('projects').select('user_id').eq('id', params.id).single()
  if (!project || project.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const { commentId } = body as { commentId: string }
  if (!commentId) return NextResponse.json({ error: 'commentId required' }, { status: 400 })

  const { data: comment } = await admin
    .from('project_comments')
    .select('resolved_at')
    .eq('id', commentId)
    .single()

  const nowResolved = !comment?.resolved_at
  const { data, error } = await admin
    .from('project_comments')
    .update({
      resolved_at: nowResolved ? new Date().toISOString() : null,
      resolved_by: nowResolved ? (user.email ?? 'Owner') : null,
    })
    .eq('id', commentId)
    .select('id, resolved_at, resolved_by')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
