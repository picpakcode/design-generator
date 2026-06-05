import React from 'react'
import { DesignState, FormatSettings, PhotoComposition, DEFAULT_PHOTO_COMP } from '@/types'
import { getTemplate } from '@/lib/templates'

// ─── Icon color → CSS filter ──────────────────────────────────────────────────
// Recolors a black PNG to any target hex color via SPSA-optimized CSS filter chain.
// Cache ensures the solver runs once per unique color string.

const _filterCache = new Map<string, string>()

function _clampCh(v: number): number { return Math.max(0, Math.min(255, v)) }

// Apply [sepia, saturate, hueRotate, brightness, contrast] to an RGB pixel (0-255).
function _applyChain(r: number, g: number, b: number, f: number[]): [number, number, number] {
  const sep = f[0]
  ;[r, g, b] = [
    _clampCh(r*(0.393+0.607*(1-sep)) + g*(0.769-0.769*(1-sep)) + b*(0.189-0.189*(1-sep))),
    _clampCh(r*(0.349-0.349*(1-sep)) + g*(0.686+0.314*(1-sep)) + b*(0.168-0.168*(1-sep))),
    _clampCh(r*(0.272-0.272*(1-sep)) + g*(0.534-0.534*(1-sep)) + b*(0.131+0.869*(1-sep))),
  ]
  const sat = f[1]
  ;[r, g, b] = [
    _clampCh(r*(0.213+0.787*sat) + g*(0.715-0.715*sat) + b*(0.072-0.072*sat)),
    _clampCh(r*(0.213-0.213*sat) + g*(0.715+0.285*sat) + b*(0.072-0.072*sat)),
    _clampCh(r*(0.213-0.213*sat) + g*(0.715-0.715*sat) + b*(0.072+0.928*sat)),
  ]
  const rad = f[2] * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad)
  ;[r, g, b] = [
    _clampCh(r*(0.213+cos*0.787-sin*0.213) + g*(0.715-cos*0.715-sin*0.715) + b*(0.072-cos*0.072+sin*0.928)),
    _clampCh(r*(0.213-cos*0.213+sin*0.143) + g*(0.715+cos*0.285+sin*0.140) + b*(0.072-cos*0.072-sin*0.283)),
    _clampCh(r*(0.213-cos*0.213-sin*0.787) + g*(0.715-cos*0.715+sin*0.715) + b*(0.072+cos*0.928+sin*0.072)),
  ]
  r = _clampCh(r * f[3]); g = _clampCh(g * f[3]); b = _clampCh(b * f[3])
  r = _clampCh(f[4]*(r-127.5)+127.5); g = _clampCh(f[4]*(g-127.5)+127.5); b = _clampCh(f[4]*(b-127.5)+127.5)
  return [r, g, b]
}

// Full params: [invert(0-1), sepia(0-1), saturate(0-10), hueRotate(0-360), brightness(0-4), contrast(0-4)]
// Applied to black (0,0,0): invert(v) on black → gray at v*255 → rest of chain
function _pixelFromFilters(f: number[]): [number, number, number] {
  const gray = _clampCh(f[0] * 255)
  return _applyChain(gray, gray, gray, f.slice(1))
}

function _colorLoss(f: number[], tr: number, tg: number, tb: number): number {
  const [r, g, b] = _pixelFromFilters(f)
  return Math.sqrt((r-tr)**2 + (g-tg)**2 + (b-tb)**2)
}

function _solveFilter(tr: number, tg: number, tb: number): string {
  const MIN = [0, 0, 0,   0, 0, 0]
  const MAX = [1, 1, 10, 360, 4, 4]
  const clp = (f: number[]) => f.map((v, i) => Math.max(MIN[i], Math.min(MAX[i], v)))

  let best = { loss: Infinity, f: [0.5, 1, 4, 0, 1, 1] as number[] }

  for (let attempt = 0; attempt < 25; attempt++) {
    let f = attempt === 0
      ? [0.5, 1, 4, 0, 1, 1]
      : clp([Math.random(), Math.random(), Math.random()*8, Math.random()*360, Math.random()*3, Math.random()*3])

    for (let k = 0; k < 60; k++) {
      const ck = 2 / Math.pow(k + 1, 0.16)
      const delta = f.map(() => (Math.random() < 0.5 ? 1 : -1))
      const f1 = clp(f.map((v, i) => v + ck * delta[i]))
      const f2 = clp(f.map((v, i) => v - ck * delta[i]))
      const l1 = _colorLoss(f1, tr, tg, tb)
      const l2 = _colorLoss(f2, tr, tg, tb)
      const ak = 1 / Math.pow(k + 1.5, 0.602)
      f = clp(f.map((v, i) => v - ak * (l1 - l2) / (2 * ck * delta[i])))
      const loss = _colorLoss(f, tr, tg, tb)
      if (loss < best.loss) best = { loss, f: [...f] }
    }
    if (best.loss < 2) break
  }

  const [inv, sep, sat, hue, br, con] = best.f
  return [
    'brightness(0)',
    `invert(${inv.toFixed(3)})`,
    `sepia(${sep.toFixed(3)})`,
    `saturate(${sat.toFixed(3)})`,
    `hue-rotate(${Math.round(hue)}deg)`,
    `brightness(${br.toFixed(3)})`,
    `contrast(${con.toFixed(3)})`,
  ].join(' ')
}

function iconColorToFilter(hex: string): string {
  const h = (hex ?? '#ffffff').toLowerCase().trim()
  const norm = h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h
  if (norm === '#ffffff') return 'brightness(0) invert(1)'
  if (norm === '#000000') return 'brightness(0)'
  const cached = _filterCache.get(norm)
  if (cached) return cached
  const result = _solveFilter(parseInt(norm.slice(1,3),16), parseInt(norm.slice(3,5),16), parseInt(norm.slice(5,7),16))
  _filterCache.set(norm, result)
  return result
}

// ─── Photo composition helper ─────────────────────────────────────────────────

function applyPhotoComposition(comp: PhotoComposition): React.CSSProperties {
  const tx = (comp.x / comp.scale) * 100
  const ty = (comp.y / comp.scale) * 100
  return {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: `${comp.scale * 100}%`,
    height: `${comp.scale * 100}%`,
    objectFit: 'cover' as const,
    display: 'block',
    transformOrigin: 'center center',
    transform: `translate(calc(-50% + ${tx}%), calc(-50% + ${ty}%)) rotate(${comp.rotation}deg) scaleX(${comp.flipH ? -1 : 1})`,
  }
}

// ─── Gallery canvas renderer ──────────────────────────────────────────────────

export function CanvasContentGallery({ design, settings, onPhotoMouseDown }: { design: DesignState; settings: FormatSettings; onPhotoMouseDown?: (e: React.MouseEvent<HTMLDivElement>) => void }) {
  const productImg = design.assets[0]
  const textureImg = design.assets[1]
  const logoImg    = design.assets[2]

  const W = 1500
  const topH = Math.round(W * 0.57)  // ~855px photo
  const botH = W - topH               // ~645px text panel

  const logoPos: React.CSSProperties = {
    position: 'absolute',
    top:    settings.logoCorner.startsWith('t') ? settings.logoPadding : undefined,
    bottom: settings.logoCorner.startsWith('b') ? settings.logoPadding : undefined,
    left:   settings.logoCorner.endsWith('l') ? settings.logoPadding : undefined,
    right:  settings.logoCorner.endsWith('r') ? settings.logoPadding : undefined,
  }

  return (
    <div style={{ width: W, height: W, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Photo section */}
      <div style={{ height: topH, position: 'relative', flexShrink: 0, overflow: 'hidden' }} onMouseDown={onPhotoMouseDown}>
        {productImg ? (
          <img
            src={productImg.url}
            alt=""
            crossOrigin="anonymous"
            style={applyPhotoComposition(settings.photoComposition ?? DEFAULT_PHOTO_COMP)}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', backgroundColor: '#c4c4c4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#9ca3af', fontSize: 28, fontFamily: 'system-ui' }}>Product Photo</span>
          </div>
        )}
        {/* Logo */}
        {logoImg && (
          <div style={logoPos}>
            <img
              src={logoImg.url}
              alt="logo"
              crossOrigin="anonymous"
              style={{ maxHeight: settings.logoSize, maxWidth: settings.logoSize * 3.5, objectFit: 'contain', display: 'block' }}
            />
          </div>
        )}
        {/* Accent line at bottom edge of photo */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 8, backgroundColor: design.accentColor }} />
      </div>

      {/* Text panel */}
      <div style={{ height: botH, flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
        {textureImg ? (
          <img src={textureImg.url} alt="background" crossOrigin="anonymous" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, backgroundColor: design.primaryColor }} />
        )}
        {textureImg && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)' }} />}
      <div style={{
        position: 'relative',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-start',
        padding: `${settings.contentPaddingV}px ${settings.contentPaddingX}px`,
        boxSizing: 'border-box',
      }}>
        <div className="rich-title" style={{
          fontFamily: 'var(--font-anton), Anton, sans-serif',
          fontSize: settings.titleFontSize,
          fontWeight: 400,
          lineHeight: settings.titleLineHeight,
          color: design.accentColor,
          margin: '0 0 28px',
          letterSpacing: '0.01em',
          textTransform: settings.titleTextTransform,
          maxWidth: settings.titleWidth < 100 ? `${settings.titleWidth}%` : undefined,
        }} dangerouslySetInnerHTML={{ __html: design.title || '<p>Product Title</p>' }} />
        {design.subtitleHtml && (
          <div
            className="rich-subtitle"
            style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: settings.subtitleFontSize,
              lineHeight: `${settings.subtitleLineHeight}px`,
              fontWeight: 400,
              color: design.bodyColor,
              margin: 0,
              textTransform: settings.subtitleTextTransform,
              maxWidth: settings.subtitleWidth < 100 ? `${settings.subtitleWidth}%` : undefined,
            }}
            dangerouslySetInnerHTML={{ __html: design.subtitleHtml }}
          />
        )}
      </div>
      </div>
    </div>
  )
}

// ─── Gallery Icons canvas renderer ───────────────────────────────────────────
// Layout: photo → 8px accent → dark panel (title top, icon row bottom)

export function CanvasContentGalleryIcons({ design, settings, onPhotoMouseDown }: { design: DesignState; settings: FormatSettings; onPhotoMouseDown?: (e: React.MouseEvent<HTMLDivElement>) => void }) {
  const productImg = design.assets[0]
  const textureImg = design.assets[1]
  const logoImg    = design.assets[2]
  const iconImgs   = [design.assets[3], design.assets[4], design.assets[5], design.assets[6]]

  const W = 1500
  const topH    = Math.round(W * 0.57)  // ~855px photo
  const botH    = W - topH               // ~645px dark panel
  const iconRowH = Math.round(botH * 0.42) // ~271px icon row at bottom

  const logoPos: React.CSSProperties = {
    position: 'absolute',
    top:    settings.logoCorner.startsWith('t') ? settings.logoPadding : undefined,
    bottom: settings.logoCorner.startsWith('b') ? settings.logoPadding : undefined,
    left:   settings.logoCorner.endsWith('l') ? settings.logoPadding : undefined,
    right:  settings.logoCorner.endsWith('r') ? settings.logoPadding : undefined,
  }

  const iconFilter = iconColorToFilter(design.iconColor ?? '#ffffff')

  // Icon box — same style as A+ Icons (vertical: circle icon + label, blurred dark tile)
  const IconBox = ({ index }: { index: number }) => {
    const img = iconImgs[index]
    const label = design.iconLabels[index]
    const sz = settings.iconSize
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: '20px 16px',
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: 0,
        backgroundColor: 'rgba(255,255,255,0.07)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxSizing: 'border-box',
      }}>
        <div style={{ width: sz, height: sz, borderRadius: '50%', backgroundColor: design.accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {img ? (
            <img src={img.url} alt={label} crossOrigin="anonymous" style={{ width: sz * 0.6, height: sz * 0.6, objectFit: 'contain', display: 'block', filter: iconFilter }} />
          ) : (
            <svg width={sz * 0.45} height={sz * 0.45} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <circle cx="12" cy="12" r="9" /><path d="M12 8v4l2 2" strokeLinecap="round" />
            </svg>
          )}
        </div>
        <p style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: settings.iconLabelFontSize,
          lineHeight: `${settings.iconLabelLineHeight}px`,
          color: design.bodyColor,
          fontWeight: 600,
          textAlign: 'center',
          margin: 0,
        }}>
          {label || `Feature ${index + 1}`}
        </p>
      </div>
    )
  }

  return (
    <div style={{ width: W, height: W, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Photo section ── */}
      <div style={{ height: topH, position: 'relative', flexShrink: 0, overflow: 'hidden' }} onMouseDown={onPhotoMouseDown}>
        {productImg ? (
          <img src={productImg.url} alt="" crossOrigin="anonymous" style={applyPhotoComposition(settings.photoComposition ?? DEFAULT_PHOTO_COMP)} />
        ) : (
          <div style={{ width: '100%', height: '100%', backgroundColor: '#c4c4c4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#9ca3af', fontSize: 28, fontFamily: 'system-ui' }}>Product Photo</span>
          </div>
        )}
        {logoImg && (
          <div style={logoPos}>
            <img src={logoImg.url} alt="logo" crossOrigin="anonymous" style={{ maxHeight: settings.logoSize, maxWidth: settings.logoSize * 3.5, objectFit: 'contain', display: 'block' }} />
          </div>
        )}
        {/* 8px accent separator */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 8, backgroundColor: design.accentColor }} />
      </div>

      {/* ── Dark panel ── */}
      <div style={{ height: botH, flexShrink: 0, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Background */}
        {textureImg ? (
          <img src={textureImg.url} alt="background" crossOrigin="anonymous" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, backgroundColor: design.primaryColor }} />
        )}
        {textureImg && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)' }} />}

        {/* Title area */}
        <div style={{
          position: 'relative',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          padding: `${settings.contentPaddingV}px ${settings.contentPaddingX}px`,
          boxSizing: 'border-box',
        }}>
          <div className="rich-title" style={{
            fontFamily: 'var(--font-anton), Anton, sans-serif',
            fontSize: settings.titleFontSize,
            fontWeight: 400,
            lineHeight: settings.titleLineHeight,
            color: design.accentColor,
            margin: 0,
            letterSpacing: '0.01em',
            textTransform: settings.titleTextTransform,
            maxWidth: settings.titleWidth < 100 ? `${settings.titleWidth}%` : undefined,
          }} dangerouslySetInnerHTML={{ __html: design.title || '<p>Product Title</p>' }} />
          {design.galleryIconsShowDescription && design.subtitleHtml && (
            <div className="rich-subtitle" style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: settings.subtitleFontSize,
              lineHeight: `${settings.subtitleLineHeight}px`,
              fontWeight: 400,
              color: design.bodyColor,
              margin: '12px 0 0',
              textTransform: settings.subtitleTextTransform,
              maxWidth: settings.subtitleWidth < 100 ? `${settings.subtitleWidth}%` : undefined,
            }} dangerouslySetInnerHTML={{ __html: design.subtitleHtml }} />
          )}
        </div>

        {/* Icon row — blurred dark tiles side by side */}
        <div style={{
          position: 'relative',
          height: iconRowH,
          flexShrink: 0,
          display: 'flex',
          gap: 12,
          padding: `0 ${settings.contentPaddingX}px ${settings.contentPaddingX}px`,
          boxSizing: 'border-box',
          alignItems: 'stretch',
        }}>
          {Array.from({ length: design.iconCount }, (_, i) => <IconBox key={i} index={i} />)}
        </div>
      </div>

    </div>
  )
}

// ─── A+ 50/50 canvas renderer ─────────────────────────────────────────────────

export function CanvasContent({ design, settings, onPhotoMouseDown }: { design: DesignState; settings: FormatSettings; onPhotoMouseDown?: (e: React.MouseEvent<HTMLDivElement>) => void }) {
  const productImg = design.assets[0]
  const textureImg = design.assets[1]
  const logoImg    = design.assets[2]

  // Accent bar sits at the center seam (not inside a panel) so it stays aligned regardless of flip
  const contentPad = `${settings.contentPaddingV}px ${settings.contentPaddingX}px ${settings.contentPaddingV}px ${settings.contentPaddingX}px`

  const logoPos: React.CSSProperties = {
    position: 'absolute',
    top:    settings.logoCorner.startsWith('t') ? settings.logoPadding : undefined,
    bottom: settings.logoCorner.startsWith('b') ? settings.logoPadding : undefined,
    left:   settings.logoCorner.endsWith('l') ? (settings.layoutFlipped ? settings.logoPadding : settings.logoPadding + 5) : undefined,
    right:  settings.logoCorner.endsWith('r') ? (settings.layoutFlipped ? settings.logoPadding + 5 : settings.logoPadding) : undefined,
  }

  const PhotoPanel = (
    <div style={{ width: '50%', position: 'relative', overflow: 'hidden', flexShrink: 0 }} onMouseDown={onPhotoMouseDown}>
      {productImg ? (
        <img src={productImg.url} alt="" crossOrigin="anonymous" style={applyPhotoComposition(settings.photoComposition ?? DEFAULT_PHOTO_COMP)} />
      ) : (
        <div style={{ width: '100%', height: '100%', backgroundColor: '#c4c4c4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: '#9ca3af', fontSize: 13, fontFamily: 'system-ui' }}>Product Photo</span>
        </div>
      )}
    </div>
  )

  const ContentPanel = (
    <div style={{ width: '50%', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
      {textureImg ? (
        <img src={textureImg.url} alt="background" crossOrigin="anonymous" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, backgroundColor: design.primaryColor }} />
      )}
      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)' }} />
      <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: contentPad }}>
        {logoImg && (
          <div style={logoPos}>
            <img src={logoImg.url} alt="logo" crossOrigin="anonymous" style={{ maxHeight: settings.logoSize, maxWidth: settings.logoSize * 3.5, objectFit: 'contain', display: 'block' }} />
          </div>
        )}
        <div className="rich-title" style={{
          fontFamily: 'var(--font-anton), Anton, sans-serif',
          fontSize: settings.titleFontSize,
          fontWeight: 400,
          lineHeight: settings.titleLineHeight,
          color: design.accentColor,
          margin: '0 0 14px',
          letterSpacing: '0.01em',
          textShadow: '0 2px 8px rgba(0,0,0,0.5)',
          textTransform: settings.titleTextTransform,
          maxWidth: settings.titleWidth < 100 ? `${settings.titleWidth}%` : undefined,
        }} dangerouslySetInnerHTML={{ __html: design.title || '<p>Product Title</p>' }} />
        {design.subtitleHtml && (
          <div className="rich-subtitle" style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: settings.subtitleFontSize,
            lineHeight: `${settings.subtitleLineHeight}px`,
            fontWeight: 400,
            color: design.bodyColor,
            margin: 0,
            textTransform: settings.subtitleTextTransform,
            maxWidth: settings.subtitleWidth < 100 ? `${settings.subtitleWidth}%` : undefined,
          }} dangerouslySetInnerHTML={{ __html: design.subtitleHtml }} />
        )}
      </div>
    </div>
  )

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', overflow: 'hidden', position: 'relative' }}>
      {settings.layoutFlipped ? <>{ContentPanel}{PhotoPanel}</> : <>{PhotoPanel}{ContentPanel}</>}
      {/* Bar centered on the seam — same position regardless of flip */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 'calc(50% - 4px)', width: 8, backgroundColor: design.accentColor, zIndex: 2 }} />
    </div>
  )
}

// ─── A+ Icons canvas renderer ─────────────────────────────────────────────────

export function CanvasContentIcons({ design, settings, onPhotoMouseDown }: { design: DesignState; settings: FormatSettings; onPhotoMouseDown?: (e: React.MouseEvent<HTMLDivElement>) => void }) {
  const productImg = design.assets[0]
  const textureImg = design.assets[1]
  const logoImg    = design.assets[2]
  const iconImgs   = [design.assets[3], design.assets[4], design.assets[5], design.assets[6]]

  const isMobile = design.activeFormat === 'mobile'
  const template = getTemplate(design.activeTemplate, design.activeFormat)

  const bgPanel = (
    <div style={{ position: 'absolute', inset: 0 }}>
      {textureImg ? (
        <img src={textureImg.url} alt="background" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', backgroundColor: design.primaryColor }} />
      )}
      {textureImg && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)' }} />}
    </div>
  )

  // Accent bar is placed on the outer wrapper centered on the seam — keeps it aligned regardless of flip

  const iconFilter2 = iconColorToFilter(design.iconColor ?? '#ffffff')

  const IconBox = ({ index }: { index: number }) => {
    const img = iconImgs[index]
    const label = design.iconLabels[index]
    const sz = settings.iconSize
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: isMobile ? 8 : 12,
        padding: isMobile ? '10px 6px' : '14px 10px',
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: 0,
        backgroundColor: 'rgba(255,255,255,0.07)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}>
        <div style={{ width: sz, height: sz, borderRadius: '50%', backgroundColor: design.accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {img ? (
            <img src={img.url} alt={label} crossOrigin="anonymous" style={{ width: sz * 0.6, height: sz * 0.6, objectFit: 'contain', display: 'block', filter: iconFilter2 }} />
          ) : (
            <svg width={sz * 0.45} height={sz * 0.45} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <circle cx="12" cy="12" r="9" /><path d="M12 8v4l2 2" strokeLinecap="round" />
            </svg>
          )}
        </div>
        <p style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: settings.iconLabelFontSize,
          lineHeight: `${settings.iconLabelLineHeight}px`,
          color: design.bodyColor,
          fontWeight: 600,
          textAlign: 'center',
          margin: 0,
        }}>
          {label || `Icon ${index + 1}`}
        </p>
      </div>
    )
  }

  const iconRow = (
    <div style={{ display: 'flex', gap: isMobile ? 8 : 12, width: '100%', alignItems: isMobile ? 'stretch' : 'center' }}>
      {Array.from({ length: design.iconCount }, (_, i) => <IconBox key={i} index={i} />)}
    </div>
  )

  const logoPos: React.CSSProperties = {
    position: 'absolute',
    top:    settings.logoCorner.startsWith('t') ? settings.logoPadding : undefined,
    bottom: settings.logoCorner.startsWith('b') ? settings.logoPadding : undefined,
    left:   settings.logoCorner.endsWith('l') ? settings.logoPadding : undefined,
    right:  settings.logoCorner.endsWith('r') ? settings.logoPadding : undefined,
  }

  if (isMobile) {
    const topH = Math.round(template.height * 0.55)
    const botH = template.height - topH
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: topH, display: 'flex', flexShrink: 0, position: 'relative' }}>
          {/* Bar centered on the seam */}
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 'calc(50% - 4px)', width: 8, backgroundColor: design.accentColor, zIndex: 2 }} />
          <div style={{ width: '50%', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
            {bgPanel}
            <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: `${settings.contentPaddingV}px ${settings.contentPaddingX}px` }}>
              {logoImg && (
                <div style={logoPos}>
                  <img src={logoImg.url} alt="logo" crossOrigin="anonymous" style={{ maxHeight: settings.logoSize, maxWidth: settings.logoSize * 3.5, objectFit: 'contain', display: 'block' }} />
                </div>
              )}
              <div className="rich-title" style={{
                fontFamily: 'var(--font-anton), Anton, sans-serif',
                fontSize: settings.titleFontSize,
                fontWeight: 400,
                lineHeight: settings.titleLineHeight,
                color: design.accentColor,
                margin: 0,
                letterSpacing: '0.01em',
                textShadow: '0 2px 8px rgba(0,0,0,0.5)',
                textTransform: settings.titleTextTransform,
                maxWidth: settings.titleWidth < 100 ? `${settings.titleWidth}%` : undefined,
              }} dangerouslySetInnerHTML={{ __html: design.title || '<p>Product Title</p>' }} />
            </div>
          </div>
          <div style={{ width: '50%', position: 'relative', overflow: 'hidden', flexShrink: 0 }} onMouseDown={onPhotoMouseDown}>
            {productImg ? (
              <img src={productImg.url} alt="" crossOrigin="anonymous" style={applyPhotoComposition(settings.photoComposition ?? DEFAULT_PHOTO_COMP)} />
            ) : (
              <div style={{ width: '100%', height: '100%', backgroundColor: '#c4c4c4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#9ca3af', fontSize: 12, fontFamily: 'system-ui' }}>Photo</span>
              </div>
            )}
          </div>
        </div>
        <div style={{ height: botH, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
          {bgPanel}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 8, backgroundColor: design.accentColor, zIndex: 1 }} />
          <div style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'stretch', padding: `${16 + 8}px ${settings.contentPaddingX}px 16px`, boxSizing: 'border-box' }}>
            {iconRow}
          </div>
        </div>
      </div>
    )
  }

  // Bar is now on the outer wrapper (not inside content panel), uniform padding on all sides
  const iconsPanelPad = `${settings.contentPaddingV}px ${settings.contentPaddingX}px ${settings.contentPaddingV * 0.75}px ${settings.contentPaddingX}px`

  const ContentPanel = (
    <div style={{ width: '50%', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
      {bgPanel}
      <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', padding: iconsPanelPad, boxSizing: 'border-box' }}>
        {/* Logo as a flow item so it never overlaps the title — left/right corner controls alignment */}
        {logoImg && (
          <div style={{ flexShrink: 0, marginBottom: 16, display: 'flex', justifyContent: settings.logoCorner.endsWith('r') ? 'flex-end' : 'flex-start' }}>
            <img src={logoImg.url} alt="logo" crossOrigin="anonymous" style={{ maxHeight: settings.logoSize, maxWidth: settings.logoSize * 3.5, objectFit: 'contain', display: 'block' }} />
          </div>
        )}
        {/* Title + subtitle vertically centered in remaining space */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
          <div className="rich-title" style={{
            fontFamily: 'var(--font-anton), Anton, sans-serif',
            fontSize: settings.titleFontSize,
            fontWeight: 400,
            lineHeight: settings.titleLineHeight,
            color: design.accentColor,
            margin: '0 0 12px',
            letterSpacing: '0.01em',
            textShadow: '0 2px 8px rgba(0,0,0,0.5)',
            textTransform: settings.titleTextTransform,
            maxWidth: settings.titleWidth < 100 ? `${settings.titleWidth}%` : undefined,
          }} dangerouslySetInnerHTML={{ __html: design.title || '<p>Product Title</p>' }} />
          {design.subtitleHtml && (
            <div className="rich-subtitle" style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: settings.subtitleFontSize,
              lineHeight: `${settings.subtitleLineHeight}px`,
              fontWeight: 400,
              color: design.bodyColor,
              margin: 0,
              textTransform: settings.subtitleTextTransform,
              maxWidth: settings.subtitleWidth < 100 ? `${settings.subtitleWidth}%` : undefined,
            }} dangerouslySetInnerHTML={{ __html: design.subtitleHtml }} />
          )}
        </div>
        {/* Icons pinned to bottom */}
        <div style={{ flexShrink: 0, marginTop: 16 }}>{iconRow}</div>
      </div>
    </div>
  )

  const PhotoPanel = (
    <div style={{ width: '50%', position: 'relative', overflow: 'hidden', flexShrink: 0 }} onMouseDown={onPhotoMouseDown}>
      {productImg ? (
        <img src={productImg.url} alt="" crossOrigin="anonymous" style={applyPhotoComposition(settings.photoComposition ?? DEFAULT_PHOTO_COMP)} />
      ) : (
        <div style={{ width: '100%', height: '100%', backgroundColor: '#c4c4c4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: '#9ca3af', fontSize: 13, fontFamily: 'system-ui' }}>Product Photo</span>
        </div>
      )}
    </div>
  )

  // Default (not flipped): content LEFT, photo RIGHT
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', overflow: 'hidden', position: 'relative' }}>
      {settings.layoutFlipped ? <>{PhotoPanel}{ContentPanel}</> : <>{ContentPanel}{PhotoPanel}</>}
      {/* Bar centered on the seam — same position regardless of flip */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 'calc(50% - 4px)', width: 8, backgroundColor: design.accentColor, zIndex: 2 }} />
    </div>
  )
}
