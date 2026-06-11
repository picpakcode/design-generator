export type Platform = 'amazon' | 'shopify'
export type TextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize'
export type LogoCorner = 'tl' | 'tr' | 'bl' | 'br'
export type Format = 'desktop' | 'mobile'
export type Category = 'aplus' | 'gallery'
export type TemplateId = 'aplus-5050' | 'aplus-icons' | 'aplus-hero' | 'aplus-brand-story'
export type GalleryTemplateId = 'gallery-hero' | 'gallery-icons' | 'gallery-feature' | 'gallery-lifestyle'

export interface TemplateConfig {
  id: string
  name: string
  platform: Platform
  width: number
  height: number
  description: string
  category: string
  templateId: TemplateId
  format: Format
}

export interface GalleryTemplateConfig {
  id: string
  name: string
  platform: Platform
  width: number
  height: number
  description: string
  category: string
  templateId: GalleryTemplateId
}

export interface UploadedAsset {
  id: string
  name: string
  url: string
  type: 'image'
}

export interface PhotoComposition {
  scale:    number   // 1.0 – 4.0
  x:        number   // pan, fraction of container width, -1 to 1
  y:        number   // pan, fraction of container height, -1 to 1
  rotation: number   // degrees -180 to 180
  flipH:    boolean
}

export const DEFAULT_PHOTO_COMP: PhotoComposition = { scale: 1, x: 0, y: 0, rotation: 0, flipH: false }

export interface FormatSettings {
  layoutFlipped: boolean
  logoCorner: LogoCorner
  logoSize: number         // canvas px
  logoPadding: number      // canvas px
  titleFontSize: number    // canvas px
  titleLineHeight: number  // ratio, e.g. 1.0 = 100%
  subtitleFontSize: number // canvas px
  subtitleLineHeight: number // canvas px (absolute leading)
  contentPaddingX: number  // canvas px
  contentPaddingV: number  // canvas px
  titleWidth: number       // max-width %, 20–100
  subtitleWidth: number    // max-width %, 20–100
  titleTextTransform: TextTransform
  subtitleTextTransform: TextTransform
  // Icon row (used by aplus-icons template)
  iconSize: number
  iconLabelFontSize: number
  iconLabelLineHeight: number
  photoComposition: PhotoComposition
}

export interface DesignBlock {
  id: string
  templateId: TemplateId
  title: string
  subtitleHtml: string
  iconCount: number
  iconLabels: [string, string, string, string]
  layoutFlipped: boolean  // applies to both desktop and mobile for this block
  slug?: string           // optional label used in export filenames
  assets: UploadedAsset[] // per-block photo / texture / logo / icons
}

export interface GalleryBlock {
  id: string
  templateId: GalleryTemplateId
  assets: UploadedAsset[]
  title: string
  subtitleHtml: string
  iconCount: number
  iconLabels: [string, string, string, string]
  slug?: string
  showDescription?: boolean
}

export interface DesignState {
  activeCategory: Category
  activeFormat: Format
  activeTemplate: TemplateId
  activeGalleryTemplate: GalleryTemplateId
  assets: UploadedAsset[]
  iconCount: 2 | 3 | 4
  iconLabels: [string, string, string, string]
  title: string
  subtitleHtml: string
  primaryColor: string
  accentColor: string
  bodyColor: string
  iconColor: string
  desktop: FormatSettings
  mobile: FormatSettings
  gallery: FormatSettings
  blocks: DesignBlock[]
  activeBlockId: string
  productName: string     // used as the constant prefix in all export filenames
  galleryBlocks: GalleryBlock[]
  activeGalleryBlockId: string
  galleryIconsShowDescription: boolean
  iconsMobileShowDesc?: boolean   // show description in mobile icons-text layout
}

// ── Template Mode share types ─────────────────────────────────────────────────

export interface TemplateShareSlotState {
  title: string
  desc: string
  iconLabels: [string, string, string, string]
  iconCount: 2 | 3 | 4
  photoAsset?: UploadedAsset
  iconAssets: (UploadedAsset | undefined)[]
}

export interface TemplateShareSlotConfig { template: string; mobileShowDesc?: boolean }
export interface TemplateShareGalleryConfig { template: string }

export interface TemplateShareState {
  products: import('@/lib/csv').BulkProduct[]
  allSlots: Record<string, TemplateShareSlotState[]>
  allGallerySlots: Record<string, TemplateShareSlotState[]>
  slotConfigs: TemplateShareSlotConfig[]
  galleryConfigs: TemplateShareGalleryConfig[]
  aplusSlots: number
  galleryCount: number
  includeGallery?: boolean
  shopifyGalleryConfigs?: TemplateShareGalleryConfig[]
  logoAsset: UploadedAsset | null
  textureAsset: UploadedAsset | null
  productNames?: Record<string, string>
  selectedId?: string | null
  activeSlotIdx?: number
  activeIsGallery?: boolean
  activeGalleryIdx?: number
}
