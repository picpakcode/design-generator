import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ownerReactionSchema, parseBody } from '@/lib/validation'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const parsed = parseBody(ownerReactionSchema, await req.json().catch(() => ({})))
  if (!parsed.ok) return parsed.res
  const { commentId, emoji } = parsed.data

  const { data: comment } = await admin
    .from('project_comments')
    .select('reactions, project_id')
    .eq('id', commentId)
    .single()
  if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: proj } = await admin.from('projects').select('user_id').eq('id', comment.project_id).single()
  if (!proj || proj.user_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const reactions = (comment.reactions ?? {}) as Record<string, string[]>
  const name = user.email ?? 'Owner'
  const existing = reactions[emoji] ?? []
  if (existing.includes(name)) {
    reactions[emoji] = existing.filter(r => r !== name)
    if (!reactions[emoji].length) delete reactions[emoji]
  } else {
    reactions[emoji] = [...existing, name]
  }

  const { data, error } = await admin
    .from('project_comments')
    .update({ reactions })
    .eq('id', commentId)
    .select('id, reactions')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
