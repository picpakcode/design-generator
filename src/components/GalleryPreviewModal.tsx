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
  const [mounted, setMounted] = useState(false)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    if (open) { setClosing(false); setMounted(true) }
  }, [open])

  function handleClose() {
    setClosing(true)
    setTimeout(() => { setMounted(false); onClose() }, 300)
  }

  useEffect(() => {
    if (!open) return
    const measure = () => {
      if (bodyRef.current) {
        const availH = bodyRef.current.clientHeight - 32
        setScale(Math.max(0.05, availH / GALLERY_SIZE))
      }
    }
    const t = setTimeout(measure, 30)
    window.addEventListener('resize', measure)
    return () => { clearTimeout(t); window.removeEventListener('resize', measure) }
  }, [open])

  useEffect(() => {
    if (!mounted) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted])

  if (!mounted) return null

  const blocks = design.galleryBlocks ?? []

  const isDarkTheme = isDark
  const headerBg  = isDarkTheme ? 'bg-gray-950 border-b border-white/8'  : 'bg-white border-b border-gray-200'
  const panelBg   = isDarkTheme ? 'bg-gray-950'                          : 'bg-[#f8f8f8]'
  const scrollBg  = isDarkTheme ? 'bg-gray-900'                          : 'bg-[#f0f0f0]'
  const titleText = isDarkTheme ? 'text-white'                           : 'text-gray-900'
  const dimText   = isDarkTheme ? 'text-gray-500'                        : 'text-gray-400'
  const pillBg    = isDarkTheme ? 'bg-white/6 text-gray-400'             : 'bg-gray-100 text-gray-500'
  const closeBtn  = isDarkTheme ? 'text-gray-500 hover:text-white hover:bg-white/10' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'

  const panelAnim    = closing ? 'animate-slide-down-full' : 'animate-slide-up-full'
  const backdropAnim = closing ? 'animate-fade-out'        : 'animate-fade-in'

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] ${backdropAnim}`}
        onClick={handleClose}
      />

      {/* Sheet — pointer-events-none wrapper lets backdrop clicks pass through */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
        <div
          className={`pointer-events-auto w-full flex flex-col rounded-t-[4px] overflow-hidden shadow-[0_-8px_48px_rgba(0,0,0,0.22)] ${panelBg} ${panelAnim}`}
          style={{ height: 'calc(100vh - 2.5rem)' }}
          onClick={e => e.stopPropagation()}
        >

          {/* Header */}
          <div className={`shrink-0 flex items-center justify-between px-5 py-0 ${headerBg}`} style={{ height: 44 }}>
            <div className="flex items-center gap-2.5">
              <div className="w-1 h-6 rounded-full bg-accent-600 dark:bg-accent-500 shrink-0" />
              <span className={`font-bold text-[13px] ${titleText}`}>Gallery Preview</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${pillBg}`}>
                {blocks.length} slide{blocks.length !== 1 ? 's' : ''}
              </span>
              <span className={`text-[10px] ${dimText}`}>1500 × 1500 px</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] hidden sm:block ${dimText}`}>Esc to close</span>
              <button
                onClick={handleClose}
                className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${closeBtn}`}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Body: horizontal scroll */}
          <div ref={bodyRef} className={`flex-1 min-h-0 overflow-x-auto overflow-y-hidden ${scrollBg}`}>
            <div className="h-full flex items-center gap-6 px-8 py-4" style={{ width: 'max-content', minWidth: '100%' }}>
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
                    <div className={`mb-1 text-[10px] font-semibold tracking-widest uppercase ${dimText}`}>
                      {block.slug || `Slide ${idx + 1}`}
                    </div>
                    <div
                      className={`overflow-hidden rounded-[2px] ${isDarkTheme ? 'shadow-[0_2px_16px_rgba(0,0,0,0.5)]' : 'shadow-[0_2px_16px_rgba(0,0,0,0.12)]'}`}
                      style={{ width: tpl.width * scale, height: tpl.height * scale, position: 'relative', flexShrink: 0 }}
                    >
                      <div style={{ width: tpl.width, height: tpl.height, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
                        {block.templateId === 'gallery-icons'
                          ? <CanvasContentGalleryIcons design={renderDesign} settings={design.gallery} />
                          : <CanvasContentGallery      design={renderDesign} settings={design.gallery} />
                        }
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
