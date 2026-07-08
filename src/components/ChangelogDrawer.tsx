'use client'

import { useEffect, useRef, useState } from 'react'
import { RELEASES } from '@/lib/changelog-data'
import type { ChangeKind } from '@/lib/changelog-data'

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
