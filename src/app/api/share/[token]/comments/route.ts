import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const COMMENT_FIELDS = 'id, block_id, parent_id, author_name, author_type, body, created_at, resolved_at, resolved_by, reactions'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveProject(token: string): Promise<{ supabase: any; projectId: string } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data: share } = await supabase
    .from('project_shares')
    .select('project_id, is_public')
    .eq('token', token)
    .single()
  if (!share || !share.is_public) return null
  return { supabase, projectId: share.project_id as string }
}

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const resolved = await resolveProject(params.token)
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { supabase, projectId } = resolved

  const [commentsRes, approvalsRes] = await Promise.all([
    supabase
      .from('project_comments')
      .select(COMMENT_FIELDS)
      .eq('project_id', projectId)
      .order('created_at', { ascending: true }),
    supabase
      .from('block_approvals')
      .select('id, block_id, author_name, status, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true }),
  ])

  return NextResponse.json({
    comments:  commentsRes.data  ?? [],
    approvals: approvalsRes.data ?? [],
  })
}

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const resolved = await resolveProject(params.token)
  if (!resolved) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { supabase, projectId } = resolved

  const body = await req.json().catch(() => ({}))
  const { blockId, authorName, body: commentBody, parentId } = body as Record<string, string>

  if (!blockId?.trim() || !authorName?.trim() || !commentBody?.trim()) {
    return NextResponse.json({ error: 'blockId, authorName, and body are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('project_comments')
    .insert({
      project_id:  projectId,
      block_id:    blockId.trim(),
      share_token: params.token,
      author_name: authorName.trim(),
      author_type: 'reviewer',
      body:        commentBody.trim(),
      ...(parentId?.trim() ? { parent_id: parentId.trim() } : {}),
    })
    .select(COMMENT_FIELDS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
