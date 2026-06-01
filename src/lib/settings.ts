// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { SupabaseClient } from '@supabase/supabase-js'

export interface AppSettings {
  theme: 'light' | 'dark'
  exportFormat: 'png' | 'jpeg'
  exportQuality: number       // 60–100
  autosaveInterval: number    // ms; 0 = off
  uiDensity: 'comfortable' | 'compact'
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'light',
  exportFormat: 'png',
  exportQuality: 90,
  autosaveInterval: 2000,
  uiDensity: 'comfortable',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any>

export async function loadDbSettings(db: Client, userId: string): Promise<AppSettings | null> {
  const { data } = await db
    .from('user_settings')
    .select('theme, export_format, export_quality, autosave_interval, ui_density')
    .eq('user_id', userId)
    .single()
  if (!data) return null
  return {
    theme:             data.theme             as AppSettings['theme'],
    exportFormat:      data.export_format     as AppSettings['exportFormat'],
    exportQuality:     data.export_quality,
    autosaveInterval:  data.autosave_interval,
    uiDensity:         data.ui_density        as AppSettings['uiDensity'],
  }
}

export async function saveDbSettings(db: Client, userId: string, s: AppSettings): Promise<void> {
  await db.from('user_settings').upsert({
    user_id:           userId,
    theme:             s.theme,
    export_format:     s.exportFormat,
    export_quality:    s.exportQuality,
    autosave_interval: s.autosaveInterval,
    ui_density:        s.uiDensity,
    updated_at:        new Date().toISOString(),
  }, { onConflict: 'user_id' })
}
