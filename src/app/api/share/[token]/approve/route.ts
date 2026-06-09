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

  if (!share || !share.is_public) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const { blockId, authorName, status } = body as Record<string, string>

  if (!blockId?.trim() || !authorName?.trim() || !['approved', 'changes_requested'].includes(status)) {
    return NextResponse.json({ error: 'blockId, authorName, and status are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('block_approvals')
    .insert({
      project_id:  share.project_id,
      block_id:    blockId.trim(),
      share_token: params.token,
      author_name: authorName.trim(),
      status,
    })
    .select('id, block_id, author_name, status, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
