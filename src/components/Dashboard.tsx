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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useAppSettings } from '@/hooks/useAppSettings'
import { createClient } from '@/lib/supabase/client'
import { ShortcutsModal } from './ShortcutsModal'
import {
  listProjects,
  createProject,
  renameProject,
  deleteProject,
} from '@/lib/db'
import type { DbProject } from '@/lib/db'
import type { DesignState } from '@/types'

const DocsDrawer      = dynamic(() => import('./DocsDrawer'),      { ssr: false })
const ChangelogDrawer = dynamic(() => import('./ChangelogDrawer'), { ssr: false })

// ─── Platform brand marks ─────────────────────────────────────────────────────

function AmazonMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8.5 13.5V10C8.5 7.8 10 6.2 12.2 6.2s3.8 1.6 3.8 3.8V12c0 1.2-1 2.2-2.2 2.2H10" stroke="#FF9900" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M4.5 17.5c3 2 10.5 2.5 14.5 0" stroke="#FF9900" strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M17.5 16l2.5 1.5-.5-2.5" fill="#FF9900"/>
    </svg>
  )
}

function ShopifyMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15.5 5.5c-.4-1.8-1.9-3-3.3-3C11 2.5 9.8 3.5 9.5 5" stroke="#5E8E3E" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M5.5 8.5L4.5 20l14 2L20 9 5.5 8.5z" fill="#95BF47" fillOpacity="0.25" stroke="#5E8E3E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="8.5" cy="21.5" r="1.25" fill="#5E8E3E"/>
      <circle cx="15.5" cy="21.5" r="1.25" fill="#5E8E3E"/>
      <path d="M9.5 12c.8-1.2 4.5-.8 4 1s-4 1-3.5 2.8 4.5 1 4 2.2" stroke="white" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  )
}

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

// ─── Project card (memoized) ──────────────────────────────────────────────────

interface ProjectCardProps {
  project: ProjectRow
  isSelected: boolean
  isSelectMode: boolean
  isMenuOpen: boolean
  isRenaming: boolean
  renameValue: string | undefined
  renameInputRef: React.RefObject<HTMLInputElement>
  animationDelay: number
  viewMode: 'grid' | 'list'
  productCount?: number
  onToggleSelect: (id: string) => void
  onToggleMenu: (id: string) => void
  onCloseMenu: () => void
  onStartRename: (project: ProjectRow) => void
  onCommitRename: (id: string) => void
  onRenameKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, id: string) => void
  onSetRenameValue: (value: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
}

const ProjectCard = React.memo(function ProjectCard({
  project, isSelected, isSelectMode, isMenuOpen, isRenaming, renameValue,
  renameInputRef, animationDelay, viewMode, productCount = 0,
  onToggleSelect, onToggleMenu, onCloseMenu,
  onStartRename, onCommitRename, onRenameKeyDown, onSetRenameValue, onDelete, onDuplicate,
}: ProjectCardProps) {
  const timeStr = useMemo(() => timeAgo(project.updated_at), [project.updated_at])

  const platformBadge = (
    <span className={`badge shrink-0 ${
      project.project_type === 'shopify'
        ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400'
        : 'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'
    }`}>
      {project.project_type === 'shopify' ? 'Shopify' : 'Amazon'}
    </span>
  )

  const thumbnailPlaceholder = (isMini: boolean) => (
    <div className={`w-full h-full flex flex-col items-center justify-center gap-1.5 ${
      project.project_type === 'amazon'
        ? 'bg-orange-50 dark:bg-orange-950/30'
        : 'bg-green-50 dark:bg-green-950/30'
    }`}>
      {project.project_type === 'amazon' ? (
        <svg className={isMini ? 'w-5 h-5' : 'w-8 h-8'} viewBox="0 0 24 24" fill="none">
          <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z" fill="#FF9900" opacity="0.2"/>
          <path d="M6.5 12.5c0 0 1.2 2.5 5.5 2.5s5.5-2.5 5.5-2.5" stroke="#FF9900" strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M15.5 11l2 1.5-2 1.5" stroke="#FF9900" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M8 7.5h8M12 7.5v2.5" stroke="#FF9900" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ) : (
        <svg className={isMini ? 'w-5 h-5' : 'w-8 h-8'} viewBox="0 0 24 24" fill="none">
          <path d="M16 7c-.5-1.5-2-2.5-3.5-2.5-1 0-2 .5-2.5 1.5C9.5 7 9 7 9 7L7.5 17.5l9 1.5L18 9c0 0-1.5-.5-2-2z" fill="#96BF48" opacity="0.2"/>
          <path d="M9 7s.5-1.5 2-2 2.5 0 3 1M7.5 17.5l9 1.5L18 9" stroke="#5A8A3C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="9" cy="20" r="1.2" fill="#5A8A3C"/>
          <circle cx="15" cy="20" r="1.2" fill="#5A8A3C"/>
        </svg>
      )}
      {!isMini && (
        <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 truncate px-2 max-w-full">
          {project.name || 'Untitled'}
        </p>
      )}
    </div>
  )

  const dotMenu = (
    <div className="relative shrink-0">
      <button
        onClick={e => { e.stopPropagation(); onToggleMenu(project.id) }}
        className="w-7 h-7 flex items-center justify-center rounded-none text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
        title="Project options"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="5" cy="12" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="19" cy="12" r="1.5" />
        </svg>
      </button>
      {isMenuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={onCloseMenu} />
          <div className="absolute bottom-full right-0 mb-1 w-36 menu z-50 animate-slide-down" style={{ transformOrigin: 'bottom right' }}>
            <button onClick={e => { e.stopPropagation(); onStartRename(project) }} className="menu-item">Rename</button>
            <button onClick={e => { e.stopPropagation(); onDuplicate(project.id) }} className="menu-item">Duplicate</button>
            <div className="menu-separator" />
            <button onClick={e => { e.stopPropagation(); onDelete(project.id) }} className="menu-item text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20">Delete</button>
          </div>
        </>
      )}
    </div>
  )

  if (viewMode === 'list') {
    return (
      <div
        className={`group relative flex items-center gap-3 bg-white dark:bg-gray-900 border-b last:border-b-0 px-4 py-2.5 transition-colors hover:bg-gray-50/80 dark:hover:bg-gray-800/40 animate-fade-in ${
          isSelected ? 'bg-accent-50/40 dark:bg-accent-950/20 border-gray-200 dark:border-gray-700' : 'border-gray-100 dark:border-gray-800'
        }`}
        style={{ animationDelay: `${animationDelay}ms` }}
      >
        {/* Checkbox */}
        <button
          onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleSelect(project.id) }}
          className={`shrink-0 w-4 h-4 rounded-none border-2 flex items-center justify-center transition-all ${
            isSelected
              ? 'bg-accent-600 border-accent-600 opacity-100'
              : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 opacity-0 group-hover:opacity-100'
          } ${isSelectMode ? 'opacity-100' : ''}`}
          title={isSelected ? 'Deselect' : 'Select'}
        >
          {isSelected && (
            <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        {/* Mini thumbnail */}
        <a
          href={isSelectMode ? undefined : `/project/${project.id}`}
          onClick={isSelectMode ? e => { e.preventDefault(); onToggleSelect(project.id) } : undefined}
          className="shrink-0 w-16 h-10 rounded-none overflow-hidden bg-gray-100 dark:bg-gray-800 block border border-gray-100 dark:border-gray-700"
        >
          {project.thumbnail_url ? (
            <img src={project.thumbnail_url} alt={project.name || 'Untitled'} className="w-full h-full object-cover" />
          ) : (
            thumbnailPlaceholder(true)
          )}
        </a>

        {/* Middle: name + meta */}
        <a
          href={isSelectMode ? undefined : `/project/${project.id}`}
          onClick={isSelectMode ? e => { e.preventDefault(); onToggleSelect(project.id) } : undefined}
          className="flex-1 min-w-0 block"
        >
          {isRenaming ? (
            <input
              ref={renameInputRef}
              type="text"
              value={renameValue ?? ''}
              onChange={e => onSetRenameValue(e.target.value)}
              onBlur={() => onCommitRename(project.id)}
              onKeyDown={e => onRenameKeyDown(e, project.id)}
              className="input input-sm w-full max-w-xs"
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <p className="text-[13px] font-semibold text-gray-900 dark:text-white truncate leading-snug">
              {project.name || 'Untitled'}
            </p>
          )}
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 leading-none">{timeStr}</p>
        </a>

        {/* Right: badge + count + menu */}
        <div className="flex items-center gap-2.5 shrink-0">
          {platformBadge}
          {productCount > 0 && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">{productCount}p</span>
          )}
          {!isSelectMode && dotMenu}
        </div>
      </div>
    )
  }

  // Grid mode
  return (
    <div
      className={`group relative flex flex-col bg-white dark:bg-gray-900 rounded-none border transition-all overflow-hidden animate-fade-in ${
        isSelected
          ? 'border-accent-300 dark:border-accent-700 ring-2 ring-accent-500/20 dark:ring-accent-500/20 shadow-sm'
          : 'border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      {/* Checkbox */}
      <button
        onClick={e => { e.preventDefault(); e.stopPropagation(); onToggleSelect(project.id) }}
        className={`absolute top-2.5 left-2.5 z-10 w-4 h-4 rounded-none border-2 flex items-center justify-center transition-all ${
          isSelected
            ? 'bg-accent-600 border-accent-600 opacity-100'
            : 'bg-white/90 dark:bg-gray-900/90 border-gray-300 dark:border-gray-600 backdrop-blur-sm opacity-0 group-hover:opacity-100'
        } ${isSelectMode ? 'opacity-100' : ''}`}
        title={isSelected ? 'Deselect' : 'Select'}
      >
        {isSelected && (
          <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Thumbnail */}
      <a
        href={isSelectMode ? undefined : `/project/${project.id}`}
        onClick={isSelectMode ? e => { e.preventDefault(); onToggleSelect(project.id) } : undefined}
        className="relative block aspect-video overflow-hidden bg-gray-50 dark:bg-gray-800"
        tabIndex={0}
      >
        {project.thumbnail_url ? (
          <img
            src={project.thumbnail_url}
            alt={project.name || 'Untitled'}
            className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          thumbnailPlaceholder(false)
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/12 transition-colors duration-200 pointer-events-none" />
      </a>

      {/* Footer */}
      <div className="px-3 pt-2.5 pb-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {isRenaming ? (
            <input
              ref={renameInputRef}
              type="text"
              value={renameValue ?? ''}
              onChange={e => onSetRenameValue(e.target.value)}
              onBlur={() => onCommitRename(project.id)}
              onKeyDown={e => onRenameKeyDown(e, project.id)}
              className="input input-sm w-full"
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <a
              href={isSelectMode ? undefined : `/project/${project.id}`}
              onClick={isSelectMode ? e => { e.preventDefault(); onToggleSelect(project.id) } : undefined}
              className="block text-[13px] font-semibold text-gray-900 dark:text-white truncate leading-snug hover:text-accent-600 dark:hover:text-accent-400 transition-colors"
            >
              {project.name || 'Untitled'}
            </a>
          )}
          <div className="flex items-center gap-1.5 mt-1.5">
            {platformBadge}
            <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
              {timeStr}{productCount > 0 ? ` · ${productCount}p` : ''}
            </span>
          </div>
        </div>
        {!isSelectMode && dotMenu}
      </div>
    </div>
  )
})

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
      <div className={`fixed inset-x-6 bottom-6 top-14 z-50 max-w-2xl mx-auto flex flex-col rounded-none overflow-hidden border bg-white dark:bg-gray-950 border-gray-200 dark:border-white/8 ${closing ? 'animate-scale-out' : 'animate-scale-in'}`}>

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b bg-gray-50 dark:bg-gray-900/80 border-gray-200 dark:border-white/8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-none flex items-center justify-center bg-accent-100 dark:bg-accent-900/50">
              <svg className="w-4 h-4 text-accent-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
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
            <button onClick={onClose} className="ml-1 w-8 h-8 flex items-center justify-center rounded-none transition-colors text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-white dark:hover:bg-white/10">
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
            <h3 className="text-[10px] font-bold uppercase tracking-widest mb-4 pb-2 border-b text-accent-600 dark:text-accent-400 border-accent-100 dark:border-accent-900/40">Cloud Sync</h3>
            <div className="space-y-4">
              {([
                { icon: 'M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4', title: 'Auto-save', body: 'Every project saves automatically as you work — design settings, slide configs, text, and Canto media. No manual save button.' },
                { icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', title: 'Resume anywhere', body: 'Open a project on any device or browser — your full template (CSV products, text edits, photos, configs) loads from the cloud automatically.' },
                { icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', title: '4-second debounce', body: 'State is written to Supabase 4 seconds after your last change. Switching projects or closing mid-edit may miss the final state if you move too fast.' },
              ] as const).map(s => (
                <div key={s.title} className="flex gap-4">
                  <div className="w-7 h-7 rounded-none bg-accent-500 text-white flex items-center justify-center shrink-0 mt-0.5">
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
            <h3 className="text-[10px] font-bold uppercase tracking-widest mb-4 pb-2 border-b text-accent-600 dark:text-accent-400 border-accent-100 dark:border-accent-900/40">Collaboration &amp; Share Links</h3>
            <div className="space-y-4">
              {([
                { icon: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1', title: 'Share links', body: 'Generate a public link from inside any project. Two access levels: View Only (reviewers can comment and vote, but not edit) and Can Edit (full access).' },
                { icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', title: 'Live presence', body: 'Avatar bubbles in the top-right show who else has the share link open at the same moment. Design updates from the owner broadcast live.' },
                { icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15', title: 'Polling updates', body: 'Reviewer pages re-fetch the full project state every 30 seconds and comments every 10 seconds — so photo and text changes appear without a manual refresh.' },
              ] as const).map(s => (
                <div key={s.title} className="flex gap-4">
                  <div className="w-7 h-7 rounded-none bg-accent-500 text-white flex items-center justify-center shrink-0 mt-0.5">
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
            <h3 className="text-[10px] font-bold uppercase tracking-widest mb-4 pb-2 border-b text-accent-600 dark:text-accent-400 border-accent-100 dark:border-accent-900/40">Feedback System</h3>
            <div className="grid grid-cols-2 gap-3">
              {([
                { label: 'Per-block comments', desc: 'Reviewers click a block to select it, then leave a comment tied to that specific slide.' },
                { label: 'Threaded replies', desc: 'The owner can reply from the Feedback panel inside the editor. Reviewers can reply back.' },
                { label: 'Emoji reactions', desc: 'React to any comment with 👍 ❤️ 😄 👀 🎉 — shown inline with counts.' },
                { label: 'Approve / Changes', desc: 'Each reviewer votes per block. Latest vote per person wins. Owner sees live status badges on the canvas.' },
              ] as const).map(s => (
                <div key={s.label} className="rounded-none border border-gray-100 dark:border-white/8 bg-gray-50 dark:bg-gray-900 px-4 py-3">
                  <p className="text-[11px] font-bold mb-1 text-gray-900 dark:text-white">{s.label}</p>
                  <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">{s.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* What's stored */}
          <section>
            <h3 className="text-[10px] font-bold uppercase tracking-widest mb-4 pb-2 border-b text-accent-600 dark:text-accent-400 border-accent-100 dark:border-accent-900/40">What Gets Stored</h3>
            <div className="rounded-none border border-gray-100 dark:border-white/8 overflow-hidden">
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
            className="px-4 py-1.5 rounded-none text-[12px] font-semibold transition-colors bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-white hover:bg-gray-200 dark:hover:bg-white/15"
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
    <div className="modal-backdrop z-50">
      <div className="absolute inset-0 animate-fade-in" onClick={onCancel} />
      <div className="modal-panel w-full max-w-[360px] animate-scale-in">
        <div className="px-6 pt-6 pb-5 flex flex-col items-center text-center gap-4">
          <div className="w-10 h-10 rounded-none bg-red-50 dark:bg-red-950/40 flex items-center justify-center shrink-0">
            <svg className="w-4.5 h-4.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </div>
          <div>
            <h2 className="heading-sm">Delete {count === 1 ? 'project' : `${count} projects`}?</h2>
            <p className="body-sm mt-1">This cannot be undone.</p>
          </div>
        </div>
        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onCancel} className="btn btn-md btn-secondary flex-1">Cancel</button>
          <button onClick={onConfirm} disabled={loading} className="btn btn-md btn-danger flex-1">
            {loading ? (
              <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── New Project card (shared between grid and empty state) ───────────────────

interface NewProjectCardProps {
  creating: boolean
  user: { id: string } | null
  onNewProject: (platform: 'amazon' | 'shopify') => void
}

function NewProjectCard({ creating, user, onNewProject }: NewProjectCardProps) {
  const [hovered, setHovered] = useState(false)
  const [hoveredPlatform, setHoveredPlatform] = useState<'amazon' | 'shopify' | null>(null)

  return (
    <div
      onMouseEnter={() => { if (!creating && user) setHovered(true) }}
      onMouseLeave={() => { setHovered(false); setHoveredPlatform(null) }}
      className="relative flex flex-col rounded-none overflow-hidden select-none"
      style={{
        border: `2px ${hovered ? 'solid' : 'dashed'} ${hovered ? '#94A3B8' : '#E5E7EB'}`,
        background: 'white',
        transform: hovered ? 'scale(1.02) translateY(-2px)' : 'scale(1) translateY(0)',
        boxShadow: hovered ? '0 8px 24px rgba(0,0,0,0.10)' : '0 1px 3px rgba(0,0,0,0.05)',
        transition: 'transform 240ms cubic-bezier(0.34,1.56,0.64,1), box-shadow 240ms ease, border-color 180ms ease',
        opacity: (!user) ? 0.5 : 1,
        cursor: creating ? 'default' : 'pointer',
      }}
    >
      {/* Content area — same aspect ratio as project tile thumbnails */}
      <div className="relative aspect-video bg-gray-100">

        {/* Platform half-fills — shown on hover */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: '50%',
          background: '#FFF3E0',
          opacity: hoveredPlatform === 'amazon' ? 1 : 0,
          transition: 'opacity 140ms ease',
          pointerEvents: 'none', zIndex: 0,
        }}/>
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: '50%',
          background: '#F0FDF4',
          opacity: hoveredPlatform === 'shopify' ? 1 : 0,
          transition: 'opacity 140ms ease',
          pointerEvents: 'none', zIndex: 0,
        }}/>

        {/* Creating spinner */}
        {creating && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
            <svg className="animate-spin w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          </div>
        )}

        {/* Default: + icon */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
          color: '#9CA3AF',
          opacity: hovered ? 0 : 1,
          transform: hovered ? 'scale(0.75) rotate(45deg)' : 'scale(1) rotate(0deg)',
          transition: 'opacity 180ms ease, transform 220ms cubic-bezier(0.4,0,0.2,1)',
          pointerEvents: 'none',
        }}>
          <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/>
          </svg>
        </div>

        {/* Hover: platform options */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1,
          display: 'flex',
          pointerEvents: hovered ? 'auto' : 'none',
        }}>
          {/* Amazon */}
          <button
            onClick={() => onNewProject('amazon')}
            onMouseEnter={() => setHoveredPlatform('amazon')}
            onMouseLeave={() => setHoveredPlatform(null)}
            className="flex-1 flex flex-col items-center justify-center gap-1.5 border-none outline-none"
            style={{
              background: 'transparent', cursor: 'pointer',
              opacity: hovered ? 1 : 0,
              transform: hovered ? 'translateY(0px)' : 'translateY(14px)',
              transition: 'opacity 240ms cubic-bezier(0.34,1.56,0.64,1) 30ms, transform 300ms cubic-bezier(0.34,1.56,0.64,1) 30ms',
            }}
          >
            <div className="w-9 h-9 rounded-none flex items-center justify-center transition-transform"
              style={{
                background: hoveredPlatform === 'amazon' ? '#FFE0B2' : '#FFF3E0',
                transform: hoveredPlatform === 'amazon' ? 'scale(1.12)' : 'scale(1)',
                transition: 'transform 200ms cubic-bezier(0.34,1.56,0.64,1), background 140ms ease',
              }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2z" fill="#FF9900" opacity="0.2"/>
                <path d="M6.5 12.5c0 0 1.2 2.5 5.5 2.5s5.5-2.5 5.5-2.5" stroke="#FF9900" strokeWidth="1.8" strokeLinecap="round"/>
                <path d="M15.5 11l2 1.5-2 1.5" stroke="#FF9900" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8 7.5h8M12 7.5v2.5" stroke="#FF9900" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#1F2937', letterSpacing: '-0.01em' }}>Amazon</span>
            <span style={{ fontSize: 9.5, color: '#9CA3AF', fontWeight: 500 }}>A+ &amp; Gallery</span>
          </button>

          {/* Divider */}
          <div style={{
            width: 1, alignSelf: 'stretch', margin: '10px 0',
            background: '#E5E7EB',
            opacity: hovered ? 1 : 0,
            transition: 'opacity 200ms ease 80ms',
          }}/>

          {/* Shopify */}
          <button
            onClick={() => onNewProject('shopify')}
            onMouseEnter={() => setHoveredPlatform('shopify')}
            onMouseLeave={() => setHoveredPlatform(null)}
            className="flex-1 flex flex-col items-center justify-center gap-1.5 border-none outline-none"
            style={{
              background: 'transparent', cursor: 'pointer',
              opacity: hovered ? 1 : 0,
              transform: hovered ? 'translateY(0px)' : 'translateY(14px)',
              transition: 'opacity 240ms cubic-bezier(0.34,1.56,0.64,1) 100ms, transform 300ms cubic-bezier(0.34,1.56,0.64,1) 100ms',
            }}
          >
            <div className="w-9 h-9 rounded-none flex items-center justify-center"
              style={{
                background: hoveredPlatform === 'shopify' ? '#BBDFC8' : '#F0FDF4',
                transform: hoveredPlatform === 'shopify' ? 'scale(1.12)' : 'scale(1)',
                transition: 'transform 200ms cubic-bezier(0.34,1.56,0.64,1), background 140ms ease',
              }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M16 7c-.5-1.5-2-2.5-3.5-2.5-1 0-2 .5-2.5 1.5C9.5 7 9 7 9 7L7.5 17.5l9 1.5L18 9c0 0-1.5-.5-2-2z" fill="#96BF48" opacity="0.2"/>
                <path d="M9 7s.5-1.5 2-2 2.5 0 3 1M7.5 17.5l9 1.5L18 9" stroke="#5A8A3C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="9" cy="20" r="1.2" fill="#5A8A3C"/>
                <circle cx="15" cy="20" r="1.2" fill="#5A8A3C"/>
              </svg>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#1F2937', letterSpacing: '-0.01em' }}>Shopify</span>
            <span style={{ fontSize: 9.5, color: '#9CA3AF', fontWeight: 500 }}>Gallery only</span>
          </button>
        </div>
      </div>

      {/* Footer — mirrors the two-line structure of regular project tile footers */}
      <div className="px-3 py-2.5">
        <p className="text-sm font-semibold truncate" style={{
          color: hovered ? '#111827' : '#9CA3AF',
          transition: 'color 180ms ease',
        }}>New project</p>
        <p className="text-[10px] text-gray-400 mt-0.5">Amazon · Shopify</p>
      </div>
    </div>
  )
}

// ─── Sign-in page (shown before auth) ────────────────────────────────────────

type SignInMode = 'signin' | 'signup' | 'magic' | 'reset'

function SignInPage() {
  const [mode, setMode]         = useState<SignInMode>('signin')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [info, setInfo]         = useState<string | null>(null)
  const [busy, setBusy]         = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => {
    setTimeout(() => emailRef.current?.focus(), 80)
  }, [mode])

  const switchMode = (m: SignInMode) => { setMode(m); setError(null); setInfo(null) }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setInfo(null); setBusy(true)
    const callbackUrl = `${window.location.origin}/auth/callback`
    try {
      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        })
        if (error) throw error
        setInfo('Check your email for a reset link.')
        return
      }
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: callbackUrl } })
        if (error) throw error
        setInfo('Link sent — check your inbox.')
        return
      }
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callbackUrl } })
        if (error) throw error
        setInfo('Check your email to confirm your account.')
        return
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const heading = mode === 'reset' ? 'Reset password' : mode === 'magic' ? 'Magic link' : mode === 'signup' ? 'Create account' : 'Welcome back'
  const subheading = mode === 'reset' ? "We'll send a reset link to your email." : mode === 'magic' ? "We'll email you a one-click sign-in link." : mode === 'signup' ? 'Set up your DocsDiesel workspace.' : 'Sign in to your DocsDiesel workspace.'

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Left — form panel ── */}
      <div className="w-[480px] shrink-0 flex flex-col bg-white dark:bg-gray-950 border-r border-gray-100 dark:border-gray-800">

        {/* Brand */}
        <div className="flex items-center gap-2.5 px-10 pt-9">
          <img src="/Favicon.svg" alt="" className="w-5 h-5 object-contain shrink-0" />
          <span className="text-[13px] font-semibold text-gray-900 dark:text-white tracking-tight">Doc&rsquo;s Design Generator</span>
        </div>

        {/* Form block — vertically centered */}
        <div className="flex-1 flex items-center justify-center px-10">
          <div className="w-full max-w-sm">
            <h1 className="text-[26px] font-bold text-gray-900 dark:text-white tracking-tight mb-1">{heading}</h1>
            <p className="text-[13px] text-gray-400 dark:text-gray-500 mb-8">{subheading}</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1.5">Email</label>
                <input
                  ref={emailRef}
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="you@docsdiesel.com"
                  className="w-full h-10 px-3 text-[13px] border border-gray-200 dark:border-gray-700 rounded-none bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-300 dark:placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-900/10 dark:focus:ring-white/10 focus:border-gray-400 dark:focus:border-gray-500 transition-all"
                />
              </div>

              {mode !== 'magic' && mode !== 'reset' && (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1.5">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    placeholder="••••••••"
                    className="w-full h-10 px-3 text-[13px] border border-gray-200 dark:border-gray-700 rounded-none bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder:text-gray-300 dark:placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-900/10 dark:focus:ring-white/10 focus:border-gray-400 dark:focus:border-gray-500 transition-all"
                  />
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 px-3 py-2.5 rounded-none">
                  <svg className="w-3.5 h-3.5 text-red-400 mt-px shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-[12px] text-red-500 dark:text-red-400">{error}</p>
                </div>
              )}
              {info && (
                <div className="flex items-start gap-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 px-3 py-2.5 rounded-none">
                  <svg className="w-3.5 h-3.5 text-emerald-500 mt-px shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-[12px] text-emerald-600 dark:text-emerald-400">{info}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={busy || !!info}
                className="w-full h-10 rounded-none bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[12px] font-bold uppercase tracking-widest hover:bg-gray-700 dark:hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors mt-1"
              >
                {busy ? 'Please wait…' : mode === 'reset' ? 'Send reset link' : mode === 'magic' ? 'Send magic link' : mode === 'signup' ? 'Create account' : 'Sign in'}
              </button>
            </form>

            {/* Secondary links */}
            <div className="mt-5 space-y-2 text-center">
              {mode === 'signin' && (
                <>
                  <div>
                    <button type="button" onClick={() => switchMode('signup')} className="text-[12px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors font-medium">New here? Create an account →</button>
                  </div>
                  <div>
                    <button type="button" onClick={() => switchMode('reset')} className="text-[12px] text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Forgot password?</button>
                  </div>
                  <div>
                    <button type="button" onClick={() => switchMode('magic')} className="text-[12px] text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Send a magic link instead →</button>
                  </div>
                </>
              )}
              {mode === 'signup' && (
                <>
                  <div>
                    <button type="button" onClick={() => switchMode('signin')} className="text-[12px] text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">← Already have an account?</button>
                  </div>
                  <div>
                    <button type="button" onClick={() => switchMode('magic')} className="text-[12px] text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Send a magic link instead →</button>
                  </div>
                </>
              )}
              {(mode === 'magic' || mode === 'reset') && (
                <button type="button" onClick={() => switchMode('signin')} className="text-[12px] text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">← Back to sign in</button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="px-10 pb-9 text-[11px] text-gray-300 dark:text-gray-700">DocsDiesel internal tool · Not for distribution</p>
      </div>

      {/* ── Right — video panel ── */}
      <div className="flex-1 relative overflow-hidden bg-gray-100 dark:bg-gray-900">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          src="/Sign in video.mov"
        />
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const router = useRouter()
  const { user, loading: authLoading, signOut } = useAuth()
  const [docsOpen, setDocsOpen]           = useState(false)
  const [changelogOpen, setChangelogOpen] = useState(false)
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

  // Search / filter / sort / view
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'updated' | 'name' | 'type'>('updated')
  const [typeFilter, setTypeFilter] = useState<'all' | 'amazon' | 'shopify'>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
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

  // ── Derived: filtered + sorted projects ───────────────────────────────────

  const filteredProjects = useMemo(() => {
    let result = [...projects]
    if (typeFilter !== 'all') result = result.filter(p => p.project_type === typeFilter)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      result = result.filter(p => (p.name || '').toLowerCase().includes(q))
    }
    if (sortBy === 'name') result.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    else if (sortBy === 'type') result.sort((a, b) => a.project_type.localeCompare(b.project_type))
    return result
  }, [projects, typeFilter, searchQuery, sortBy])

  const isLoading = authLoading || loading

  // ── Selection helpers ──────────────────────────────────────────────────────

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const selectAll = () => setSelectedIds(new Set(projects.map(p => p.id)))
  const clearSelection = () => setSelectedIds(new Set())
  const allSelected = projects.length > 0 && selectedIds.size === projects.length

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleNewProject = async (platform: 'amazon' | 'shopify') => {
    if (!user || creating) return
    setCreating(true)
    setCreateError(null)
    try {
      const id = await createProject(supabase, user.id, 'Untitled', EMPTY_PROJECT_STATE, platform)
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

  const handleDeleteProject = useCallback((id: string) => {
    setMenuOpenId(null)
    setDeleteTarget([id])
  }, [])

  const handleDuplicate = useCallback(async (id: string) => {
    setMenuOpenId(null)
    const res = await fetch(`/api/projects/${id}/duplicate`, { method: 'POST' })
    if (!res.ok) return
    const { id: newId } = await res.json()
    if (!newId || !user) return
    listProjects(supabase, user.id)
      .then(setProjects)
      .catch(console.error)
  }, [supabase, user])

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

  const startRename = useCallback((project: ProjectRow) => {
    setMenuOpenId(null)
    setRenamingId(project.id)
    setRenameValue(project.name || 'Untitled')
  }, [])

  // Track latest renameValue in a ref so commitRename doesn't need it as a dep
  const renameValueRef = useRef(renameValue)
  renameValueRef.current = renameValue

  const commitRename = useCallback(async (id: string) => {
    const name = renameValueRef.current.trim() || 'Untitled'
    setProjects(ps => ps.map(p => p.id === id ? { ...p, name } : p))
    setRenamingId(null)
    try {
      await renameProject(supabase, id, name)
    } catch (err) {
      console.error('Failed to rename project:', err)
    }
  }, [supabase])

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>, id: string) => {
    if (e.key === 'Enter') commitRename(id)
    if (e.key === 'Escape') setRenamingId(null)
  }, [commitRename])

  const handleToggleMenu = useCallback((id: string) => {
    setMenuOpenId(prev => prev === id ? null : id)
  }, [])

  const handleCloseMenu = useCallback(() => setMenuOpenId(null), [])

  // ── Counts for filter pills ───────────────────────────────────────────────
  const amazonCount = projects.filter(p => p.project_type === 'amazon').length
  const shopifyCount = projects.filter(p => p.project_type === 'shopify').length

  // ── User menu ────────────────────────────────────────────────────────────
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!userMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (!userMenuRef.current?.contains(e.target as Node)) setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [userMenuOpen])

  // ── App settings ──────────────────────────────────────────────────────────
  const { settings: appSettings, update: updateAppSettings } = useAppSettings()

  // ── New Project picker ────────────────────────────────────────────────────
  const [platformPickerOpen, setPlatformPickerOpen] = useState(false)
  const platformPickerRef = useRef<HTMLDivElement>(null)
  const platformPickerOpenRef = useRef(false)
  platformPickerOpenRef.current = platformPickerOpen

  // ── Shortcuts modal ───────────────────────────────────────────────────────
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const handleNewProjectRef = useRef(handleNewProject)
  handleNewProjectRef.current = handleNewProject

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement

      // ⌘/ works from anywhere — move before inInput guard
      if ((e.metaKey || e.ctrlKey) && e.key === '/') { e.preventDefault(); setShortcutsOpen(o => !o); return }

      if (e.key === 'Escape') {
        setShortcutsOpen(false)
        setPlatformPickerOpen(false)
        setUserMenuOpen(false)
        if (inInput) { setSearchQuery(''); (e.target as HTMLInputElement).blur() }
        return
      }
      if (inInput) return

      if (e.key === '/') { e.preventDefault(); searchInputRef.current?.focus(); return }

      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        if (user) setPlatformPickerOpen(o => !o)
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return

      // When picker is open: A = Amazon, S = Shopify (read via ref — no stale closure)
      if (platformPickerOpenRef.current) {
        if (e.key === 'a' || e.key === 'A') { e.preventDefault(); setPlatformPickerOpen(false); handleNewProjectRef.current('amazon'); return }
        if (e.key === 's' || e.key === 'S') { e.preventDefault(); setPlatformPickerOpen(false); handleNewProjectRef.current('shopify'); return }
      }

      switch (e.key) {
        case 'n': case 'N': if (user) setPlatformPickerOpen(o => !o); break
        case 'g': case 'G': setViewMode('grid'); break
        case 'l': case 'L': setViewMode('list'); break
        case '1': setTypeFilter('all'); break
        case '2': setTypeFilter('amazon'); break
        case '3': setTypeFilter('shopify'); break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [user])

  useEffect(() => {
    if (!platformPickerOpen) return
    const handler = (e: MouseEvent) => {
      if (!platformPickerRef.current?.contains(e.target as Node)) setPlatformPickerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [platformPickerOpen])

  const handleNewProjectFromHeader = async (platform: 'amazon' | 'shopify') => {
    setPlatformPickerOpen(false)
    await handleNewProject(platform)
  }

  // ── Shared sidebar ────────────────────────────────────────────────────────
  const platformPickerDropdown = platformPickerOpen && (
    <div className="absolute left-0 top-full mt-1 z-50 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-none shadow-lg overflow-hidden animate-scale-in">
      <div className="px-2 pt-2 pb-1.5 space-y-0.5">
        <button
          onClick={() => handleNewProjectFromHeader('amazon')}
          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-none hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group text-left"
        >
          <div className="w-7 h-7 rounded-none flex items-center justify-center shrink-0 bg-[#FFF3E0]">
            <AmazonMark className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-gray-900 dark:text-white">Amazon</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">A+ Content &amp; Gallery</p>
          </div>
          <kbd className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-none border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-400 dark:text-gray-400 font-mono text-[10px] font-semibold leading-none shrink-0">A</kbd>
        </button>
        <button
          onClick={() => handleNewProjectFromHeader('shopify')}
          className="w-full flex items-center gap-2.5 px-2 py-2 rounded-none hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group text-left"
        >
          <div className="w-7 h-7 rounded-none flex items-center justify-center shrink-0 bg-[#F0F9EE]">
            <ShopifyMark className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-gray-900 dark:text-white">Shopify</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">Gallery images only</p>
          </div>
          <kbd className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-none border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-400 dark:text-gray-400 font-mono text-[10px] font-semibold leading-none shrink-0">S</kbd>
        </button>
        <div className="w-full flex items-center gap-2.5 px-2 py-2 rounded-none opacity-40 cursor-not-allowed">
          <div className="w-7 h-7 rounded-none flex items-center justify-center shrink-0 bg-gray-100 dark:bg-gray-800">
            <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none">
              <path d="M3 12c0-2 1.5-3.5 3.5-3.5S10 10 10 12s-1.5 3.5-3.5 3.5S3 14 3 12zM10 12h11M17 8l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-gray-500 dark:text-gray-400">eBay</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">Coming soon</p>
          </div>
        </div>
      </div>
      <div className="h-1" />
    </div>
  )

  // ── Not signed in ──────────────────────────────────────────────────────────
  if (!authLoading && !user) {
    return <SignInPage />
  }

  // ── Main dashboard ─────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950">

      {/* ── Sidebar ── */}
      <aside className="w-72 shrink-0 flex flex-col bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-700 shadow-sm z-10">

        {/* Brand */}
        <div className="h-12 flex items-center gap-2.5 px-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div className="w-6 h-6 rounded-none overflow-hidden shrink-0 bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <img src="/Favicon.svg" alt="" className="w-5 h-5 object-contain" />
          </div>
          <span className="heading-sm truncate">Doc&rsquo;s Design Generator</span>
        </div>

        {/* New Project */}
        <div className="px-4 pt-3 pb-3 shrink-0 border-b border-gray-100 dark:border-gray-800">
          <div ref={platformPickerRef} className="relative">
            <button
              onClick={() => setPlatformPickerOpen(o => !o)}
              disabled={creating || !user}
              className="btn btn-md btn-primary w-full active:scale-[0.97]"
            >
              {creating ? (
                <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              )}
              New Project
            </button>
            {platformPickerDropdown}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto">

          {/* Search */}
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search projects…"
                className="input input-sm w-full pl-8 pr-7 bg-gray-50 dark:bg-gray-800/60"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center">
                  <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Projects filter */}
          <DashboardSection
            title="Projects"
            defaultOpen
            icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>}
            contentPadding="py-1 pb-2"
          >
            {([
              {
                key: 'all' as const, label: 'All Projects', count: projects.length,
                icon: <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>,
              },
              {
                key: 'amazon' as const, label: 'Amazon', count: amazonCount,
                icon: <AmazonMark className="w-3.5 h-3.5 shrink-0" />,
              },
              {
                key: 'shopify' as const, label: 'Shopify', count: shopifyCount,
                icon: <ShopifyMark className="w-3.5 h-3.5 shrink-0" />,
              },
            ] as const).map(({ key, label, count, icon }) => (
              <button
                key={key}
                onClick={() => setTypeFilter(key)}
                className={`w-full flex items-center gap-2 px-4 py-1.5 text-[12px] transition-colors ${
                  typeFilter === key
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-medium'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <span className={`transition-colors ${typeFilter === key ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`}>{icon}</span>
                <span className="flex-1 text-left">{label}</span>
                {!isLoading && count > 0 && (
                  <span className={`text-[10px] tabular-nums font-medium ${typeFilter === key ? 'text-gray-500 dark:text-gray-400' : 'text-gray-300 dark:text-gray-600'}`}>{count}</span>
                )}
              </button>
            ))}
          </DashboardSection>

          {/* Sort */}
          <DashboardSection
            title="Sort"
            defaultOpen
            icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M6 12h12M9 17h6" /></svg>}
            contentPadding="relative py-1 pb-2"
          >
            {/* sliding accent bar — translates by item index × item height (h-8 = 32px) */}
            <span
              className="absolute left-4 w-0.5 h-3.5 bg-accent-500 transition-transform duration-200 ease-out pointer-events-none"
              style={{ top: 13, transform: `translateY(${['updated','name','type'].indexOf(sortBy) * 32}px)` }}
            />
            {([
              { value: 'updated' as const, label: 'Last modified' },
              { value: 'name' as const, label: 'Name A–Z' },
              { value: 'type' as const, label: 'Platform' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                onClick={() => setSortBy(opt.value)}
                className={`w-full flex items-center gap-3 px-4 h-8 text-[12px] transition-colors ${
                  sortBy === opt.value
                    ? 'text-gray-900 dark:text-white font-medium'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <span className="w-0.5 shrink-0" />{/* layout spacer matching indicator width */}
                {opt.label}
              </button>
            ))}
          </DashboardSection>

          {/* View */}
          <DashboardSection
            title="View"
            icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>}
          >
            <div className="relative flex p-1 bg-gray-100 dark:bg-gray-800">
              <div aria-hidden className="absolute top-1 bottom-1 bg-white dark:bg-gray-700 shadow-sm pointer-events-none transition-transform duration-150 ease-out" style={{ left: 4, width: 'calc(50% - 6px)', transform: viewMode === 'list' ? 'translateX(calc(100% + 4px))' : 'translateX(0)' }} />
              {([
                { mode: 'grid' as const, label: 'Grid', icon: <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 16 16"><rect x="1" y="1" width="6" height="6"/><rect x="9" y="1" width="6" height="6"/><rect x="1" y="9" width="6" height="6"/><rect x="9" y="9" width="6" height="6"/></svg> },
                { mode: 'list' as const, label: 'List', icon: <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg> },
              ]).map(({ mode, label, icon }) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`relative flex items-center justify-center gap-1.5 flex-1 h-6 text-[11px] font-medium transition-colors ${
                    viewMode === mode
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {icon}{label}
                </button>
              ))}
            </div>
          </DashboardSection>

          {/* Settings */}
          <DashboardSection
            title="Settings"
            icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>}
          >
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Theme</p>
                <div className="relative flex p-1 bg-gray-100 dark:bg-gray-800">
                  <div aria-hidden className="absolute top-1 bottom-1 bg-white dark:bg-gray-700 shadow-sm pointer-events-none transition-transform duration-150 ease-out" style={{ left: 4, width: 'calc(50% - 6px)', transform: appSettings.theme === 'dark' ? 'translateX(calc(100% + 4px))' : 'translateX(0)' }} />
                  {(['light', 'dark'] as const).map(t => (
                    <button key={t} onClick={() => updateAppSettings({ theme: t })}
                      className={`relative flex items-center justify-center gap-1.5 flex-1 h-6 text-[11px] font-medium transition-colors ${
                        appSettings.theme === t ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                      }`}
                    >
                      {t === 'light' ? <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="4"/><path strokeLinecap="round" d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg> : <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>}
                      {t === 'light' ? 'Light' : 'Dark'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">Export format</p>
                <div className="relative flex p-1 bg-gray-100 dark:bg-gray-800">
                  <div aria-hidden className="absolute top-1 bottom-1 bg-white dark:bg-gray-700 shadow-sm pointer-events-none transition-transform duration-150 ease-out" style={{ left: 4, width: 'calc(50% - 6px)', transform: appSettings.exportFormat === 'jpeg' ? 'translateX(calc(100% + 4px))' : 'translateX(0)' }} />
                  {(['png', 'jpeg'] as const).map(f => (
                    <button key={f} onClick={() => updateAppSettings({ exportFormat: f })}
                      className={`relative flex-1 h-6 text-[11px] font-semibold transition-colors uppercase tracking-wide ${
                        appSettings.exportFormat === f ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                      }`}
                    >{f}</button>
                  ))}
                </div>
              </div>
            </div>
          </DashboardSection>

          {/* Help */}
          <DashboardSection
            title="Help"
            icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            contentPadding="py-1 pb-2"
          >
            <button onClick={() => setDocsOpen(true)} className="w-full flex items-center gap-2 px-4 py-1.5 text-[12px] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-white transition-colors text-left">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
              Documentation
            </button>
            <button onClick={() => setChangelogOpen(true)} className="w-full flex items-center gap-2 px-4 py-1.5 text-[12px] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-white transition-colors text-left">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Changelog
            </button>
            <button onClick={() => setShortcutsOpen(true)} className="w-full flex items-center justify-between gap-2 px-4 py-1.5 text-[12px] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-white transition-colors">
              <span className="flex items-center gap-2">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                Shortcuts
              </span>
              <div className="flex items-center gap-0.5">
                <kbd className="inline-flex items-center justify-center px-1.5 h-[18px] border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 font-mono text-[10px] font-semibold text-gray-400 dark:text-gray-500 leading-none shadow-[0_1px_0_rgba(0,0,0,0.1)]">⌘</kbd>
                <kbd className="inline-flex items-center justify-center px-1.5 h-[18px] border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 font-mono text-[10px] font-semibold text-gray-400 dark:text-gray-500 leading-none shadow-[0_1px_0_rgba(0,0,0,0.1)]">/</kbd>
              </div>
            </button>
          </DashboardSection>
        </nav>

        {/* User */}
        <div className="shrink-0 px-4 py-3 border-t border-gray-100 dark:border-gray-800">
          <div ref={userMenuRef} className="relative">
            <button
              onClick={() => setUserMenuOpen(o => !o)}
              className="w-full flex items-center gap-2.5 px-2 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left group"
            >
              <div className="w-6 h-6 rounded-full bg-gray-900 dark:bg-gray-100 flex items-center justify-center text-white dark:text-gray-900 text-[10px] font-bold shrink-0 tabular-nums">
                {(user?.email ?? '?')[0].toUpperCase()}
              </div>
              <span className="body-sm truncate flex-1">{user?.email}</span>
              <svg className="w-3 h-3 text-gray-300 dark:text-gray-600 shrink-0 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
              </svg>
            </button>
            {userMenuOpen && (
              <div className="absolute left-0 bottom-full mb-1 z-50 w-full menu animate-scale-in">
                <button onClick={() => { setUserMenuOpen(false); signOut() }} className="menu-item text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20">
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* Page header */}
        <div className="h-12 flex items-center justify-between px-6 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="heading-sm">
              {typeFilter === 'all' ? 'All Projects' : typeFilter === 'amazon' ? 'Amazon' : 'Shopify'}
            </h1>
            {!isLoading && filteredProjects.length > 0 && (
              <span className="badge badge-default">{filteredProjects.length}</span>
            )}
          </div>
          {isSelectMode && (
            <div className="flex items-center gap-2">
              <button onClick={allSelected ? clearSelection : selectAll} className="btn btn-sm btn-ghost">
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
              <div className="w-px h-4 bg-gray-200 dark:bg-gray-700" />
              <button onClick={handleDeleteSelected} className="btn btn-sm btn-danger">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                Delete {selectedIds.size}
              </button>
              <button onClick={clearSelection} className="btn btn-sm btn-secondary">
                Cancel
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div>

          {/* Error banner */}
          {createError && (
            <div className="mb-5 px-4 py-3 rounded-none bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 flex items-start gap-3">
              <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-semibold text-red-700 dark:text-red-400">Failed to create project</p>
                <p className="text-[11px] text-red-500 dark:text-red-500 mt-0.5">{createError}</p>
              </div>
              <button onClick={() => setCreateError(null)} className="shrink-0 text-red-300 hover:text-red-500 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-32">
              <svg className="animate-spin w-5 h-5 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}

          {/* Content */}
          {!isLoading && (
            <>
              {/* Empty state */}
              {projects.length === 0 && (
                <div className="flex flex-col items-center max-w-[280px] mx-auto pt-16 text-center">
                  <div className="w-12 h-12 rounded-none bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                    <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <p className="heading-sm mb-1">Create your first project</p>
                  <p className="body-sm mb-6 leading-relaxed">Press <kbd className="font-mono text-[10px] px-1 py-0.5 rounded-none border border-gray-200 dark:border-gray-700">N</kbd> or use New Project in the sidebar.</p>
                  <div className="w-full space-y-2 text-left">
                    {(['Import products via CSV', 'Fill templates with content', 'Export to Canto'] as const).map((label, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="w-5 h-5 rounded-none bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 flex items-center justify-center shrink-0 text-[9px] font-bold tabular-nums">{i + 1}</span>
                        <p className="body-sm">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No results */}
              {projects.length > 0 && filteredProjects.length === 0 && (searchQuery || typeFilter !== 'all') && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <svg className="w-8 h-8 text-gray-200 dark:text-gray-700 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <p className="heading-sm mb-1">No results</p>
                  <p className="body-sm mb-4">No projects match your current filters.</p>
                  <button onClick={() => { setSearchQuery(''); setTypeFilter('all') }} className="btn btn-sm btn-secondary">
                    Clear filters
                  </button>
                </div>
              )}

              {/* Grid or List */}
              {filteredProjects.length > 0 && (
                viewMode === 'grid' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {filteredProjects.map((project, idx) => (
                      <ProjectCard
                        key={project.id} project={project}
                        isSelected={selectedIds.has(project.id)} isSelectMode={isSelectMode}
                        isMenuOpen={menuOpenId === project.id} isRenaming={renamingId === project.id}
                        renameValue={renamingId === project.id ? renameValue : undefined}
                        renameInputRef={renameInputRef} animationDelay={idx * 30} viewMode="grid"
                        productCount={project.template_state?.products?.length ?? 0}
                        onToggleSelect={toggleSelect} onToggleMenu={handleToggleMenu} onCloseMenu={handleCloseMenu}
                        onStartRename={startRename} onCommitRename={commitRename} onRenameKeyDown={handleRenameKeyDown}
                        onSetRenameValue={setRenameValue} onDelete={handleDeleteProject} onDuplicate={handleDuplicate}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-none border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                    {filteredProjects.map((project, idx) => (
                      <ProjectCard
                        key={project.id} project={project}
                        isSelected={selectedIds.has(project.id)} isSelectMode={isSelectMode}
                        isMenuOpen={menuOpenId === project.id} isRenaming={renamingId === project.id}
                        renameValue={renamingId === project.id ? renameValue : undefined}
                        renameInputRef={renameInputRef} animationDelay={idx * 15} viewMode="list"
                        productCount={project.template_state?.products?.length ?? 0}
                        onToggleSelect={toggleSelect} onToggleMenu={handleToggleMenu} onCloseMenu={handleCloseMenu}
                        onStartRename={startRename} onCommitRename={commitRename} onRenameKeyDown={handleRenameKeyDown}
                        onSetRenameValue={setRenameValue} onDelete={handleDeleteProject} onDuplicate={handleDuplicate}
                      />
                    ))}
                  </div>
                )
              )}
            </>
          )}

          </div>
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

      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <DocsDrawer open={docsOpen} onClose={() => setDocsOpen(false)} />
      <ChangelogDrawer open={changelogOpen} onClose={() => setChangelogOpen(false)} />
    </div>
  )
}

function DashboardSection({ title, icon, defaultOpen = false, contentPadding = 'px-4 pb-4 pt-1', children }: {
  title: string
  icon?: React.ReactNode
  defaultOpen?: boolean
  contentPadding?: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-gray-100 dark:border-gray-800 last:border-b-0">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left group">
        <div className="flex items-center gap-2">
          {icon && <span className="text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400 transition-colors">{icon}</span>}
          <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-colors">{title}</span>
        </div>
        <svg className={`w-3 h-3 text-gray-300 dark:text-gray-600 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows 200ms ease' }}>
        <div style={{ overflow: 'hidden' }}>
          <div className={contentPadding}>{children}</div>
        </div>
      </div>
    </div>
  )
}
