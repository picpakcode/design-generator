import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { postCommentSchema, parseBody } from '@/lib/validation'

export const dynamic = 'force-dynamic'

const COMMENT_FIELDS = 'id, block_id, parent_id, author_name, author_type, body, created_at, resolved_at, resolved_by, reactions'

async function resolveProject(token: string) {
  const supabase = createAdminClient()
  const { data: share } = await supabase
    .from('project_shares')
    .select('project_id, is_public')
    .eq('token', token)
    .single()
  if (!share || !share.is_public) return null
  return { supabase, projectId: share.project_id }
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

  const parsed = parseBody(postCommentSchema, await req.json().catch(() => ({})))
  if (!parsed.ok) return parsed.res
  const { blockId, authorName, body: commentBody, parentId } = parsed.data

  const { data, error } = await supabase
    .from('project_comments')
    .insert({
      project_id:  projectId,
      block_id:    blockId,
      share_token: params.token,
      author_name: authorName,
      author_type: 'reviewer',
      body:        commentBody,
      ...(parentId ? { parent_id: parentId } : {}),
    })
    .select(COMMENT_FIELDS)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
