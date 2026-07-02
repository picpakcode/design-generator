'use client'

import { useEffect } from 'react'

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center px-1.5 h-[18px] min-w-[18px] rounded-none border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-300 font-mono text-[10px] font-semibold leading-none shadow-[0_1px_0_rgba(0,0,0,0.15)] dark:shadow-[0_1px_0_rgba(0,0,0,0.5)]">
      {children}
    </kbd>
  )
}

function Row({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-[3px]">
      <span className="body-sm leading-none">{label}</span>
      <div className="flex items-center gap-0.5 shrink-0">
        {keys.map((k, i) => <Kbd key={i}>{k}</Kbd>)}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label-xs mb-2.5">{title}</p>
      <div className="space-y-[1px]">{children}</div>
    </div>
  )
}

interface Props {
  open: boolean
  onClose: () => void
}

export function ShortcutsModal({ open, onClose }: Props) {
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)
  const mod = isMac ? '⌘' : 'Ctrl'

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="modal-backdrop">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="modal-panel relative z-10 w-[560px] max-h-[82vh] overflow-hidden flex flex-col animate-scale-in">

        {/* Header */}
        <div className="modal-header shrink-0">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <h2 className="heading-sm">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="btn btn-sm btn-ghost w-7 px-0"
            aria-label="Close"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-2 gap-x-8 gap-y-6">

            <Section title="Dashboard — Projects">
              <Row keys={['N']} label="New project (open picker)" />
              <Row keys={['A']} label="New Amazon project" />
              <Row keys={['S']} label="New Shopify project" />
              <Row keys={['/']} label="Search projects" />
              <Row keys={['1']} label="Show all" />
              <Row keys={['2']} label="Filter Amazon" />
              <Row keys={['3']} label="Filter Shopify" />
            </Section>

            <Section title="Dashboard — View">
              <Row keys={['G']} label="Grid view" />
              <Row keys={['L']} label="List view" />
              <Row keys={[mod, '/']} label="Shortcuts guide" />
              <Row keys={['Esc']} label="Close / clear search" />
            </Section>

            <Section title="Editor — History">
              <Row keys={[mod, 'Z']} label="Undo" />
              <Row keys={[mod, '⇧', 'Z']} label="Redo" />
            </Section>

            <Section title="Editor — Canvas">
              <Row keys={['F']} label="Fit to view" />
              <Row keys={['=']} label="Zoom in" />
              <Row keys={['-']} label="Zoom out" />
              <Row keys={['0']} label="Reset zoom" />
              <Row keys={['Space']} label="Pan (hold + drag)" />
              <Row keys={[mod, 'scroll']} label="Zoom to cursor" />
            </Section>

            <Section title="Editor — Actions">
              <Row keys={['P']} label="Toggle preview" />
              <Row keys={[mod, '⇧', 'L']} label="Toggle light / dark" />
              <Row keys={[mod, '/']} label="Shortcuts guide" />
              <Row keys={['Esc']} label="Close modal" />
            </Section>

          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer shrink-0">
          <span className="label-sm mr-auto">Press</span>
          <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
          <Kbd>/</Kbd>
          <span className="label-sm ml-1">anytime to open this guide</span>
          {!isMac && (
            <span className="label-sm ml-4 opacity-60">⌘ = Ctrl on Windows</span>
          )}
        </div>
      </div>
    </div>
  )
}
