// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DesignState } from '@/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any>

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripBlobUrls(state: DesignState): DesignState {
  return {
    ...state,
    assets: state.assets.map(a => a ? { ...a, url: '' } : a),
  }
}
