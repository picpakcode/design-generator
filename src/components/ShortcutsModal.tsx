'use client'

import { useEffect } from 'react'

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center px-1.5 h-[18px] min-w-[18px] rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-mono text-[10px] font-semibold leading-none shadow-[0_1px_0_rgba(0,0,0,0.18)] dark:shadow-[0_1px_0_rgba(0,0,0,0.5)]">
      {children}
    </kbd>
  )
}

function Row({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-[3px]">
      <span className="text-[12px] text-gray-600 dark:text-gray-400 leading-none">{label}</span>
      <div className="flex items-center gap-0.5 shrink-0">
        {keys.map((k, i) => <Kbd key={i}>{k}</Kbd>)}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2.5">{title}</p>
      <div>{children}</div>
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
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded shadow-2xl w-[560px] max-h-[82vh] overflow-hidden flex flex-col animate-scale-in">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <h2 className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
        <div className="shrink-0 px-5 py-2.5 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400 dark:text-gray-500">Press</span>
          <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
          <Kbd>/</Kbd>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">anytime to open this guide</span>
          {!isMac && (
            <span className="ml-auto text-[10px] text-gray-400 dark:text-gray-500">⌘ = Ctrl on Windows</span>
          )}
        </div>
      </div>
    </div>
  )
}
