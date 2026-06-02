'use client'

import React, { useEffect, useRef, useState } from 'react'
import { DesignState } from '@/types'
import { getGalleryTemplate } from '@/lib/templates'
import { CanvasContentGallery, CanvasContentGalleryIcons } from './CanvasRenderers'
import { useAppSettings } from '@/hooks/useAppSettings'

const GALLERY_SIZE = 1500

interface Props {
  open: boolean
  onClose: () => void
  design: DesignState
}

export default function GalleryPreviewModal({ open, onClose, design }: Props) {
  const { settings } = useAppSettings()
  const isDark = settings.theme === 'dark'

  const bodyRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.4)

  useEffect(() => {
    if (!open) return
    const measure = () => {
      if (bodyRef.current) {
        const availH = bodyRef.current.clientHeight - 32 // account for py-4
        setScale(Math.max(0.05, availH / GALLERY_SIZE))
      }
    }
    const t = setTimeout(measure, 30)
    window.addEventListener('resize', measure)
    return () => { clearTimeout(t); window.removeEventListener('resize', measure) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const blocks = design.galleryBlocks ?? []

  const t = isDark ? {
    backdrop:   'bg-black/80',
    panel:      'bg-gray-950 border border-white/8',
    header:     'bg-gray-900 border-b border-white/8',
    headerText: 'text-white',
    subText:    'text-gray-500',
    pillBg:     'bg-white/6 text-gray-400',
    closeBtn:   'text-gray-500 hover:text-white hover:bg-white/10',
    body:       'bg-gray-950',
  } : {
    backdrop:   'bg-black/40',
    panel:      'bg-white border border-gray-200',
    header:     'bg-gray-50 border-b border-gray-200',
    headerText: 'text-gray-900',
    subText:    'text-gray-400',
    pillBg:     'bg-gray-100 text-gray-500',
    closeBtn:   'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
    body:       'bg-gray-100',
  }

  return (
    <>
      {/* Backdrop */}
      <div className={`fixed inset-0 z-50 ${t.backdrop} backdrop-blur-sm`} onClick={onClose} />

      {/* Modal panel */}
      <div className={`fixed inset-4 z-50 flex flex-col rounded-2xl overflow-hidden shadow-2xl ${t.panel}`}>

        {/* Header */}
        <div className={`shrink-0 flex items-center justify-between px-5 py-3.5 ${t.header}`}>
          <div className="flex items-center gap-3">
            <svg className={`w-4 h-4 ${t.subText}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span className={`font-semibold text-sm tracking-tight ${t.headerText}`}>Gallery Preview</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${t.pillBg}`}>
              {blocks.length} slide{blocks.length !== 1 ? 's' : ''}
            </span>
            <span className={`text-[10px] ${t.subText}`}>1500 × 1500 px</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] hidden sm:block ${t.subText}`}>Esc to close</span>
            <button
              onClick={onClose}
              className={`ml-2 w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${t.closeBtn}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body: horizontal scroll */}
        <div ref={bodyRef} className={`flex-1 min-h-0 overflow-x-auto overflow-y-hidden ${t.body}`}>
          <div className="h-full flex items-center gap-5 px-6 py-4" style={{ width: 'max-content', minWidth: '100%' }}>
            {blocks.map((block, idx) => {
              const tpl = getGalleryTemplate(block.templateId)
              const renderDesign: DesignState = {
                ...design,
                assets: block.assets ?? [],
                title: block.title,
                subtitleHtml: block.subtitleHtml,
                iconCount: block.iconCount as 2 | 3 | 4,
                iconLabels: block.iconLabels,
                activeGalleryTemplate: block.templateId,
              }
              return (
                <div key={block.id} className="flex flex-col items-center gap-2 shrink-0">
                  <div
                    style={{
                      width: tpl.width * scale,
                      height: tpl.height * scale,
                      position: 'relative',
                      overflow: 'hidden',
                      borderRadius: 10,
                      boxShadow: '0 4px 24px rgba(0,0,0,0.22)',
                      flexShrink: 0,
                    }}
                  >
                    <div style={{
                      width: tpl.width,
                      height: tpl.height,
                      transform: `scale(${scale})`,
                      transformOrigin: 'top left',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                    }}>
                      {block.templateId === 'gallery-icons'
                        ? <CanvasContentGalleryIcons design={renderDesign} settings={design.gallery} />
                        : <CanvasContentGallery design={renderDesign} settings={design.gallery} />
                      }
                    </div>
                  </div>
                  <span className={`text-[10px] font-medium ${t.subText}`}>
                    {block.slug || `Slide ${idx + 1}`}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
