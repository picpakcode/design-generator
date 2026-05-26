import React from 'react'
import { DesignState, FormatSettings } from '@/types'
import { getTemplate } from '@/lib/templates'

// ─── Gallery canvas renderer ──────────────────────────────────────────────────

export function CanvasContentGallery({ design, settings }: { design: DesignState; settings: FormatSettings }) {
  const productImg = design.assets[0]
  const textureImg = design.assets[1]
  const logoImg    = design.assets[2]

  const W = 1500
  const topH = Math.round(W * 0.58)  // ~870px photo
  const botH = W - topH               // ~630px text panel

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
      <div style={{ height: topH, position: 'relative', flexShrink: 0 }}>
        {productImg ? (
          <img
            src={productImg.url}
            alt={design.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
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
          <img src={textureImg.url} alt="background" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, backgroundColor: design.primaryColor }} />
        )}
        {textureImg && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)' }} />}
      <div style={{
        position: 'relative',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
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

export function CanvasContentGalleryIcons({ design, settings }: { design: DesignState; settings: FormatSettings }) {
  const productImg = design.assets[0]
  const textureImg = design.assets[1]
  const logoImg    = design.assets[2]
  const iconImgs   = [design.assets[3], design.assets[4], design.assets[5], design.assets[6]]

  const W = 1500
  const topH    = Math.round(W * 0.55)  // ~825px photo
  const botH    = W - topH               // ~675px dark panel
  const iconRowH = Math.round(botH * 0.42) // ~284px icon row at bottom
  const titleH   = botH - iconRowH        // ~391px title area

  const logoPos: React.CSSProperties = {
    position: 'absolute',
    top:    settings.logoCorner.startsWith('t') ? settings.logoPadding : undefined,
    bottom: settings.logoCorner.startsWith('b') ? settings.logoPadding : undefined,
    left:   settings.logoCorner.endsWith('l') ? settings.logoPadding : undefined,
    right:  settings.logoCorner.endsWith('r') ? settings.logoPadding : undefined,
  }

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
            <img src={img.url} alt={label} style={{ width: sz * 0.6, height: sz * 0.6, objectFit: 'contain', display: 'block' }} />
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
      <div style={{ height: topH, position: 'relative', flexShrink: 0 }}>
        {productImg ? (
          <img src={productImg.url} alt={design.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', backgroundColor: '#c4c4c4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#9ca3af', fontSize: 28, fontFamily: 'system-ui' }}>Product Photo</span>
          </div>
        )}
        {logoImg && (
          <div style={logoPos}>
            <img src={logoImg.url} alt="logo" style={{ maxHeight: settings.logoSize, maxWidth: settings.logoSize * 3.5, objectFit: 'contain', display: 'block' }} />
          </div>
        )}
        {/* 8px accent separator */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 8, backgroundColor: design.accentColor }} />
      </div>

      {/* ── Dark panel ── */}
      <div style={{ height: botH, flexShrink: 0, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Background */}
        {textureImg ? (
          <img src={textureImg.url} alt="background" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <div style={{ position: 'absolute', inset: 0, backgroundColor: design.primaryColor }} />
        )}
        {textureImg && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)' }} />}

        {/* Title area */}
        <div style={{
          position: 'relative',
          height: titleH,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
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

export function CanvasContent({ design, settings }: { design: DesignState; settings: FormatSettings }) {
  const productImg = design.assets[0]
  const textureImg = design.assets[1]
  const logoImg    = design.assets[2]

  const accentBar: React.CSSProperties = settings.layoutFlipped
    ? { position: 'absolute', top: 0, right: 0, bottom: 0, width: 8, backgroundColor: design.accentColor }
    : { position: 'absolute', top: 0, left: 0, bottom: 0, width: 8, backgroundColor: design.accentColor }

  const contentPad = settings.layoutFlipped
    ? `${settings.contentPaddingV}px ${settings.contentPaddingX + 8}px ${settings.contentPaddingV}px ${settings.contentPaddingX}px`
    : `${settings.contentPaddingV}px ${settings.contentPaddingX}px ${settings.contentPaddingV}px ${settings.contentPaddingX + 8}px`

  const logoPos: React.CSSProperties = {
    position: 'absolute',
    top:    settings.logoCorner.startsWith('t') ? settings.logoPadding : undefined,
    bottom: settings.logoCorner.startsWith('b') ? settings.logoPadding : undefined,
    left:   settings.logoCorner.endsWith('l') ? (settings.layoutFlipped ? settings.logoPadding : settings.logoPadding + 5) : undefined,
    right:  settings.logoCorner.endsWith('r') ? (settings.layoutFlipped ? settings.logoPadding + 5 : settings.logoPadding) : undefined,
  }

  const PhotoPanel = (
    <div style={{ width: '50%', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
      {productImg ? (
        <img src={productImg.url} alt={design.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
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
        <img src={textureImg.url} alt="background" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, backgroundColor: design.primaryColor }} />
      )}
      <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)' }} />
      <div style={accentBar} />
      <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: contentPad }}>
        {logoImg && (
          <div style={logoPos}>
            <img src={logoImg.url} alt="logo" style={{ maxHeight: settings.logoSize, maxWidth: settings.logoSize * 3.5, objectFit: 'contain', display: 'block' }} />
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
    <div style={{ width: '100%', height: '100%', display: 'flex', overflow: 'hidden' }}>
      {settings.layoutFlipped ? <>{ContentPanel}{PhotoPanel}</> : <>{PhotoPanel}{ContentPanel}</>}
    </div>
  )
}

// ─── A+ Icons canvas renderer ─────────────────────────────────────────────────

export function CanvasContentIcons({ design, settings }: { design: DesignState; settings: FormatSettings }) {
  const productImg = design.assets[0]
  const textureImg = design.assets[1]
  const logoImg    = design.assets[2]
  const iconImgs   = [design.assets[3], design.assets[4], design.assets[5], design.assets[6]]

  const isMobile = design.activeFormat === 'mobile'
  const template = getTemplate(design.activeTemplate, design.activeFormat)

  const bgPanel = (
    <div style={{ position: 'absolute', inset: 0 }}>
      {textureImg ? (
        <img src={textureImg.url} alt="background" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', backgroundColor: design.primaryColor }} />
      )}
      {textureImg && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)' }} />}
    </div>
  )

  const accentBarStyle: React.CSSProperties = settings.layoutFlipped
    ? { position: 'absolute', top: 0, right: 0, bottom: 0, width: 8, backgroundColor: design.accentColor }
    : { position: 'absolute', top: 0, left: 0, bottom: 0, width: 8, backgroundColor: design.accentColor }

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
        {img ? (
          <img src={img.url} alt={label} style={{ width: sz, height: sz, objectFit: 'contain', display: 'block' }} />
        ) : (
          <div style={{ width: sz, height: sz, borderRadius: '50%', backgroundColor: design.accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={sz * 0.45} height={sz * 0.45} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <circle cx="12" cy="12" r="9" /><path d="M12 8v4l2 2" strokeLinecap="round" />
            </svg>
          </div>
        )}
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
        <div style={{ height: topH, display: 'flex', flexShrink: 0 }}>
          <div style={{ width: '50%', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
            {bgPanel}
            <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 8, backgroundColor: design.accentColor }} />
            <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: `${settings.contentPaddingV}px ${settings.contentPaddingX}px` }}>
              {logoImg && (
                <div style={logoPos}>
                  <img src={logoImg.url} alt="logo" style={{ maxHeight: settings.logoSize, maxWidth: settings.logoSize * 3.5, objectFit: 'contain', display: 'block' }} />
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
          <div style={{ width: '50%', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
            {productImg ? (
              <img src={productImg.url} alt={design.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
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

  const ContentPanel = (
    <div style={{ width: '50%', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
      {bgPanel}
      <div style={accentBarStyle} />
      <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: `${settings.contentPaddingV}px ${settings.contentPaddingX}px ${settings.contentPaddingV * 0.75}px ${settings.contentPaddingX + 8}px` }}>
        {logoImg && (
          <div style={logoPos}>
            <img src={logoImg.url} alt="logo" style={{ maxHeight: settings.logoSize, maxWidth: settings.logoSize * 3.5, objectFit: 'contain', display: 'block' }} />
          </div>
        )}
        <div>
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
        <div style={{ marginTop: 16 }}>{iconRow}</div>
      </div>
    </div>
  )

  const PhotoPanel = (
    <div style={{ width: '50%', position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
      {productImg ? (
        <img src={productImg.url} alt={design.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', backgroundColor: '#c4c4c4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: '#9ca3af', fontSize: 13, fontFamily: 'system-ui' }}>Product Photo</span>
        </div>
      )}
    </div>
  )

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', overflow: 'hidden' }}>
      {settings.layoutFlipped ? <>{ContentPanel}{PhotoPanel}</> : <>{PhotoPanel}{ContentPanel}</>}
    </div>
  )
}
