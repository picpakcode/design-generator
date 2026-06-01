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
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden"
          style={{ maxHeight: '80vh' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-5 pt-5 pb-4 flex items-center justify-between border-b border-gray-100 shrink-0">
            <div>
              <h2 className="text-sm font-bold text-gray-900">
                {title}{slotLabel ? ` — ${slotLabel}` : ''}
              </h2>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {loading ? 'Loading…' : `${assets.length} icon${assets.length !== 1 ? 's' : ''} in this folder`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search */}
          <div className="px-5 py-3 border-b border-gray-100 shrink-0">
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
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/15 focus:border-gray-400 placeholder:text-gray-300 transition-all"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Grid */}
          <div className="overflow-y-auto flex-1 p-5">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <svg className="animate-spin h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-16">
                {query ? `No icons match "${query}"` : 'No icons found in this folder.'}
              </p>
            ) : (
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnailSize + 32}px, 1fr))` }}>
                {filtered.map(a => (
                  <button
                    key={a.id}
                    onClick={() => { onSelect(a); onClose() }}
                    className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-gray-50 border-2 border-transparent hover:border-gray-200 active:border-gray-400 transition-all group"
                    title={a.name}
                  >
                    <div
                      className="rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden group-hover:bg-gray-200 transition-colors w-full"
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
                    <span className="text-[9px] font-medium text-gray-500 group-hover:text-gray-700 text-center leading-tight w-full"
                      style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {a.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer count when filtered */}
          {query && !loading && (
            <div className="px-5 py-2.5 border-t border-gray-100 shrink-0">
              <p className="text-[10px] text-gray-400">
                {filtered.length} of {assets.length} icons
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
