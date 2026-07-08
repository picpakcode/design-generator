export type ChangeKind = 'new' | 'improved' | 'fixed'

export interface Change {
  kind: ChangeKind
  text: string
}

export interface Release {
  id: string
  date: string
  label: string
  changes: Change[]
}

export const RELEASES: Release[] = [
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
