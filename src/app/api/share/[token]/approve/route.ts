import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { postApprovalSchema, parseBody } from '@/lib/validation'

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const parsed = parseBody(postApprovalSchema, await req.json().catch(() => ({})))
  if (!parsed.ok) return parsed.res

  const supabase = createAdminClient()

  const { data: share } = await supabase
    .from('project_shares')
    .select('project_id, is_public')
    .eq('token', params.token)
    .single()

  if (!share || !share.is_public) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { blockId, authorName, status } = parsed.data

  const { data, error } = await supabase
    .from('block_approvals')
    .insert({
      project_id:  share.project_id,
      block_id:    blockId,
      share_token: params.token,
      author_name: authorName,
      status,
    })
    .select('id, block_id, author_name, status, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
