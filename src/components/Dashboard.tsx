'use client'

/*
 * SQL MIGRATION — run in Supabase SQL Editor before using this dashboard:
 *
 * create table if not exists projects (
 *   id uuid primary key default gen_random_uuid(),
 *   user_id uuid references auth.users(id) on delete cascade not null,
 *   name text not null default 'Untitled',
 *   state jsonb not null default '{}',
 *   thumbnail_url text,
 *   created_at timestamptz default now(),
 *   updated_at timestamptz default now()
 * );
 * alter table projects enable row level security;
 * create policy "Users can manage own projects" on projects for all
 *   using (auth.uid() = user_id) with check (auth.uid() = user_id);
 *
 * -- Storage bucket (run in Supabase dashboard or SQL editor):
 * insert into storage.buckets (id, name, public)
 *   values ('project-thumbnails', 'project-thumbnails', true)
 *   on conflict (id) do nothing;
 * create policy "Users upload own thumbnails" on storage.objects for insert
 *   with check (bucket_id = 'project-thumbnails' and auth.uid()::text = (storage.foldername(name))[1]);
 * create policy "Public thumbnail read" on storage.objects for select
 *   using (bucket_id = 'project-thumbnails');
 * create policy "Users update own thumbnails" on storage.objects for update
 *   using (bucket_id = 'project-thumbnails' and auth.uid()::text = (storage.foldername(name))[1]);
 * create policy "Users delete own thumbnails" on storage.objects for delete
 *   using (bucket_id = 'project-thumbnails' and auth.uid()::text = (storage.foldername(name))[1]);
 */

import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import {
  listProjects,
  createProject,
  renameProject,
  deleteProject,
} from '@/lib/db'
import type { DbProject } from '@/lib/db'
import AuthModal from './AuthModal'
import type { DesignState } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'Yesterday'
  return `${d} days ago`
}

const EMPTY_PROJECT_STATE = {} as DesignState

type ProjectRow = Omit<DbProject, 'state'>

// ─── Project guide modal ──────────────────────────────────────────────────────

function ProjectGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (open) { setMounted(true); setClosing(false) }
    else if (mounted) {
      setClosing(true)
      const t = setTimeout(() => { setMounted(false); setClosing(false) }, 160)
      return () => clearTimeout(t)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!mounted) return null

  const stored = [
    { label: 'CSV product data (text, SKUs, names)', yes: true },
    { label: 'Slide text & descriptions (edited in sidebar)', yes: true },
    { label: 'Slot & gallery layout configuration', yes: true },
    { label: 'Photos, icons, logo, texture from Canto', yes: true },
    { label: 'Directly uploaded files (drag-drop from disk)', yes: false },
  ]

  return (
    <>
      <div
        className={`fixed inset-0 z-50 bg-black/50 dark:bg-black/80 backdrop-blur-sm ${closing ? 'animate-fade-out' : 'animate-fade-in'}`}
        onClick={onClose}
      />
      <div className={`fixed inset-x-6 bottom-6 top-14 z-50 max-w-2xl mx-auto flex flex-col rounded overflow-hidden border bg-white dark:bg-gray-950 border-gray-200 dark:border-white/8 ${closing ? 'animate-scale-out' : 'animate-scale-in'}`}>

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b bg-gray-50 dark:bg-gray-900/80 border-gray-200 dark:border-white/8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-100 dark:bg-indigo-900/50">
              <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">How It Works</h2>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Cloud sync, collaboration, feedback &amp; storage</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] hidden sm:block text-gray-400 dark:text-gray-500">Esc to close</span>
            <button onClick={onClose} className="ml-1 w-8 h-8 flex items-center justify-center rounded-lg transition-colors text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-white dark:hover:bg-white/10">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 bg-white dark:bg-gray-950">

          {/* Cloud sync */}
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest mb-4 pb-2 border-b text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/40">Cloud Sync</h3>
            <div className="space-y-4">
              {([
                { icon: 'M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4', title: 'Auto-save', body: 'Every project saves automatically as you work — design settings, slide configs, text, and Canto media. No manual save button.' },
                { icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', title: 'Resume anywhere', body: 'Open a project on any device or browser — your full template (CSV products, text edits, photos, configs) loads from the cloud automatically.' },
                { icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', title: '4-second debounce', body: 'State is written to Supabase 4 seconds after your last change. Switching projects or closing mid-edit may miss the final state if you move too fast.' },
              ] as const).map(s => (
                <div key={s.title} className="flex gap-4">
                  <div className="w-7 h-7 rounded-full bg-indigo-500 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={s.icon} /></svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold mb-0.5 text-gray-900 dark:text-white">{s.title}</p>
                    <p className="text-[12px] leading-relaxed text-gray-700 dark:text-gray-300">{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Collaboration */}
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest mb-4 pb-2 border-b text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/40">Collaboration &amp; Share Links</h3>
            <div className="space-y-4">
              {([
                { icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1', title: 'Share links', body: 'Generate a public link from inside any project. Two access levels: View Only (reviewers can comment and vote, but not edit) and Can Edit (full access).' },
                { icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', title: 'Live presence', body: 'Avatar bubbles in the top-right show who else has the share link open at the same moment. Design updates from the owner broadcast live.' },
                { icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15', title: 'Polling updates', body: 'Reviewer pages re-fetch the full project state every 30 seconds and comments every 10 seconds — so photo and text changes appear without a manual refresh.' },
              ] as const).map(s => (
                <div key={s.title} className="flex gap-4">
                  <div className="w-7 h-7 rounded-full bg-violet-500 text-white flex items-center justify-center shrink-0 mt-0.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={s.icon} /></svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold mb-0.5 text-gray-900 dark:text-white">{s.title}</p>
                    <p className="text-[12px] leading-relaxed text-gray-700 dark:text-gray-300">{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Feedback */}
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest mb-4 pb-2 border-b text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/40">Feedback System</h3>
            <div className="grid grid-cols-2 gap-3">
              {([
                { label: 'Per-block comments', desc: 'Reviewers click a block to select it, then leave a comment tied to that specific slide.' },
                { label: 'Threaded replies', desc: 'The owner can reply from the Feedback panel inside the editor. Reviewers can reply back.' },
                { label: 'Emoji reactions', desc: 'React to any comment with 👍 ❤️ 😄 👀 🎉 — shown inline with counts.' },
                { label: 'Approve / Changes', desc: 'Each reviewer votes per block. Latest vote per person wins. Owner sees live status badges on the canvas.' },
              ] as const).map(s => (
                <div key={s.label} className="rounded-xl border border-gray-100 dark:border-white/8 bg-gray-50 dark:bg-gray-900 px-4 py-3">
                  <p className="text-[11px] font-bold mb-1 text-gray-900 dark:text-white">{s.label}</p>
                  <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">{s.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* What's stored */}
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest mb-4 pb-2 border-b text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/40">What Gets Stored</h3>
            <div className="rounded-xl border border-gray-100 dark:border-white/8 overflow-hidden">
              {stored.map((r, i) => (
                <div key={r.label} className={`flex items-center gap-3 px-4 py-3 ${i < stored.length - 1 ? 'border-b border-gray-100 dark:border-white/8' : ''}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-white text-[10px] font-bold ${r.yes ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-700'}`}>
                    {r.yes ? '✓' : '✕'}
                  </span>
                  <p className={`text-[12px] leading-relaxed ${r.yes ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}>{r.label}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-3 leading-relaxed">
              Files dragged in from disk are temporary (blob URLs). Use Canto to pick images if you need them to persist across sessions and devices.
            </p>
          </section>

        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-end px-6 py-3.5 border-t bg-gray-50 dark:bg-gray-900/80 border-gray-200 dark:border-white/8">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-[12px] font-semibold transition-colors bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white hover:bg-gray-200 dark:hover:bg-white/15"
          >
            Close
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Delete confirmation modal ────────────────────────────────────────────────

function DeleteConfirmModal({
  count,
  onConfirm,
  onCancel,
  loading,
}: {
  count: number
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={onCancel} />
      <div className="relative w-full max-w-sm bg-white dark:bg-gray-900 rounded border border-gray-100 dark:border-gray-700 overflow-hidden shadow-2xl animate-scale-in">
        <div className="px-6 pt-6 pb-5 flex flex-col items-center text-center gap-4">
          {/* Icon */}
          <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-red-950/40 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>

          {/* Copy */}
          <div>
            <h2 className="text-[15px] font-bold text-gray-900 dark:text-white">
              Delete {count === 1 ? 'project' : `${count} projects`}?
            </h2>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
              This action cannot be undone.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex gap-2.5">
          <button
            onClick={onCancel}
            className="flex-1 h-9 rounded border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 h-9 rounded bg-red-500 hover:bg-red-600 text-white text-sm font-semibold disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
          >
            {loading ? (
              <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const router = useRouter()
  const { user, loading: authLoading, signOut } = useAuth()
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  // 3-dot menu state
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const isSelectMode = selectedIds.size > 0

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<string[] | null>(null)
  const [deleting, setDeleting] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    if (!user) return
    setLoading(true)
    listProjects(supabase, user.id)
      .then(setProjects)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [renamingId])

  // ── Selection helpers ──────────────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedIds(new Set(projects.map(p => p.id)))
  const clearSelection = () => setSelectedIds(new Set())
  const allSelected = projects.length > 0 && selectedIds.size === projects.length

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleNewProject = async () => {
    if (!user || creating) return
    setCreating(true)
    setCreateError(null)
    try {
      const id = await createProject(supabase, user.id, 'Untitled', EMPTY_PROJECT_STATE)
      if (id) {
        router.push(`/project/${id}`)
      } else {
        setCreateError('Could not create project. Make sure the database migration has been run.')
      }
    } catch (err) {
      console.error('Failed to create project:', err)
      setCreateError(String(err))
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteProject = (id: string) => {
    setMenuOpenId(null)
    setDeleteTarget([id])
  }

  const handleDeleteSelected = () => {
    setDeleteTarget(Array.from(selectedIds))
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const ids = deleteTarget
    setDeleting(true)
    setProjects(ps => ps.filter(p => !ids.includes(p.id)))
    setSelectedIds(new Set())
    setDeleteTarget(null)
    try {
      await Promise.all(ids.map(id => deleteProject(supabase, id)))
    } catch (err) {
      console.error('Failed to delete projects:', err)
    } finally {
      setDeleting(false)
    }
  }

  const startRename = (project: ProjectRow) => {
    setMenuOpenId(null)
    setRenamingId(project.id)
    setRenameValue(project.name || 'Untitled')
  }

  const commitRename = async (id: string) => {
    const name = renameValue.trim() || 'Untitled'
    setProjects(ps => ps.map(p => p.id === id ? { ...p, name } : p))
    setRenamingId(null)
    try {
      await renameProject(supabase, id, name)
    } catch (err) {
      console.error('Failed to rename project:', err)
    }
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, id: string) => {
    if (e.key === 'Enter') commitRename(id)
    if (e.key === 'Escape') setRenamingId(null)
  }

  const isLoading = authLoading || loading

  // ── Not signed in ──────────────────────────────────────────────────────────
  if (!authLoading && !user) {
    return (
      <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-950">
        <header className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center gap-3">
          <img src="/Favicon.png" alt="Doc's Design Generator" className="w-7 h-7 rounded object-contain shrink-0" />
          <span className="font-bold text-gray-900 dark:text-white text-base tracking-tight">Doc&rsquo;s Design Generator</span>
          <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700">Beta</span>
          <div className="ml-auto">
            <button
              onClick={() => setGuideOpen(true)}
              className="h-7 px-3 rounded border border-gray-200 dark:border-gray-600 text-[11px] font-semibold text-gray-600 dark:text-gray-400 hover:border-gray-400 hover:text-gray-900 dark:hover:text-white transition-all flex items-center gap-1.5"
            >
              <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Guide
            </button>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Sign in to manage your projects.</p>
            <button
              onClick={() => setAuthModalOpen(true)}
              className="h-9 px-5 rounded bg-gray-900 dark:bg-gray-700 text-white text-sm font-semibold hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
            >
              Sign in
            </button>
          </div>
        </div>
        <AuthModal open={authModalOpen} onClose={() => setAuthModalOpen(false)} />
        <ProjectGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
      </div>
    )
  }

  // ── Main dashboard ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-950">
      {/* Navbar */}
      <header className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center gap-3">
        <img src="/Favicon.png" alt="Doc's Design Generator" className="w-7 h-7 rounded object-contain shrink-0" />
        <span className="font-bold text-gray-900 dark:text-white text-base tracking-tight">Doc&rsquo;s Design Generator</span>
        <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700">Beta</span>
        <button
          onClick={() => setGuideOpen(true)}
          className="h-7 px-3 rounded border border-gray-200 dark:border-gray-600 text-[11px] font-semibold text-gray-600 dark:text-gray-400 hover:border-gray-400 hover:text-gray-900 dark:hover:text-white transition-all flex items-center gap-1.5"
        >
          <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Guide
        </button>
        <div className="ml-auto flex items-center gap-3">
          {user && (
            <>
              <div className="text-right hidden sm:block">
                <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 leading-none">{user.user_metadata?.full_name ?? user.email}</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{user.email}</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-white text-[11px] font-bold shrink-0">
                {(user.email ?? '?')[0].toUpperCase()}
              </div>
              <button
                onClick={signOut}
                className="h-7 px-3 rounded border border-gray-200 dark:border-gray-600 text-[11px] font-semibold text-gray-600 dark:text-gray-400 hover:border-gray-400 hover:text-gray-900 dark:hover:text-white transition-all"
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </header>

      {/* Page body */}
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-6xl mx-auto">

          {/* Title row */}
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Projects</h1>
            <button
              onClick={handleNewProject}
              disabled={creating || !user}
              className="flex items-center gap-1.5 h-9 px-4 rounded bg-gray-900 dark:bg-gray-700 text-white text-sm font-semibold hover:bg-gray-700 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Project
            </button>
          </div>

          {/* Selection toolbar */}
          <div
            className="overflow-hidden transition-all duration-300 ease-out"
            style={{ maxHeight: isSelectMode ? '72px' : '0' }}
          >
            <div className="flex items-center gap-3 mb-4 px-4 py-2.5 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-700 shadow-sm">
              {/* Cancel */}
              <button
                onClick={clearSelection}
                className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Clear selection"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 tabular-nums">
                {selectedIds.size} selected
              </span>

              <div className="flex-1" />

              {/* Select all / Deselect all */}
              <button
                onClick={allSelected ? clearSelection : selectAll}
                className="text-xs font-semibold text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              >
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>

              <div className="w-px h-4 bg-gray-200 dark:bg-gray-700" />

              {/* Delete button */}
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-1.5 h-8 px-3.5 rounded bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete {selectedIds.size}
              </button>
            </div>
          </div>

          {/* Error banner */}
          {createError && (
            <div className="mb-4 px-4 py-3 rounded bg-red-50 border border-red-200 flex items-start gap-3">
              <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-red-700">Failed to create project</p>
                <p className="text-[11px] text-red-500 mt-0.5">{createError}</p>
                <p className="text-[11px] text-red-400 mt-1">Have you run the SQL migration in Supabase?</p>
              </div>
              <button onClick={() => setCreateError(null)} className="shrink-0 text-red-300 hover:text-red-500">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Loading spinner */}
          {isLoading && (
            <div className="flex items-center justify-center py-24">
              <svg className="animate-spin w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}

          {/* Grid */}
          {!isLoading && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
              {/* New project card */}
              <button
                onClick={handleNewProject}
                disabled={creating || !user}
                className="group flex flex-col items-center justify-center aspect-video rounded border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-gray-500 dark:hover:border-gray-500 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-8 h-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-xs font-semibold">New project</span>
              </button>

              {/* Project cards */}
              {projects.map((project, idx) => {
                const isSelected = selectedIds.has(project.id)
                return (
                  <div
                    key={project.id}
                    className={`group relative flex flex-col bg-white dark:bg-gray-900 rounded border transition-all overflow-hidden animate-fade-in ${
                      isSelected
                        ? 'border-blue-400 dark:border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900 shadow-sm'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md'
                    }`}
                    style={{ animationDelay: `${idx * 40}ms` }}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={e => { e.preventDefault(); e.stopPropagation(); toggleSelect(project.id) }}
                      className={`absolute top-2 left-2 z-10 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        isSelected
                          ? 'bg-blue-500 border-blue-500 opacity-100'
                          : 'bg-white/90 dark:bg-gray-900/90 border-gray-300 dark:border-gray-500 backdrop-blur-sm opacity-0 group-hover:opacity-100'
                      } ${isSelectMode ? 'opacity-100' : ''}`}
                      title={isSelected ? 'Deselect' : 'Select'}
                    >
                      {isSelected && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>

                    {/* Thumbnail */}
                    <a
                      href={isSelectMode ? undefined : `/project/${project.id}`}
                      onClick={isSelectMode ? e => { e.preventDefault(); toggleSelect(project.id) } : undefined}
                      className="block aspect-video bg-gray-100 dark:bg-gray-800 overflow-hidden"
                      tabIndex={0}
                    >
                      {project.thumbnail_url ? (
                        <img
                          src={project.thumbnail_url}
                          alt={project.name || 'Untitled'}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                          <div className="w-10 h-10 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                            <span className="text-lg font-bold text-gray-400 dark:text-gray-500">
                              {(project.name || 'U')[0].toUpperCase()}
                            </span>
                          </div>
                        </div>
                      )}
                    </a>

                    {/* Card footer */}
                    <div className="px-3 py-2.5 flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {renamingId === project.id ? (
                          <input
                            ref={renameInputRef}
                            type="text"
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onBlur={() => commitRename(project.id)}
                            onKeyDown={e => handleRenameKeyDown(e, project.id)}
                            className="w-full text-sm font-semibold text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-gray-400"
                            onClick={e => e.stopPropagation()}
                          />
                        ) : (
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                            {project.name || 'Untitled'}
                          </p>
                        )}
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                          Updated {timeAgo(project.updated_at)}
                        </p>
                      </div>

                      {/* 3-dot menu — hidden in select mode */}
                      {!isSelectMode && (
                        <div className="relative shrink-0">
                          <button
                            onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === project.id ? null : project.id) }}
                            className="w-7 h-7 flex items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                            title="Project options"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                              <circle cx="5" cy="12" r="1.5" />
                              <circle cx="12" cy="12" r="1.5" />
                              <circle cx="19" cy="12" r="1.5" />
                            </svg>
                          </button>

                          {menuOpenId === project.id && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setMenuOpenId(null)} />
                              <div className="absolute bottom-full right-0 mb-1 w-36 bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 py-1.5 z-50 animate-slide-down" style={{ transformOrigin: 'bottom right' }}>
                                <button
                                  onClick={e => { e.stopPropagation(); startRename(project) }}
                                  className="w-full text-left px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                >
                                  Rename
                                </button>
                                <button
                                  onClick={e => { e.stopPropagation(); handleDeleteProject(project.id) }}
                                  className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                >
                                  Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && projects.length === 0 && (
            <div className="text-center py-16">
              <p className="text-sm text-gray-400 dark:text-gray-500">No projects yet. Create your first one above.</p>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          count={deleteTarget.length}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleting}
        />
      )}
      <ProjectGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />
    </div>
  )
}
