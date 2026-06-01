'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { createClient } from '@/lib/supabase/client'
import { AppSettings, DEFAULT_SETTINGS, loadDbSettings, saveDbSettings, loadDbFolderConfig, saveDbFolderConfig } from '@/lib/settings'
import { FolderConfig, EMPTY_CONFIG, loadFolderConfig, saveFolderConfig } from '@/lib/canto-folders'

const LS_KEY = 'dg:settings'

function readLS(): AppSettings {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {}
  return DEFAULT_SETTINGS
}

function writeLS(s: AppSettings) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)) } catch {}
}

function applyTheme(theme: AppSettings['theme']) {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }
}

export function useAppSettings() {
  const { user } = useAuth()
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [folderConfig, setFolderConfigState] = useState<FolderConfig>(EMPTY_CONFIG)
  const [loaded, setLoaded] = useState(false)

  // Load from localStorage immediately on mount (no flash)
  useEffect(() => {
    const s = readLS()
    setSettings(s)
    applyTheme(s.theme)
    setFolderConfigState(loadFolderConfig())
    setLoaded(true)
  }, [])

  // Sync from Supabase once user is known
  useEffect(() => {
    if (!user || !loaded) return
    const supabase = createClient()

    loadDbSettings(supabase, user.id).then(remote => {
      if (!remote) return
      setSettings(remote)
      writeLS(remote)
      applyTheme(remote.theme)
    }).catch(() => {})

    // Pull folder config from DB — overrides localStorage so it's consistent across devices
    loadDbFolderConfig(supabase, user.id).then(remote => {
      if (!remote) return
      setFolderConfigState(remote)
      saveFolderConfig(remote)  // keep localStorage in sync
    }).catch(() => {})
  }, [user, loaded])

  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      writeLS(next)
      if ('theme' in patch) applyTheme(next.theme)
      if (user) {
        const supabase = createClient()
        saveDbSettings(supabase, user.id, next).catch(() => {})
      }
      return next
    })
  }, [user])

  const updateFolderConfig = useCallback((patch: Partial<FolderConfig>) => {
    setFolderConfigState(prev => {
      const next = { ...prev, ...patch }
      saveFolderConfig(next)
      if (user) {
        const supabase = createClient()
        saveDbFolderConfig(supabase, user.id, next).catch(() => {})
      }
      return next
    })
  }, [user])

  return { settings, update, folderConfig, updateFolderConfig }
}
