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
      <div className="relative w-full max-w-sm bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 overflow-hidden animate-scale-in">
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
            className="flex-1 h-9 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 h-9 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
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
        <header className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center gap-3 shadow-sm">
          <img src="/Favicon.png" alt="Doc's Design Generator" className="w-7 h-7 rounded object-contain shrink-0" />
          <span className="font-bold text-gray-900 dark:text-white text-base tracking-tight">Doc&rsquo;s Design Generator</span>
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
      </div>
    )
  }

  // ── Main dashboard ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-950">
      {/* Navbar */}
      <header className="shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center gap-3 shadow-sm">
        <img src="/Favicon.png" alt="Doc's Design Generator" className="w-7 h-7 rounded object-contain shrink-0" />
        <span className="font-bold text-gray-900 dark:text-white text-base tracking-tight">Doc&rsquo;s Design Generator</span>
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
          {isSelectMode && (
            <div className="flex items-center gap-3 mb-4 px-4 py-2.5 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm animate-slide-down">
              {/* Cancel */}
              <button
                onClick={clearSelection}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
                className="flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-semibold transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete {selectedIds.size}
              </button>
            </div>
          )}

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
    </div>
  )
}
