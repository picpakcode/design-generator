'use client'

import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Changelog data ───────────────────────────────────────────────────────────

const RELEASES: Release[] = [
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
      { kind: 'improved', text: 'Dashboard project grid is now full-width with a responsive column count — 2 on mobile up to 5 on wide screens.' },
      { kind: 'new',      text: 'Sign-in page redesigned with a 50/50 split layout and a looping video background.' },
      { kind: 'new',      text: 'Docs and Changelog open in slide-in drawers, keeping the dashboard visible in the background.' },
      { kind: 'new',      text: 'SVG favicon replaces the PNG version for crisp rendering at all sizes.' },
      { kind: 'improved', text: 'Docs drawer redesigned with a neutral palette and left-border section navigation — consistent with the editor sidebar.' },
      { kind: 'fixed',    text: 'Status badge colours (Approved, Revisions, Comments) now adapt correctly to dark mode.' },
      { kind: 'fixed',    text: 'Sidebar inputs and the rich-text editor use correct neutral colours in dark mode.' },
      { kind: 'fixed',    text: 'Logo auto-populate is now skipped for Shopify projects to prevent the Doc\'s wordmark from appearing on Shopify gallery frames.' },
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

// ─── Change badge ─────────────────────────────────────────────────────────────

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChangelogPage() {
  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950">

      {/* Top nav */}
      <header className="sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center gap-3">
        <Link href="/dashboard" className="flex items-center gap-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-[11px] font-semibold">Dashboard</span>
        </Link>
        <span className="w-px h-4 bg-gray-200 dark:bg-gray-700" />
        <img src="/Favicon.svg" alt="" className="w-5 h-5 object-contain shrink-0" />
        <span className="font-bold text-gray-900 dark:text-white text-sm tracking-tight">Changelog</span>
        <div className="flex-1" />
        <Link href="/docs" className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
          Docs
        </Link>
      </header>

      <div className="flex flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6">

        {/* Sidebar */}
        <aside className="hidden md:flex flex-col shrink-0 w-44 pt-8 pr-6">
          <nav className="sticky top-20">
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3 px-2">Releases</p>
            <ul className="space-y-0.5">
              {RELEASES.map(r => (
                <li key={r.id}>
                  <a
                    href={`#${r.id}`}
                    onClick={e => { e.preventDefault(); document.getElementById(r.id)?.scrollIntoView({ behavior: 'smooth' }) }}
                    className="block px-2 py-1.5 text-[12px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    {r.date}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0 py-10 pb-24">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1 tracking-tight">Changelog</h1>
          <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-10">Updates, improvements, and fixes shipped to Doc&rsquo;s Design Generator.</p>

          <div className="space-y-0">
            {RELEASES.map((release, i) => (
              <div key={release.id} id={release.id} className="scroll-mt-20 flex gap-6 pb-12">

                {/* Timeline spine */}
                <div className="flex flex-col items-center shrink-0 pt-1">
                  <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600 shrink-0" />
                  {i < RELEASES.length - 1 && (
                    <div className="w-px flex-1 mt-2 bg-gray-200 dark:bg-gray-800" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pb-2">
                  <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">{release.date}</p>
                  <h2 className="text-base font-bold text-gray-900 dark:text-white mb-5">{release.label}</h2>

                  <ul className="space-y-3">
                    {release.changes.map((c, j) => (
                      <li key={j} className="flex items-start gap-3">
                        <Badge kind={c.kind} />
                        <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400 pt-px">{c.text}</p>
                      </li>
                    ))}
                  </ul>

                  {i < RELEASES.length - 1 && (
                    <div className="mt-10 border-b border-gray-100 dark:border-gray-800" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
