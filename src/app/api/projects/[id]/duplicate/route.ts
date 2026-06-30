import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = params

  const { data: source, error: fetchError } = await supabase
    .from('projects')
    .select('name, state, project_type, template_state')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !source) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const { data: newProject, error: insertError } = await supabase
    .from('projects')
    .insert({
      user_id: user.id,
      name: `${source.name} (copy)`,
      state: source.state,
      project_type: source.project_type,
      template_state: source.template_state,
    })
    .select('id')
    .single()

  if (insertError || !newProject) {
    return NextResponse.json({ error: 'Failed to duplicate project' }, { status: 500 })
  }

  return NextResponse.json({ id: newProject.id })
}
