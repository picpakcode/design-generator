import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const COMMENT_FIELDS = 'id, block_id, parent_id, author_name, author_type, body, created_at, resolved_at, resolved_by, reactions'

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
  const { blockId, parentId, text } = body as Record<string, string>

  if (!blockId?.trim() || !parentId?.trim() || !text?.trim()) {
    return NextResponse.json({ error: 'blockId, parentId, and text are required' }, { status: 400 })
  }

  const { data: parent } = await admin
    .from('project_comments')
    .select('share_token')
    .eq('id', parentId.trim())
    .single()

  const { data, error } = await admin
    .from('project_comments')
    .insert({
      project_id:  params.id,
      block_id:    blockId.trim(),
      parent_id:   parentId.trim(),
      share_token: parent?.share_token ?? 'owner',
      author_name: user.email ?? 'Owner',
      author_type: 'owner',
      body:        text.trim(),
    })
    .select(COMMENT_FIELDS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
