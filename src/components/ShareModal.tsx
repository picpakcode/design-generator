'use client'

import React, { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { loadProjectShare, upsertProjectShare, deleteProjectShare, DbShare } from '@/lib/db'
import { useAppSettings } from '@/hooks/useAppSettings'

interface Props {
  open: boolean
  onClose: () => void
  projectId: string
  userId: string
}

type AccessLevel = 'view' | 'edit'

export default function ShareModal({ open, onClose, projectId, userId }: Props) {
  const { settings } = useAppSettings()
  const isDark = settings.theme === 'dark'

  const [share, setShare] = useState<DbShare | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [accessLevel, setAccessLevel] = useState<AccessLevel>('view')
  const [isPublic, setIsPublic] = useState(true)
  const [revoking, setRevoking] = useState(false)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const shareUrl = share ? `${origin}/share/${share.token}` : null

  useEffect(() => {
    if (!open) return
    setLoading(true)
    const supabase = createClient()
    loadProjectShare(supabase, projectId).then(s => {
      setShare(s)
      if (s) { setAccessLevel(s.access_level); setIsPublic(s.is_public) }
      setLoading(false)
    })
  }, [open, projectId])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  async function handleCreateOrUpdate() {
    setSaving(true)
    const supabase = createClient()
    const updated = await upsertProjectShare(supabase, projectId, userId, { access_level: accessLevel, is_public: isPublic })
    setShare(updated)
    setSaving(false)
    if (updated) {
      const url = `${origin}/share/${updated.token}`
      try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
    }
  }

  async function handleRevoke() {
    setRevoking(true)
    const supabase = createClient()
    await deleteProjectShare(supabase, projectId)
    setShare(null)
    setRevoking(false)
  }

  async function copyLink() {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!open) return null

  const t = isDark ? {
    backdrop: 'bg-black/70',
    panel: 'bg-gray-950 border border-white/10',
    header: 'bg-gray-900 border-b border-white/8',
    headerText: 'text-white',
    subText: 'text-gray-500',
    closeBtn: 'text-gray-500 hover:text-white hover:bg-white/10',
    label: 'text-gray-400',
    row: 'bg-gray-900/60 border border-white/6',
    toggle: 'bg-gray-800',
    toggleActive: 'bg-indigo-600',
    urlBox: 'bg-gray-900 border border-white/10 text-gray-300',
    revoke: 'text-red-400 hover:text-red-300 hover:bg-red-500/10',
    divider: 'bg-white/6',
    pill: (active: boolean) => active
      ? 'bg-indigo-600 text-white shadow-sm'
      : 'text-gray-400 hover:text-gray-200',
  } : {
    backdrop: 'bg-black/40',
    panel: 'bg-white border border-gray-200',
    header: 'bg-gray-50 border-b border-gray-200',
    headerText: 'text-gray-900',
    subText: 'text-gray-400',
    closeBtn: 'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
    label: 'text-gray-600',
    row: 'bg-gray-50 border border-gray-200',
    toggle: 'bg-gray-200',
    toggleActive: 'bg-indigo-500',
    urlBox: 'bg-gray-50 border border-gray-200 text-gray-700',
    revoke: 'text-red-500 hover:text-red-600 hover:bg-red-50',
    divider: 'bg-gray-100',
    pill: (active: boolean) => active
      ? 'bg-white text-gray-900 shadow-sm'
      : 'text-gray-500 hover:text-gray-700',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className={`absolute inset-0 ${t.backdrop} backdrop-blur-sm`} onClick={onClose} />
      <div className={`relative z-10 w-full max-w-md mx-4 rounded shadow-2xl overflow-hidden ${t.panel} animate-scale-in`}>

        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-3.5 ${t.header}`}>
          <div className="flex items-center gap-2.5">
            <svg className={`w-4 h-4 ${t.subText}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span className={`font-semibold text-sm ${t.headerText}`}>Share Project</span>
          </div>
          <button onClick={onClose} className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${t.closeBtn}`}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <svg className="animate-spin w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : (
            <>
              {/* Share link area */}
              {share ? (
                <div className="space-y-2">
                  <p className={`text-[10px] font-bold uppercase tracking-wider ${t.label}`}>Share link</p>
                  <div className={`flex items-center gap-2 rounded px-3 py-2.5 ${t.urlBox}`}>
                    <span className="flex-1 text-[11px] font-mono truncate">{shareUrl}</span>
                    <button
                      onClick={copyLink}
                      className={`shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded transition-all ${
                        copied
                          ? 'bg-emerald-500 text-white'
                          : isDark
                            ? 'bg-white/10 text-gray-300 hover:bg-white/20'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Note about local uploads */}
              <p className={`text-[10px] leading-relaxed ${t.subText}`}>
                Note: locally uploaded images are device-only and won&apos;t appear for other viewers. Use Canto-hosted assets for full sync.
              </p>

              <div className={`h-px ${t.divider}`} />

              {/* Actions */}
              <div className="flex items-center justify-between gap-3">
                {share ? (
                  <button
                    onClick={handleRevoke}
                    disabled={revoking}
                    className={`text-xs font-medium px-3 py-1.5 rounded transition-colors disabled:opacity-40 ${t.revoke}`}
                  >
                    {revoking ? 'Revoking…' : 'Revoke link'}
                  </button>
                ) : <div />}

                <div className="flex items-center gap-2.5">
                  {copied && <span className={`text-[11px] font-medium text-emerald-600`}>Link copied!</span>}
                  <button
                    onClick={handleCreateOrUpdate}
                    disabled={saving}
                    className="h-8 px-4 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase tracking-widest transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {saving && (
                      <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    )}
                    {share ? 'Update link' : 'Create link'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
