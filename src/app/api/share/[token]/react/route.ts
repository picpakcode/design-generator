import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { postShareReactionSchema, parseBody } from '@/lib/validation'

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const supabase = createAdminClient()

  const { data: share } = await supabase
    .from('project_shares')
    .select('project_id, is_public')
    .eq('token', params.token)
    .single()
  if (!share || !share.is_public) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parsed = parseBody(postShareReactionSchema, await req.json().catch(() => ({})))
  if (!parsed.ok) return parsed.res
  const { commentId, emoji, authorName } = parsed.data

  const { data: comment } = await supabase
    .from('project_comments')
    .select('reactions')
    .eq('id', commentId)
    .single()
  if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const reactions = (comment.reactions ?? {}) as Record<string, string[]>
  const existing = reactions[emoji] ?? []
  if (existing.includes(authorName)) {
    reactions[emoji] = existing.filter(r => r !== authorName)
    if (!reactions[emoji].length) delete reactions[emoji]
  } else {
    reactions[emoji] = [...existing, authorName]
  }

  const { data, error } = await supabase
    .from('project_comments')
    .update({ reactions })
    .eq('id', commentId)
    .select('id, reactions')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
