'use client'

import React, { useEffect, useState } from 'react'

export interface CantoPick {
  id: string
  name: string
  previewUrl: string
  originalUrl?: string   // PNG with transparency — use for icons
  keywords?: string[]
}

interface Props {
  albumId: string | null
  value: CantoPick | null
  onChange: (pick: CantoPick | null) => void
  placeholder?: string
  thumbnailFit?: 'contain' | 'cover'
}

export default function CantoAssetPicker({ albumId, value, onChange, placeholder = 'Pick from Canto', thumbnailFit = 'cover' }: Props) {
  const [assets, setAssets]   = useState<CantoPick[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen]       = useState(false)

  useEffect(() => {
    if (!albumId || !open) return
    setLoading(true)
    setAssets([])
    fetch(`/api/canto/folder?albumId=${encodeURIComponent(albumId)}`)
      .then(r => r.json())
      .then(data => setAssets(Array.isArray(data) ? data : []))
      .catch(() => setAssets([]))
      .finally(() => setLoading(false))
  }, [albumId, open])

  if (value) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-12 h-9 rounded-none border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 overflow-hidden shrink-0 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value.previewUrl} alt={value.name} crossOrigin="anonymous"
            className={`max-w-full max-h-full ${thumbnailFit === 'contain' ? 'object-contain' : 'object-cover w-full h-full'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-gray-600 dark:text-gray-300 truncate font-medium">{value.name}</p>
          <p className="text-[9px] text-gray-400 dark:text-gray-500">From Canto</p>
        </div>
        <button onClick={() => onChange(null)} className="text-[10px] text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors shrink-0">×</button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => albumId && setOpen(o => !o)}
        disabled={!albumId}
        className={`w-full h-8 rounded-none border border-dashed text-[10px] flex items-center justify-center gap-1.5 transition-colors ${
          albumId
            ? 'border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500 hover:border-gray-400 dark:hover:border-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
            : 'border-gray-100 dark:border-gray-700 text-gray-300 dark:text-gray-600 cursor-not-allowed'
        }`}
        title={albumId ? placeholder : 'Configure folder in Image Library settings'}
      >
        <CantoIcon />
        {albumId ? placeholder : 'No folder configured'}
      </button>

      {open && albumId && (
        <div>
          {loading ? (
            <div className="flex justify-center py-3"><Spinner /></div>
          ) : assets.length === 0 ? (
            <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center py-2">No assets found in this folder</p>
          ) : (
            <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {assets.map(a => (
                <button key={a.id} onClick={() => { onChange(a); setOpen(false) }}
                  className="shrink-0 w-[52px] h-[52px] rounded-none border-2 border-transparent hover:border-gray-400 dark:hover:border-gray-500 overflow-hidden transition-colors bg-gray-100 dark:bg-gray-700 flex items-center justify-center"
                  title={a.name}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.previewUrl} alt={a.name} crossOrigin="anonymous"
                    className={thumbnailFit === 'contain' ? 'max-w-full max-h-full object-contain p-1' : 'w-full h-full object-cover'} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CantoIcon() {
  return (
    <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
