'use client'

import React, { useEffect, useRef, useState } from 'react'
import type { CantoPick } from './CantoAssetPicker'

interface Props {
  albumId: string | null
  open: boolean
  onClose: () => void
  onSelect: (pick: CantoPick) => void
  slotLabel?: string
  title?: string
  thumbnailFit?: 'contain' | 'cover'
  thumbnailSize?: number
}

export default function CantoIconPickerModal({ albumId, open, onClose, onSelect, slotLabel, title = 'Pick an Icon', thumbnailFit = 'contain', thumbnailSize = 56 }: Props) {
  const [assets, setAssets] = useState<CantoPick[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open || !albumId) return
    setLoading(true)
    setAssets([])
    setQuery('')
    fetch(`/api/canto/folder?albumId=${encodeURIComponent(albumId)}`)
      .then(r => r.json())
      .then(data => setAssets(Array.isArray(data) ? data : []))
      .catch(() => setAssets([]))
      .finally(() => setLoading(false))
  }, [open, albumId])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const filtered = query.trim()
    ? assets.filter(a =>
        a.name.toLowerCase().includes(query.toLowerCase()) ||
        a.keywords?.some(k => k.toLowerCase().includes(query.toLowerCase()))
      )
    : assets

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-2xl bg-white dark:bg-gray-900 rounded-[4px] shadow-[0_8px_48px_rgba(0,0,0,0.22)] border border-gray-200 dark:border-gray-700/80 flex flex-col overflow-hidden animate-scale-in"
          style={{ maxHeight: '84vh' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-5 pt-4 pb-3.5 flex items-center justify-between border-b border-gray-100 dark:border-gray-800 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-1 h-8 rounded-full bg-accent-600 dark:bg-accent-500 shrink-0" />
              <div>
                <h2 className="text-[13px] font-bold text-gray-900 dark:text-white leading-none">
                  {title}{slotLabel ? ` — ${slotLabel}` : ''}
                </h2>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                  {loading ? 'Loading…' : `${assets.length} icon${assets.length !== 1 ? 's' : ''} in this folder`}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search */}
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0 bg-gray-50/60 dark:bg-gray-900/60">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by name or keyword…"
                className="w-full pl-9 pr-8 py-2 text-[13px] border border-gray-200 dark:border-gray-700 rounded-[4px] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-accent-400/25 focus:border-accent-400 dark:focus:border-accent-600 placeholder:text-gray-300 dark:placeholder:text-gray-600 transition-all"
              />
              {query && (
                <button
                  onClick={() => { setQuery(''); inputRef.current?.focus() }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded text-gray-300 hover:text-gray-500 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Grid */}
          <div className="overflow-y-auto flex-1 p-4">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <svg className="animate-spin h-5 w-5 text-accent-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <svg className="w-5 h-5 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <p className="text-[12px] text-gray-400 dark:text-gray-500">
                  {query ? `No icons match "${query}"` : 'No icons found in this folder.'}
                </p>
              </div>
            ) : (
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnailSize + 32}px, 1fr))` }}>
                {filtered.map(a => (
                  <button
                    key={a.id}
                    onClick={() => { onSelect(a); onClose() }}
                    className="flex flex-col items-center gap-1.5 p-2 rounded-[4px] border border-transparent hover:border-accent-200 dark:hover:border-accent-800 hover:bg-accent-50/60 dark:hover:bg-accent-900/20 active:border-accent-300 transition-all group"
                    title={a.name}
                  >
                    <div
                      className="rounded-[4px] bg-gray-100 dark:bg-gray-800 flex items-center justify-center overflow-hidden group-hover:bg-white dark:group-hover:bg-gray-700 transition-colors w-full border border-transparent group-hover:border-gray-100 dark:group-hover:border-gray-700"
                      style={{ height: thumbnailSize }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={a.previewUrl}
                        alt={a.name}
                        crossOrigin="anonymous"
                        className={`w-full h-full ${thumbnailFit === 'cover' ? 'object-cover' : 'object-contain p-1.5'}`}
                      />
                    </div>
                    <span
                      className="text-[9px] font-medium text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200 text-center leading-tight w-full transition-colors"
                      style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                    >
                      {a.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {!loading && (
            <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 shrink-0 bg-gray-50/60 dark:bg-gray-900/40">
              <p className="text-[10px] text-gray-400 dark:text-gray-500">
                {query ? `${filtered.length} of ${assets.length} icons` : `${assets.length} icon${assets.length !== 1 ? 's' : ''} · click to select`}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
