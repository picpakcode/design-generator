import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request, { params }: { params: { token: string } }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: share } = await supabase
    .from('project_shares')
    .select('project_id, is_public')
    .eq('token', params.token)
    .single()
  if (!share || !share.is_public) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const { commentId, emoji, authorName } = body as { commentId: string; emoji: string; authorName: string }

  if (!commentId || !emoji || !authorName?.trim()) {
    return NextResponse.json({ error: 'commentId, emoji, and authorName required' }, { status: 400 })
  }

  const { data: comment } = await supabase
    .from('project_comments')
    .select('reactions')
    .eq('id', commentId)
    .single()
  if (!comment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const reactions = (comment.reactions as Record<string, string[]>) ?? {}
  const name = authorName.trim()
  const existing = reactions[emoji] ?? []
  if (existing.includes(name)) {
    reactions[emoji] = existing.filter((r: string) => r !== name)
    if (!reactions[emoji].length) delete reactions[emoji]
  } else {
    reactions[emoji] = [...existing, name]
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
