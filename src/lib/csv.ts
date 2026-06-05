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
  gallerySlots: SlotData[] // g1, g2, g3… independent gallery slides
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

  // Gallery slides (g1_title, g1_desc, g1_icon1…4, g2_title…)
  const gallerySlots: SlotData[] = []
  for (let g = 1; g <= 20; g++) {
    const title = row[`g${g}_title`]?.trim() || ''
    if (!title) break
    const desc = row[`g${g}_desc`]?.trim() || ''
    const iconCallouts: [string, string, string, string] = ['', '', '', '']
    for (let ic = 1; ic <= MAX_ICONS; ic++) {
      const v = row[`g${g}_icon${ic}`]?.trim()
      if (v) iconCallouts[ic - 1] = v
    }
    gallerySlots.push({ title, desc, iconCallouts })
  }

  return {
    id: `${sku}-${idx}`,
    sku,
    productName: name,
    photos,
    slots,
    gallerySlots,
    warnings,
  }
}

// ─── Public entry point ───────────────────────────────────────────────────────

export function parseCSV(text: string, options?: { requireSku?: boolean }): ParseResult {
  const requireSku = options?.requireSku ?? true
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
  if (requireSku && !headers.includes('sku')) errors.push('Missing column: sku')
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
  // Template Mode CSV — no photo columns (photos are picked via the Canto UI picker)
  // Column layout:
  //   a1 → 5050-right  (title + desc, no icons)
  //   b1 → icons-text  (title + desc + icon callouts  → auto-detected as icons-text)
  //   c1 → 5050-right  (title + desc, no icons)
  //   d1 → 5050-left   (title + desc, no icons)
  //   e1 → 5050-right  (title + desc, no icons)
  //   g1 → gallery-hero       (title + desc, no icons)
  //   g2 → gallery-icons-text (title + desc + icons → auto-detected as gallery-icons-text)
  const headers = [
    'sku', 'product_name',
    'a1_title', 'a1_desc',
    'b1_title', 'b1_desc', 'b1_icon1', 'b1_icon2', 'b1_icon3', 'b1_icon4',
    'c1_title', 'c1_desc',
    'd1_title', 'd1_desc',
    'e1_title', 'e1_desc',
    'g1_title', 'g1_desc',
    'g2_title', 'g2_desc', 'g2_icon1', 'g2_icon2', 'g2_icon3', 'g2_icon4',
  ]

  const rows: string[][] = [
    [
      'DH515146',
      "Doc's Diesel Chevrolet/GMC 6.6L Duramax RWD/SRW Premium E-Coated Front Wheel Hub Assembly 2011-2019",
      // a1 — 5050-right
      'Precision-Engineered Fit',
      "Designed specifically for the Chevy/GMC Duramax platform, delivering exact OEM geometry for smooth, rattle-free driving on 2011–2019 2500/3500 trucks.",
      // b1 — icons-text (title + desc + icons)
      'Why It Lasts Longer',
      "Premium electrostatic E-coat, sealed bearing, and OEM-spec geometry — engineered to outlast the competition.",
      'e-coat', 'corrosion resistant', 'sealed bearing', 'direct fit',
      // c1 — 5050-right
      'E-Coat Rust Protection',
      "Our premium electrostatic coating creates a uniform barrier against road salt, moisture, and corrosion — far outlasting bare uncoated alternatives.",
      // d1 — 5050-left
      'Fits 2011–2019 Duramax Trucks',
      "Compatible with Chevrolet Silverado and GMC Sierra 2500/3500 RWD/SRW configurations. Direct OEM replacement — no modifications required.",
      // e1 — 5050-right
      'Built for the Long Haul',
      "Heavy-duty bearing construction rated for loaded towing and the demands of a daily work truck.",
      // g1 — gallery-hero
      'Premium E-Coated Hub Assembly',
      "Precision-engineered for 2011–2019 Duramax RWD/SRW. E-coat protection, sealed bearing, direct OEM fit.",
      // g2 — gallery-icons-text (title + desc + icons)
      'Built to Last',
      "Heavy-duty bearing rated for loaded towing. Corrosion-resistant coating outlasts bare alternatives.",
      'e-coat', 'sealed bearing', 'direct fit', 'OEM spec',
    ],
    [
      'DETAIL5',
      "Doc's Diesel The Diesel Detail Kit",
      // a1
      'Pro-Level Clean in One Kit',
      "Everything you need to bring your diesel truck back to showroom condition — no guessing, no missing pieces. Every product chosen to work together.",
      // b1 — icons-text
      "What's Inside",
      "A complete, curated set of diesel-specific formulas — each one chosen to tackle the grime, residue, and staining that diesel engines produce.",
      'wash', 'degrease', 'polish', 'protect',
      // c1
      'Formulated for Diesel',
      "Diesel engines leave DEF residue, exhaust staining, and heavy road grime. This kit targets all of it with formulas built specifically for the job.",
      // d1
      'Shop-Tested, Road-Proven',
      "The same products used in Doc's Diesel's own service bays — trusted by the technicians who work on Duramax, Cummins, and Powerstroke trucks every day.",
      // e1
      'Truck Pride, Simplified',
      "A clean truck runs better, sells better, and feels better. Full detail start to finish in under two hours.",
      // g1
      "The Diesel Detail Kit",
      "Pro-level clean in one box. Every product chosen to work together on Duramax, Cummins, and Powerstroke trucks.",
      // g2 — gallery-icons-text
      'Formulated for Diesel',
      "Targets DEF residue, exhaust staining, and heavy road grime — because diesel grime is different.",
      'wash', 'degrease', 'polish', 'protect',
    ],
    [
      'keeptruckinhoodie3XL',
      "Doc's Diesel Keep Truckin' Hoodie — 3XL",
      // a1
      "Keep Truckin'",
      "Wear the brand that knows diesel. Premium fleece hoodie from Doc's Diesel — built for the shop, comfortable enough for everywhere else.",
      // b1 — icons-text
      'Built Different',
      "Heavy-duty fleece construction with reinforced stitching — made for long days in the shop and cold mornings on the job site.",
      'soft fleece', 'durable stitching', 'preshrunk cotton', 'true to size',
      // c1
      'Heavy-Duty Comfort',
      "Premium cotton-blend fleece holds up to long shifts in the shop while keeping you warm on the coldest job sites.",
      // d1
      'Represent the Brand',
      "Officially designed and sold by Doc's Diesel — the diesel specialists trusted by Duramax, Cummins, and Powerstroke owners across the country.",
      // e1
      'Available in All Sizes',
      "From S to 3XL, the Keep Truckin' hoodie fits every member of the crew.",
      // g1
      "Keep Truckin' Hoodie",
      "Premium cotton-blend fleece. Built for the shop, comfortable enough for everywhere else.",
      // g2 — gallery-icons-text
      'Represent the Brand',
      "Officially designed by Doc's Diesel — the diesel specialists trusted by Duramax, Cummins, and Powerstroke owners.",
      'soft fleece', 'durable stitching', 'preshrunk', 'true to size',
    ],
  ]

  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
  const csv = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = 'template-mode.csv'
  a.click()
  URL.revokeObjectURL(url)
}
