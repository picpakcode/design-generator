import { Format, GalleryTemplateConfig, GalleryTemplateId, TemplateConfig, TemplateId } from '@/types'

export const TEMPLATES: TemplateConfig[] = [
  {
    id: 'amazon-aplus-5050-desktop',
    templateId: 'aplus-5050',
    name: 'Desktop',
    platform: 'amazon',
    width: 1464,
    height: 600,
    format: 'desktop',
    category: 'A+ Content',
    description: 'Amazon A+ 50/50 desktop (1464×600)',
  },
  {
    id: 'amazon-aplus-5050-mobile',
    templateId: 'aplus-5050',
    name: 'Mobile',
    platform: 'amazon',
    width: 600,
    height: 450,
    format: 'mobile',
    category: 'A+ Content',
    description: 'Amazon A+ 50/50 mobile (600×450)',
  },
  {
    id: 'amazon-aplus-icons-desktop',
    templateId: 'aplus-icons',
    name: 'Desktop',
    platform: 'amazon',
    width: 1464,
    height: 600,
    format: 'desktop',
    category: 'A+ Content',
    description: 'Amazon A+ icons desktop (1464×600)',
  },
  {
    id: 'amazon-aplus-icons-mobile',
    templateId: 'aplus-icons',
    name: 'Mobile',
    platform: 'amazon',
    width: 600,
    height: 450,
    format: 'mobile',
    category: 'A+ Content',
    description: 'Amazon A+ icons mobile (600×450)',
  },
]

export const GALLERY_TEMPLATES: GalleryTemplateConfig[] = [
  {
    id: 'amazon-gallery-hero',
    templateId: 'gallery-hero',
    name: 'Gallery Hero',
    platform: 'amazon',
    width: 1500,
    height: 1500,
    category: 'Gallery Images',
    description: 'Full photo with text panel (1500×1500)',
  },
  {
    id: 'amazon-gallery-icons',
    templateId: 'gallery-icons',
    name: 'Gallery Icons',
    platform: 'amazon',
    width: 1500,
    height: 1500,
    category: 'Gallery Images',
    description: 'Photo top, title + 3 icons below (1500×1500)',
  },
]

export function getTemplate(templateId: TemplateId, format: Format): TemplateConfig {
  return TEMPLATES.find(t => t.templateId === templateId && t.format === format)!
}

export function getGalleryTemplate(templateId: GalleryTemplateId): GalleryTemplateConfig {
  return GALLERY_TEMPLATES.find(t => t.templateId === templateId)!
}
