'use client'

import { useEffect, useRef, useState } from 'react'

// ─── Data ─────────────────────────────────────────────────────────────────────

type ChangeKind = 'new' | 'improved' | 'fixed'

interface Change {
  kind: ChangeKind
  text: string
}

interface Release {
  id: string
  date: string
  label: string
  changes: Change[]
}

const RELEASES: Release[] = [
  {
    id: 'jul-8-2026',
    date: 'Jul 8, 2026',
    label: 'Collaboration, session locking & shared projects',
    changes: [
      { kind: 'new',      text: 'Session locking — only one editor at a time per project. Lock is held for 45 s and renewed every 20 s via heartbeat; expires automatically if the tab is closed.' },
      { kind: 'new',      text: 'Amber banner appears for anyone opening a project that\'s currently being edited by someone else, showing the editor\'s email and a "Take over editing" button.' },
      { kind: 'new',      text: 'Autosave is gated on holding the edit lock — opening a project in a second tab or as a collaborator never overwrites the active editor\'s session.' },
      { kind: 'new',      text: '"Shared with me" section on the dashboard — projects accessed via a shared URL appear here automatically after the first visit, no manual pinning needed.' },
      { kind: 'new',      text: 'Sign-up flow now works without email confirmation — accounts are active immediately after creation.' },
      { kind: 'new',      text: 'Sign-in page now includes a "Create account" entry point — the link was previously missing from the welcome screen.' },
      { kind: 'fixed',    text: '"Saving…" status no longer freezes when the edit lock is taken by another user mid-save — status resets to idle immediately on lock loss.' },
      { kind: 'fixed',    text: 'Collaborators opening a shared project URL now see the canvas instead of a blank editor — RLS policies updated to allow any authenticated user to read and edit shared projects.' },
    ],
  },
  {
    id: 'jul-6-2026',
    date: 'Jul 6, 2026',
    label: 'Micro-interactions & share page polish',
    changes: [
      { kind: 'new',      text: 'Canvas block selection ring animates in with a subtle scale-pop — blocks spring from 99.5% to 100% on click.' },
      { kind: 'new',      text: 'Sidebar panels crossfade when switching between slots in Template Mode.' },
      { kind: 'new',      text: 'Asset thumbnail bounces when a photo or icon is assigned to a slot.' },
      { kind: 'new',      text: 'Save status indicator now draws the checkmark in with an SVG stroke animation instead of a static icon.' },
      { kind: 'new',      text: 'Zoom +/− buttons and the percentage display have a tactile press-down feel on the canvas HUD.' },
      { kind: 'improved', text: 'Share link product selector is now a compact dropdown with the current product name truncated — replaces the scrolling wall of full-name pills.' },
      { kind: 'improved', text: 'Dashboard project cards zoom and show a dark scrim on hover for a cleaner browse experience.' },
      { kind: 'improved', text: 'Dashboard format and sort toggles animate with a sliding pill instead of an instant colour swap.' },
      { kind: 'fixed',    text: 'Canto gallery (1500×1500 px) uploads failing with HTTP 413 — images are now converted to JPEG client-side before upload, keeping payloads under Vercel\'s 4.5 MB body limit.' },
    ],
  },
  {
    id: 'jul-2026',
    date: 'Jul 2, 2026',
    label: 'Design system overhaul',
    changes: [
      { kind: 'improved', text: 'Switched to 0 px border radius across all controls, menus, and modals for a sharper, more editorial feel.' },
      { kind: 'improved', text: 'Dark theme now uses a true-neutral (zinc) palette — no more blue cast on dark backgrounds.' },
      { kind: 'improved', text: 'Dashboard sidebar redesigned to match the canvas sidebar: collapsible sections, consistent header hierarchy, and smooth section toggles.' },
      { kind: 'new',      text: 'Sort indicator in the sidebar now slides smoothly between options instead of toggling.' },
      { kind: 'new',      text: 'SVG favicon replaces the PNG version for crisp rendering at all sizes.' },
      { kind: 'fixed',    text: 'Status badge colours (Approved, Revisions, Comments) now adapt correctly to dark mode.' },
      { kind: 'fixed',    text: 'Sidebar inputs and the rich-text editor use correct neutral colours in dark mode.' },
    ],
  },
  {
    id: 'jun-2026',
    date: 'Jun 17, 2026',
    label: 'Canto integration & export',
    changes: [
      { kind: 'new',      text: 'Save designs directly to Canto DAM — pick any album and upload individual slots or a full export.' },
      { kind: 'new',      text: 'Album picker is now scheme-aware: folders are tried first, falling back to album search automatically.' },
      { kind: 'new',      text: 'Selective slot export — choose exactly which slots to include from the export dropdown.' },
      { kind: 'improved', text: 'Product names in Canto filenames are sanitised to remove special characters that caused upload failures.' },
      { kind: 'improved', text: 'Full error messages from the Canto API are surfaced in the UI instead of generic failure notices.' },
      { kind: 'fixed',    text: 'Non-JSON Canto upload responses no longer crash the export flow.' },
    ],
  },
  {
    id: 'may-2026',
    date: 'May 2026',
    label: 'Template mode & bulk editing',
    changes: [
      { kind: 'new',      text: 'Template Mode: switch between A+ 50/50 and A+ Icons layouts per slot without losing content.' },
      { kind: 'new',      text: 'Bulk Mode: import a CSV to generate designs for multiple products in one pass.' },
      { kind: 'new',      text: 'Gallery preview modal with per-format zoom and side-by-side slot comparison.' },
      { kind: 'improved', text: 'Presets panel now shows a live scaled preview of each template before you apply it.' },
      { kind: 'improved', text: 'Autosave interval is configurable per project in workspace settings.' },
      { kind: 'fixed',    text: 'Canvas thumbnail generation no longer fails on projects with empty text slots.' },
    ],
  },
  {
    id: 'apr-2026',
    date: 'Apr 2026',
    label: 'Collaboration & feedback',
    changes: [
      { kind: 'new',      text: 'Share view: generate a read-only link to share designs with clients or stakeholders.' },
      { kind: 'new',      text: 'Feedback panel: reviewers can leave block-level comments and set approval status (Approved / Revisions / Open).' },
      { kind: 'new',      text: 'Approval badges appear on canvas blocks so the design state is visible at a glance.' },
      { kind: 'improved', text: 'Share links now support gallery and template modes, not only single-slot views.' },
    ],
  },
  {
    id: 'mar-2026',
    date: 'Mar 2026',
    label: 'Workspace foundations',
    changes: [
      { kind: 'new',      text: 'Design workspace with real-time canvas rendering, zoom, and pan.' },
      { kind: 'new',      text: 'Asset uploader: drag-and-drop images directly onto any slot.' },
      { kind: 'new',      text: 'Typography controls: font family, size, weight, colour, line height, and letter spacing per text layer.' },
      { kind: 'new',      text: 'Spacing and layout controls: inner padding, gap, and column/row configuration.' },
      { kind: 'new',      text: 'Export to PNG or JPEG at configurable quality. Individual slots or full-page batch export.' },
      { kind: 'new',      text: 'Keyboard shortcuts panel (⌘ /) with all workspace shortcuts listed.' },
      { kind: 'new',      text: 'Dark mode and light mode toggle, synced across sessions.' },
    ],
  },
]

const KIND_META: Record<ChangeKind, { label: string; className: string }> = {
  new:      { label: 'New',      className: 'bg-accent-50 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300 border-accent-200 dark:border-accent-800/40' },
  improved: { label: 'Improved', className: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/40' },
  fixed:    { label: 'Fixed',    className: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40' },
}

function Badge({ kind }: { kind: ChangeKind }) {
  const m = KIND_META[kind]
  return (
    <span className={`inline-flex items-center shrink-0 h-[18px] px-1.5 text-[9px] font-bold uppercase tracking-widest border ${m.className}`}>
      {m.label}
    </span>
  )
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

interface ChangelogDrawerProps {
  open: boolean
  onClose: () => void
}

export default function ChangelogDrawer({ open, onClose }: ChangelogDrawerProps) {
  const [mounted, setMounted] = useState(false)
  const [closing, setClosing] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) { setMounted(true); setClosing(false) }
    else if (mounted) {
      setClosing(true)
      const t = setTimeout(() => { setMounted(false); setClosing(false) }, 300)
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

  const scrollTo = (id: string) => {
    const el = scrollRef.current?.querySelector(`#${id}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-sm ${closing ? 'animate-fade-out' : 'animate-fade-in'}`}
        onClick={onClose}
      />

      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
        <div
          className={`pointer-events-auto w-full max-w-[1400px] flex flex-col bg-white dark:bg-gray-950 rounded-none shadow-[0_-8px_40px_rgba(0,0,0,0.18)] overflow-hidden ${
            closing ? 'animate-slide-down-full' : 'animate-slide-up-full'
          }`}
          style={{ height: 'calc(100vh - 3rem)' }}
        >
          {/* Header */}
          <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-none flex items-center justify-center bg-accent-100 dark:bg-accent-900/50">
                <svg className="w-3.5 h-3.5 text-accent-600 dark:text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-white leading-none">Changelog</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Updates shipped to Doc&rsquo;s Design Generator</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 dark:text-gray-600 hidden sm:block">Esc to close</span>
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-none text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex flex-1 min-h-0">
            {/* Sidebar nav */}
            <aside className="hidden md:flex flex-col shrink-0 w-44 border-r border-gray-100 dark:border-gray-800 py-5 px-3 bg-gray-50/60 dark:bg-gray-900/40">
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600 mb-2 px-2">Releases</p>
              <ul className="space-y-0.5">
                {RELEASES.map(r => (
                  <li key={r.id}>
                    <button
                      onClick={() => scrollTo(r.id)}
                      className="w-full text-left block px-2 py-1.5 text-[12px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      {r.date}
                    </button>
                  </li>
                ))}
              </ul>
            </aside>

            {/* Content */}
            <div ref={scrollRef} className="flex-1 min-w-0 overflow-y-auto">
              <div className="max-w-2xl px-8 py-8 pb-20">
                <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-1 tracking-tight">Changelog</h1>
                <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-10">Updates, improvements, and fixes shipped to Doc&rsquo;s Design Generator.</p>

                <div>
                  {RELEASES.map((release, i) => (
                    <div key={release.id} id={release.id} className="scroll-mt-6 flex gap-6 pb-10">
                      <div className="flex flex-col items-center shrink-0 pt-1">
                        <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600 shrink-0" />
                        {i < RELEASES.length - 1 && <div className="w-px flex-1 mt-2 bg-gray-200 dark:bg-gray-800" />}
                      </div>
                      <div className="flex-1 min-w-0 pb-2">
                        <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">{release.date}</p>
                        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-4">{release.label}</h2>
                        <ul className="space-y-3">
                          {release.changes.map((c, j) => (
                            <li key={j} className="flex items-start gap-3">
                              <Badge kind={c.kind} />
                              <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400 pt-px">{c.text}</p>
                            </li>
                          ))}
                        </ul>
                        {i < RELEASES.length - 1 && <div className="mt-8 border-b border-gray-100 dark:border-gray-800" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
