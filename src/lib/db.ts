import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { DesignState, UploadedAsset, TemplateShareState, TemplateShareSlotState } from '@/types'

type Client = SupabaseClient<Database>

// ── Design session (auto-save) ────────────────────────────────────────────────

export async function saveSession(db: Client, userId: string, state: DesignState) {
  const stripped = stripBlobUrls(state)
  await db
    .from('design_sessions')
    .upsert({ user_id: userId, state: stripped, updated_at: new Date().toISOString() },
             { onConflict: 'user_id' })
}

export async function loadSession(db: Client, userId: string): Promise<DesignState | null> {
  const { data } = await db
    .from('design_sessions')
    .select('state, updated_at')
    .eq('user_id', userId)
    .single()
  return data ? (data.state as unknown as DesignState) : null
}

// ── Presets ───────────────────────────────────────────────────────────────────

export interface DbPreset {
  id: string
  name: string
  state: DesignState
  created_at: string
  updated_at: string
}

export async function loadPresets(db: Client, userId: string): Promise<DbPreset[]> {
  const { data } = await db
    .from('presets')
    .select('id, name, state, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (!data) return []
  return data.map(r => ({ ...r, state: r.state as unknown as DesignState }))
}

export async function savePreset(db: Client, userId: string, name: string, state: DesignState): Promise<string | null> {
  const { data, error } = await db
    .from('presets')
    .insert({ user_id: userId, name, state: stripBlobUrls(state) })
    .select('id')
    .single()
  if (error) { console.error('savePreset:', error.message); return null }
  return data.id
}

export async function updatePreset(db: Client, id: string, name: string, state: DesignState) {
  await db
    .from('presets')
    .update({ name, state: stripBlobUrls(state), updated_at: new Date().toISOString() })
    .eq('id', id)
}

export async function deletePreset(db: Client, id: string) {
  await db.from('presets').delete().eq('id', id)
}

// ── Product history ───────────────────────────────────────────────────────────

export async function touchProductHistory(db: Client, userId: string, productName: string, sku?: string) {
  if (!productName.trim()) return
  await db
    .from('product_history')
    .upsert({
      user_id: userId,
      product_name: productName.trim(),
      sku: sku?.trim() || null,
      last_used_at: new Date().toISOString(),
    }, { onConflict: 'user_id,product_name' })
}

export async function loadProductHistory(db: Client, userId: string, limit = 10) {
  const { data } = await db
    .from('product_history')
    .select('product_name, sku, last_used_at')
    .eq('user_id', userId)
    .order('last_used_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

// ── Projects ──────────────────────────────────────────────────────────────────

export interface DbProject {
  id: string
  user_id: string
  name: string
  state: DesignState
  project_type: 'amazon' | 'shopify'
  thumbnail_url: string | null
  created_at: string
  updated_at: string
  template_state?: { products?: { id: string }[] } | null
}

export async function listProjects(db: Client, userId: string): Promise<Omit<DbProject, 'state'>[]> {
  const { data } = await db
    .from('projects')
    .select('id, user_id, name, project_type, thumbnail_url, created_at, updated_at, template_state')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
  return (data ?? []) as Omit<DbProject, 'state'>[]
}

export async function createProject(db: Client, userId: string, name: string, state: DesignState, projectType: 'amazon' | 'shopify' = 'amazon'): Promise<string | null> {
  const { data, error } = await db
    .from('projects')
    .insert({ user_id: userId, name, state: stripProjectBlobUrls(state), project_type: projectType })
    .select('id')
    .single()
  if (error) { console.error('createProject:', error.message); return null }
  return data.id
}

export async function loadProject(db: Client, id: string): Promise<DbProject | null> {
  const { data } = await db
    .from('projects')
    .select('id, user_id, name, state, project_type, thumbnail_url, created_at, updated_at')
    .eq('id', id)
    .single()
  if (!data) return null
  return { ...data, state: data.state as unknown as DesignState, project_type: (data.project_type ?? 'amazon') as 'amazon' | 'shopify' }
}

export async function saveProject(db: Client, id: string, state: DesignState): Promise<void> {
  await db
    .from('projects')
    .update({ state: stripProjectBlobUrls(state), updated_at: new Date().toISOString() })
    .eq('id', id)
}

export async function saveTemplateState(db: Client, id: string, state: TemplateShareState, userId?: string): Promise<void> {
  let q = db.from('projects').update({ template_state: state, updated_at: new Date().toISOString() }).eq('id', id)
  if (userId) q = q.eq('user_id', userId)
  await q
}

export async function loadTemplateState(db: Client, id: string, userId?: string): Promise<TemplateShareState | null> {
  let q = db.from('projects').select('template_state').eq('id', id)
  if (userId) q = q.eq('user_id', userId)
  const { data } = await q.single()
  if (!data?.template_state) return null
  return data.template_state as TemplateShareState
}

export async function renameProject(db: Client, id: string, name: string): Promise<void> {
  await db
    .from('projects')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', id)
}

export async function deleteProject(db: Client, id: string): Promise<void> {
  await db.from('projects').delete().eq('id', id)
}

export async function saveProjectThumbnail(db: Client, id: string, thumbnailUrl: string): Promise<void> {
  await db
    .from('projects')
    .update({ thumbnail_url: thumbnailUrl, updated_at: new Date().toISOString() })
    .eq('id', id)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Only wipe blob: URLs — external CDN URLs (Canto etc.) are persistent and should be kept.
const wipeBlob = (a: UploadedAsset | null | undefined) =>
  a ? { ...a, url: a.url?.startsWith('blob:') ? '' : (a.url ?? '') } : a

function stripBlobUrls(state: DesignState): DesignState {
  return {
    ...state,
    assets: state.assets.map(wipeBlob) as DesignState['assets'],
  }
}

export function stripProjectBlobUrls(state: DesignState): DesignState {
  return {
    ...state,
    assets: (state.assets ?? []).map(wipeBlob) as DesignState['assets'],
    blocks: (state.blocks ?? []).map(b => ({
      ...b,
      assets: (b.assets ?? []).map(wipeBlob) as DesignState['assets'],
    })),
  }
}

export function stripTemplateBlobUrls(state: TemplateShareState): TemplateShareState {
  const stripSlots = (record: Record<string, TemplateShareSlotState[]>) =>
    Object.fromEntries(Object.entries(record).map(([k, slots]) => [k, slots.map(s => ({
      ...s,
      photoAsset: s.photoAsset ? wipeBlob(s.photoAsset) as UploadedAsset : undefined,
      iconAssets: s.iconAssets.map(a => a ? wipeBlob(a) as UploadedAsset : undefined),
    }))]))
  return {
    ...state,
    allSlots:        stripSlots(state.allSlots),
    allGallerySlots: stripSlots(state.allGallerySlots),
    logoAsset:    state.logoAsset    ? wipeBlob(state.logoAsset)    as UploadedAsset : null,
    textureAsset: state.textureAsset ? wipeBlob(state.textureAsset) as UploadedAsset : null,
  }
}

// ── Project shares ─────────────────────────────────────────────────────────────

export interface DbShare {
  id: string
  project_id: string
  created_by: string
  token: string
  access_level: 'view' | 'edit'
  is_public: boolean
  created_at: string
  updated_at: string
}

export async function loadProjectShare(db: Client, projectId: string): Promise<DbShare | null> {
  const { data } = await db
    .from('project_shares')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle()
  return (data as DbShare | null) ?? null
}

export async function upsertProjectShare(
  db: Client,
  projectId: string,
  userId: string,
  opts: { access_level: 'view' | 'edit'; is_public: boolean }
): Promise<DbShare | null> {
  const existing = await loadProjectShare(db, projectId)
  if (existing) {
    const { data } = await db
      .from('project_shares')
      .update({ access_level: opts.access_level, is_public: opts.is_public, updated_at: new Date().toISOString() })
      .eq('project_id', projectId)
      .select('*')
      .single()
    return (data as DbShare | null) ?? null
  }
  const { data } = await db
    .from('project_shares')
    .insert({ project_id: projectId, created_by: userId, access_level: opts.access_level, is_public: opts.is_public })
    .select('*')
    .single()
  return (data as DbShare | null) ?? null
}

export async function deleteProjectShare(db: Client, projectId: string): Promise<void> {
  await db.from('project_shares').delete().eq('project_id', projectId)
}
