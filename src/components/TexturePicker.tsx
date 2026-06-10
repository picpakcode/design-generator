'use client'

import { useEffect, useRef, useState } from 'react'
import { UploadedAsset } from '@/types'

// Fallback to the "Textures" Canto folder (NHMFF) when no album is configured
const DEFAULT_TEXTURES_ALBUM = 'NHMFF'

interface TextureItem {
  id: string
  name: string
  previewUrl: string
}

interface TexturePickerProps {
  albumId: string | null
  value: UploadedAsset | null
  onChange: (asset: UploadedAsset | null) => void
  placeholder?: string
  thumbnailFit?: 'cover' | 'contain'
}

export default function TexturePicker({ albumId, value, onChange, placeholder = 'Pick texture…', thumbnailFit = 'cover' }: TexturePickerProps) {
  const [open, setOpen] = useState(false)
  const [textures, setTextures] = useState<TextureItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const triggerRef  = useRef<HTMLButtonElement>(null)
  const [dropPos, setDropPos] = useState<{ top: number; left: number; width: number } | null>(null)

  function computePos() {
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const dropH = 280
    const top = r.bottom + 4 + dropH > window.innerHeight ? r.top - dropH - 4 : r.bottom + 4
    setDropPos({ top, left: r.left, width: r.width })
  }

  const effectiveAlbumId = albumId || DEFAULT_TEXTURES_ALBUM

  // Reset cache when album changes
  useEffect(() => { setTextures(null) }, [effectiveAlbumId])

  // Load items when dropdown first opens.
  // NHMFF fallback only applies when no albumId was configured (albumId === null) — never for explicit IDs like QH34D.
  useEffect(() => {
    if (!open || textures !== null) return
    setLoading(true)
    fetch(`/api/canto/folder?albumId=${encodeURIComponent(effectiveAlbumId)}`)
      .then(r => r.json())
      .then(async (data: TextureItem[]) => {
        const items = Array.isArray(data) ? data : []
        if (items.length === 0 && albumId === null && effectiveAlbumId !== DEFAULT_TEXTURES_ALBUM) {
          // No album configured and the default returned nothing — try the root textures album
          const fb = await fetch(`/api/canto/folder?albumId=${encodeURIComponent(DEFAULT_TEXTURES_ALBUM)}`).then(r => r.json()).catch(() => [])
          setTextures(Array.isArray(fb) ? fb : [])
        } else {
          setTextures(items)
        }
        setLoading(false)
      })
      .catch(() => { setTextures([]); setLoading(false) })
  }, [open, effectiveAlbumId, albumId, textures])

  // Compute fixed position when opening; recompute on scroll/resize
  useEffect(() => {
    if (!open) return
    computePos()
    window.addEventListener('scroll', computePos, true)
    window.addEventListener('resize', computePos)
    return () => {
      window.removeEventListener('scroll', computePos, true)
      window.removeEventListener('resize', computePos)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!dropdownRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function select(t: TextureItem) {
    onChange({ id: t.id, name: t.name, url: t.previewUrl, type: 'image' })
    setOpen(false)
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange(null)
  }

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger row */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded border text-[10px] transition-all ${
          open
            ? 'border-gray-400 dark:border-gray-500 bg-gray-50 dark:bg-gray-800'
            : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 bg-white dark:bg-gray-800'
        }`}
      >
        {value ? (
          <>
            <div className="w-10 h-10 rounded border border-gray-200 dark:border-gray-600 overflow-hidden shrink-0 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={value.url} alt={value.name} className={`w-full h-full ${thumbnailFit === 'contain' ? 'object-contain p-0.5' : 'object-cover'}`} />
            </div>
            <span className="flex-1 text-left text-gray-600 dark:text-gray-400 truncate">{value.name}</span>
            <button
              type="button"
              onClick={clear}
              className="shrink-0 w-4 h-4 flex items-center justify-center text-gray-300 hover:text-red-400 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </>
        ) : (
          <>
            <div className="w-10 h-10 rounded border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-gray-300 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="flex-1 text-left text-gray-400 dark:text-gray-500">{placeholder}</span>
            <svg className={`w-3.5 h-3.5 text-gray-300 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </>
        )}
      </button>

      {/* Dropdown — fixed so it escapes any overflow-hidden/auto ancestor */}
      {open && dropPos && (
        <div
          style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width, zIndex: 9999 }}
          className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden"
        >
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <svg className="w-5 h-5 animate-spin text-gray-300" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : !textures || textures.length === 0 ? (
            <p className="text-[11px] text-gray-400 text-center py-6">No textures in this album.</p>
          ) : (
            <div className="p-2 max-h-64 overflow-y-auto">
              <div className="grid grid-cols-3 gap-1.5">
                {textures.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => select(t)}
                    className={`group relative aspect-square rounded overflow-hidden border-2 transition-all ${
                      value?.id === t.id
                        ? 'border-gray-900 dark:border-white'
                        : 'border-transparent hover:border-gray-400 dark:hover:border-gray-400'
                    }`}
                    title={t.name}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={t.previewUrl}
                      alt={t.name}
                      className={`w-full h-full ${thumbnailFit === 'contain' ? 'object-contain p-1 bg-white' : 'object-cover'}`}
                      onError={e => { const btn = e.currentTarget.closest('button'); if (btn) btn.style.display = 'none' }}
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-[9px] text-white truncate">{t.name}</p>
                    </div>
                    {value?.id === t.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <svg className="w-5 h-5 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
