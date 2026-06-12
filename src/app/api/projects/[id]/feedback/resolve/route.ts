import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { resolveCommentSchema, parseBody } from '@/lib/validation'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: project } = await admin.from('projects').select('user_id').eq('id', params.id).single()
  if (!project || project.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const parsed = parseBody(resolveCommentSchema, await req.json().catch(() => ({})))
  if (!parsed.ok) return parsed.res
  const { commentId } = parsed.data

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
