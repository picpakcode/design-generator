'use client'

import React, { useEffect, useRef, useState } from 'react'
import { DesignState } from '@/types'
import { getTemplate } from '@/lib/templates'
import { CanvasContent, CanvasContentIcons } from './CanvasRenderers'
import { useAppSettings } from '@/hooks/useAppSettings'

const DESKTOP_W = 1464
const MOBILE_W  = 600

type Tab = 'desktop' | 'mobile' | 'gallery'

interface Props {
  open: boolean
  onClose: () => void
  design: DesignState
}

export default function PreviewModal({ open, onClose, design }: Props) {
  const { settings } = useAppSettings()
  const isDark = settings.theme === 'dark'

  const [mounted, setMounted]   = useState(false)
  const [closing, setClosing]   = useState(false)
  const [tab, setTab]           = useState<Tab>('desktop')

  const desktopScrollRef = useRef<HTMLDivElement>(null)
  const mobileScrollRef  = useRef<HTMLDivElement>(null)
  const galleryScrollRef = useRef<HTMLDivElement>(null)
  const desktopInnerRef  = useRef<HTMLDivElement>(null)
  const mobileInnerRef   = useRef<HTMLDivElement>(null)
  const galleryInnerRef  = useRef<HTMLDivElement>(null)

  const [desktopScale, setDesktopScale] = useState(0.5)
  const [mobileScale,  setMobileScale]  = useState(0.5)
  const [galleryScale, setGalleryScale] = useState(0.3)

  useEffect(() => {
    if (open) {
      setClosing(false)
      setMounted(true)
    }
  }, [open])

  function handleClose() {
    setClosing(true)
    setTimeout(() => { setMounted(false); onClose() }, 300)
  }

  useEffect(() => {
    if (!open) return
    const measure = () => {
      if (desktopInnerRef.current) setDesktopScale(desktopInnerRef.current.clientWidth / DESKTOP_W)
      if (mobileInnerRef.current)  setMobileScale(mobileInnerRef.current.clientWidth  / MOBILE_W)
      if (galleryInnerRef.current) setGalleryScale((galleryInnerRef.current.clientWidth / 2 - 16) / MOBILE_W)
    }
    const t = setTimeout(measure, 30)
    window.addEventListener('resize', measure)
    return () => { clearTimeout(t); window.removeEventListener('resize', measure) }
  }, [open, tab])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!mounted) return null

  const blocks = design.blocks ?? []

  const blockLabel = (block: typeof blocks[0], format: 'desktop' | 'mobile') => {
    const tpl = getTemplate(block.templateId, format)
    return `${block.templateId?.toUpperCase?.() ?? ''} — ${format.toUpperCase()} · ${tpl.width}×${tpl.height}`
  }

  const renderBlock = (block: typeof blocks[0], format: 'desktop' | 'mobile', scale: number) => {
    const tpl = getTemplate(block.templateId, format)
    const renderDesign: DesignState = {
      ...design,
      assets: block.assets ?? [],
      activeTemplate: block.templateId,
      activeFormat: format,
      title: block.title,
      subtitleHtml: block.subtitleHtml,
      iconCount: block.iconCount as 2 | 3 | 4,
      iconLabels: block.iconLabels,
      desktop: { ...design.desktop, layoutFlipped: block.layoutFlipped },
      mobile:  { ...design.mobile,  layoutFlipped: block.layoutFlipped },
    }
    return (
      <div key={`${block.id}-${format}`} className="mb-8">
        <div className={`mb-2 flex items-center gap-2`}>
          <span className={`text-[10px] font-semibold tracking-widest uppercase ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            {blockLabel(block, format)}
          </span>
        </div>
        <div
          className={`overflow-hidden rounded-[2px] ${isDark ? 'shadow-[0_2px_16px_rgba(0,0,0,0.5)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.10)]'}`}
          style={{ width: '100%', height: tpl.height * scale, position: 'relative', flexShrink: 0 }}
        >
          <div style={{ width: tpl.width, height: tpl.height, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
            <div style={{ width: tpl.width, height: tpl.height, position: 'relative' }}>
              {block.templateId === 'aplus-icons'
                ? <CanvasContentIcons design={renderDesign} settings={format === 'desktop' ? renderDesign.desktop : renderDesign.mobile} />
                : <CanvasContent      design={renderDesign} settings={format === 'desktop' ? renderDesign.desktop : renderDesign.mobile} />
              }
            </div>
          </div>
        </div>
      </div>
    )
  }

  const panelAnim = closing ? 'animate-slide-down-full' : 'animate-slide-up-full'
  const backdropAnim = closing ? 'animate-fade-out' : 'animate-fade-in'

  const headerBg    = isDark ? 'bg-gray-950 border-b border-white/8' : 'bg-white border-b border-gray-200'
  const panelBg     = isDark ? 'bg-gray-950' : 'bg-[#f8f8f8]'
  const tabActive   = isDark ? 'text-white border-b-2 border-accent-500' : 'text-gray-900 border-b-2 border-accent-600'
  const tabInactive = isDark ? 'text-gray-500 hover:text-gray-300 border-b-2 border-transparent' : 'text-gray-400 hover:text-gray-600 border-b-2 border-transparent'
  const titleText   = isDark ? 'text-white' : 'text-gray-900'
  const dimText     = isDark ? 'text-gray-500' : 'text-gray-400'
  const closeBtn    = isDark ? 'text-gray-500 hover:text-white hover:bg-white/10' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
  const scrollBg    = isDark ? 'bg-gray-900' : 'bg-[#f0f0f0]'
  const pillBg      = isDark ? 'bg-white/6 text-gray-400' : 'bg-gray-100 text-gray-500'

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/60 dark:bg-black/75 backdrop-blur-sm ${backdropAnim}`}
        onClick={handleClose}
      />

      {/* Sheet anchored to bottom — pointer-events-none wrapper lets backdrop clicks pass through */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
        <div
          className={`pointer-events-auto w-full flex flex-col rounded-t-[4px] overflow-hidden shadow-[0_-8px_48px_rgba(0,0,0,0.28)] ${panelBg} ${panelAnim}`}
          style={{ height: 'calc(100vh - 3rem)' }}
          onClick={e => e.stopPropagation()}
        >

          {/* ── Header ── */}
          <div className={`shrink-0 flex items-center justify-between px-5 py-0 ${headerBg}`} style={{ height: 44 }}>

            {/* Left: title */}
            <div className="flex items-center gap-2.5">
              <div className="w-1 h-6 rounded-full bg-accent-600 dark:bg-accent-500 shrink-0" />
              <span className={`font-bold text-[13px] ${titleText}`}>Preview</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${pillBg}`}>
                {blocks.length} block{blocks.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Center: tabs */}
            <div className="flex items-stretch gap-0 h-full">
              {(['desktop', 'mobile', 'gallery'] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 h-full text-[11px] font-bold tracking-widest uppercase transition-all ${tab === t ? tabActive : tabInactive}`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Right: esc + close */}
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

          {/* ── Body ── */}
          <div className="flex-1 min-h-0 overflow-hidden">

            {/* Desktop tab */}
            {tab === 'desktop' && (
              <div ref={desktopScrollRef} className={`h-full overflow-y-auto ${scrollBg}`}>
                <div className="max-w-[1200px] mx-auto px-8 pt-8 pb-12">
                  <div ref={desktopInnerRef}>
                    {blocks.map(block => renderBlock(block, 'desktop', desktopScale))}
                  </div>
                </div>
              </div>
            )}

            {/* Mobile tab */}
            {tab === 'mobile' && (
              <div ref={mobileScrollRef} className={`h-full overflow-y-auto ${scrollBg}`}>
                <div className="max-w-[680px] mx-auto px-8 pt-8 pb-12">
                  <div ref={mobileInnerRef}>
                    {blocks.map(block => renderBlock(block, 'mobile', mobileScale))}
                  </div>
                </div>
              </div>
            )}

            {/* Gallery tab */}
            {tab === 'gallery' && (
              <div ref={galleryScrollRef} className={`h-full overflow-y-auto ${scrollBg}`}>
                <div className="max-w-[1400px] mx-auto px-8 pt-8 pb-12">
                  <div ref={galleryInnerRef} className="grid grid-cols-2 gap-x-8 gap-y-6">
                    {blocks.map(block => {
                      const tpl = getTemplate(block.templateId, 'mobile')
                      const renderDesign: DesignState = {
                        ...design,
                        assets: block.assets ?? [],
                        activeTemplate: block.templateId,
                        activeFormat: 'mobile',
                        title: block.title,
                        subtitleHtml: block.subtitleHtml,
                        iconCount: block.iconCount as 2 | 3 | 4,
                        iconLabels: block.iconLabels,
                        desktop: { ...design.desktop, layoutFlipped: block.layoutFlipped },
                        mobile:  { ...design.mobile,  layoutFlipped: block.layoutFlipped },
                      }
                      return (
                        <div key={`gallery-${block.id}`}>
                          <div className={`mb-2 text-[10px] font-semibold tracking-widest uppercase ${dimText}`}>
                            {blockLabel(block, 'mobile')}
                          </div>
                          <div
                            className={`overflow-hidden rounded-[2px] ${isDark ? 'shadow-[0_2px_16px_rgba(0,0,0,0.5)]' : 'shadow-[0_2px_12px_rgba(0,0,0,0.10)]'}`}
                            style={{ width: '100%', height: tpl.height * galleryScale, position: 'relative' }}
                          >
                            <div style={{ width: tpl.width, height: tpl.height, transform: `scale(${galleryScale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>
                              <div style={{ width: tpl.width, height: tpl.height, position: 'relative' }}>
                                {block.templateId === 'aplus-icons'
                                  ? <CanvasContentIcons design={renderDesign} settings={renderDesign.mobile} />
                                  : <CanvasContent      design={renderDesign} settings={renderDesign.mobile} />
                                }
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  )
}
