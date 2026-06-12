import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { ownerReplySchema, parseBody } from '@/lib/validation'

const COMMENT_FIELDS = 'id, block_id, parent_id, author_name, author_type, body, created_at, resolved_at, resolved_by, reactions'

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: project } = await admin.from('projects').select('user_id').eq('id', params.id).single()
  if (!project || project.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const parsed = parseBody(ownerReplySchema, await req.json().catch(() => ({})))
  if (!parsed.ok) return parsed.res
  const { blockId, parentId, text } = parsed.data

  const { data: parent } = await admin
    .from('project_comments')
    .select('share_token')
    .eq('id', parentId)
    .single()

  const { data, error } = await admin
    .from('project_comments')
    .insert({
      project_id:  params.id,
      block_id:    blockId,
      parent_id:   parentId,
      share_token: parent?.share_token ?? 'owner',
      author_name: user.email ?? 'Owner',
      author_type: 'owner',
      body:        text,
    })
    .select(COMMENT_FIELDS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
