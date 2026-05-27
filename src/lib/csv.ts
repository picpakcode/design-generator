// CSV parsing for bulk product data

export interface SlotData {
  title: string
  desc: string
  iconCallouts: [string, string, string, string]
}

export interface BulkProduct {
  id: string
  sku: string
  productName: string
  photos: string[]         // Canto tags/IDs, 1–5
  slots: SlotData[]        // a1, b1, c1… in order
  warnings: string[]
}

export interface ParseResult {
  products: BulkProduct[]
  errors: string[]         // file-level errors (bad header, empty file)
}

// ─── Column name normaliser ───────────────────────────────────────────────────

function col(s: string) {
  return s.toLowerCase().replace(/[\s_-]+/g, '_').trim()
}

// ─── CSV text → array of row objects ─────────────────────────────────────────

function parseCSVText(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  if (lines.length < 2) return []

  // Parse quoted CSV fields
  function splitLine(line: string): string[] {
    const fields: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
        else inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        fields.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    fields.push(current.trim())
    return fields
  }

  const headers = splitLine(lines[0]).map(col)
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = splitLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = values[idx] ?? '' })
    rows.push(row)
  }

  return rows
}

// ─── Map a raw row to BulkProduct ────────────────────────────────────────────

const MAX_SLOTS  = 8
const MAX_PHOTOS = 5
const MAX_ICONS  = 4

function rowToProduct(row: Record<string, string>, idx: number): BulkProduct {
  const warnings: string[] = []

  const sku  = row['sku']?.trim() || `row-${idx + 1}`
  const name = row['product_name']?.trim() || row['name']?.trim() || ''
  if (!name) warnings.push('Missing product_name')

  // Photos (optional — Canto auto-fetches by SKU when columns are blank)
  const photos: string[] = []
  for (let p = 1; p <= MAX_PHOTOS; p++) {
    const v = row[`photo_${p}`]?.trim()
    if (v) photos.push(v)
  }

  // Slots
  const slots: SlotData[] = []
  const slotLetters = Array.from({ length: MAX_SLOTS }, (_, i) =>
    String.fromCharCode(97 + i)           // a, b, c, d, e, f, g, h
  )

  for (const letter of slotLetters) {
    const titleKey = `${letter}1_title`
    const descKey  = `${letter}1_desc`
    const title    = row[titleKey]?.trim() || ''
    if (!title) break                       // stop at first missing slot

    const desc = row[descKey]?.trim() || ''

    const iconCallouts: [string, string, string, string] = ['', '', '', '']
    for (let ic = 1; ic <= MAX_ICONS; ic++) {
      const v = row[`${letter}1_icon${ic}`]?.trim()
      if (v) iconCallouts[ic - 1] = v
    }

    slots.push({ title, desc, iconCallouts })
  }

  if (slots.length === 0) warnings.push('No slot titles found (a1_title, b1_title…)')

  return {
    id: `${sku}-${idx}`,
    sku,
    productName: name,
    photos,
    slots,
    warnings,
  }
}

// ─── Public entry point ───────────────────────────────────────────────────────

export function parseCSV(text: string): ParseResult {
  const errors: string[] = []

  if (!text.trim()) {
    return { products: [], errors: ['File is empty'] }
  }

  const rows = parseCSVText(text)
  if (rows.length === 0) {
    return { products: [], errors: ['No data rows found — check the file has a header row'] }
  }

  // Validate required headers exist
  const headers = Object.keys(rows[0])
  if (!headers.includes('sku')) errors.push('Missing column: sku')
  if (!headers.some(h => h.startsWith('a1_title') || h === 'a1_title')) {
    errors.push('Missing column: a1_title')
  }

  if (errors.length > 0) return { products: [], errors }

  const products = rows
    .filter(r => Object.values(r).some(v => v.trim()))  // skip blank rows
    .map((r, i) => rowToProduct(r, i))

  return { products, errors }
}

// ─── Template CSV download ────────────────────────────────────────────────────

export function downloadTemplate() {
  const headers = [
    'sku', 'product_name',
    'photo_1', 'photo_2', 'photo_3', 'photo_4', 'photo_5',
    'a1_title', 'a1_desc',
    'b1_title', 'b1_icon1', 'b1_icon2', 'b1_icon3', 'b1_icon4',
    'c1_title', 'c1_desc',
    'd1_title', 'd1_desc',
    'e1_title', 'e1_desc',
  ]

  const example = [
    'FH-2001', 'Fiber Hairbrush Pro',
    'fh-2001-angle', 'fh-2001-lifestyle', 'fh-2001-closeup', 'fh-2001-flat', 'fh-2001-group',
    'Detangles in Seconds', 'Flexible bristles glide through any hair type.',
    'Built Different', 'Ergonomic handle for all-day comfort', 'Heat-resistant up to 230°C', 'Anti-static coating', 'Suitable for all hair types',
    'Professional Grade', 'Salon-quality results at home.',
    'Designed for Real Life', 'Lightweight enough to use every day.',
    'The Details Matter', 'Every curve engineered for performance.',
  ]

  const csv = [headers.join(','), example.map(v => `"${v}"`).join(',')].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = 'bulk-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}
