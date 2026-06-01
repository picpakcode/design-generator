'use client'

import { useCallback, useRef } from 'react'
import { UploadedAsset } from '@/types'

interface AssetUploaderProps {
  assets: UploadedAsset[]
  onAdd: (asset: UploadedAsset, slotIndex?: number) => void
  onRemove: (id: string) => void
  slotLabels?: string[]   // when set, show a named slot per label
}

export default function AssetUploader({ assets, onAdd, onRemove, slotLabels }: AssetUploaderProps) {
  const genericInputRef = useRef<HTMLInputElement>(null)
  const slotInputRefs = useRef<(HTMLInputElement | null)[]>([])

  // ── Generic (non-slot) upload ─────────────────────────────────────────────
  const handleGenericFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return
      Array.from(files).forEach((file) => {
        if (!file.type.startsWith('image/')) return
        onAdd({ id: uid(), name: file.name, url: URL.createObjectURL(file), type: 'image' })
      })
    },
    [onAdd]
  )

  // ── Slot-specific upload ──────────────────────────────────────────────────
  const handleSlotFile = useCallback(
    (files: FileList | null, slotIndex: number) => {
      if (!files || files.length === 0) return
      const file = files[0]
      if (!file.type.startsWith('image/')) return
      onAdd({ id: uid(), name: file.name, url: URL.createObjectURL(file), type: 'image' }, slotIndex)
    },
    [onAdd]
  )

  // ── Slot UI ───────────────────────────────────────────────────────────────
  if (slotLabels) {
    return (
      <div>
        <div className="space-y-2">
          {slotLabels.map((label, i) => {
            const asset = assets[i] ?? undefined
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider w-24 shrink-0 leading-tight">
                  {label}
                </span>

                {asset ? (
                  <div className="relative group flex-1 h-14 rounded-md overflow-hidden border border-gray-200 dark:border-gray-600">
                    <img
                      src={asset.url}
                      alt={asset.name}
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => onRemove(asset.id)}
                      className="absolute inset-0 bg-black/50 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity font-medium"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => slotInputRefs.current[i]?.click()}
                      className="flex-1 h-14 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md text-[11px] text-gray-400 dark:text-gray-500 hover:border-gray-400 dark:hover:border-gray-400 hover:text-gray-500 dark:hover:text-gray-400 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                      </svg>
                      Upload
                    </button>
                    <input
                      ref={(el) => { slotInputRefs.current[i] = el }}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleSlotFile(e.target.files, i)}
                    />
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Generic UI (no slots) ─────────────────────────────────────────────────
  return (
    <div>
      <div
        onClick={() => genericInputRef.current?.click()}
        onDrop={(e) => { e.preventDefault(); handleGenericFiles(e.dataTransfer.files) }}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors duration-150 border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 bg-white dark:bg-gray-800/50"
      >
        <svg className="mx-auto h-8 w-8 text-gray-400 dark:text-gray-500 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Drop images or <span className="text-blue-500 dark:text-blue-400 font-medium">browse</span>
        </p>
        <input
          ref={genericInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleGenericFiles(e.target.files)}
        />
      </div>

      {assets.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {assets.map((asset) => (
            <div key={asset.id} className="relative group">
              <img src={asset.url} alt={asset.name} className="w-full h-16 object-cover rounded-md border border-gray-200 dark:border-gray-600" />
              <button
                onClick={() => onRemove(asset.id)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm leading-none"
                title="Remove"
              >
                ×
              </button>
              <p className="text-[9px] text-gray-400 dark:text-gray-500 truncate mt-0.5">{asset.name}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}
