'use client'

import { useEffect, useRef, useState } from 'react'
import { downloadTemplate } from '@/lib/csv'

// ─── Section registry ──────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'd-csv',      label: 'CSV Format' },
  { id: 'd-template', label: 'Template Mode' },
  { id: 'd-bulk',     label: 'Bulk Mode' },
  { id: 'd-export',   label: 'Export' },
  { id: 'd-canto',    label: 'Canto Integration' },
  { id: 'd-projects', label: 'Projects' },
  { id: 'd-share',    label: 'Share & Collaborate' },
  { id: 'd-feedback', label: 'Feedback' },
]

// ─── Atoms ────────────────────────────────────────────────────────────────────

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-8 text-[17px] font-bold text-gray-900 dark:text-white mb-1.5 tracking-tight">
      {children}
    </h2>
  )
}

function Sub({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mt-8 mb-3 pb-1.5 border-b border-gray-100 dark:border-gray-800">
      {children}
    </h3>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400 mb-3">{children}</p>
}

function C({ children }: { children: string }) {
  return (
    <code className="font-mono text-[11px] px-1.5 py-0.5 rounded-none border whitespace-nowrap bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300">
      {children}
    </code>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-none bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 px-3.5 py-3 mb-4">
      <svg className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <p className="text-[12px] leading-relaxed text-amber-800 dark:text-amber-300">{children}</p>
    </div>
  )
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-none bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 px-3.5 py-3 mb-4">
      <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="text-[12px] leading-relaxed text-gray-600 dark:text-gray-400">{children}</p>
    </div>
  )
}

function Steps({ items }: { items: { title: string; body: string }[] }) {
  return (
    <ol className="space-y-3 mb-4">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="w-[18px] h-[18px] min-w-[18px] bg-gray-900 dark:bg-gray-700 text-white text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
            {i + 1}
          </span>
          <div>
            <p className="text-[13px] font-semibold text-gray-800 dark:text-gray-200 leading-snug mb-0.5">{item.title}</p>
            <p className="text-[12px] leading-relaxed text-gray-500 dark:text-gray-400">{item.body}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function DataTable({ headers, rows }: { headers: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto rounded-none border border-gray-200 dark:border-gray-700 mb-4">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
            {headers.map(h => (
              <th key={h} className="text-left px-3 py-2 font-bold text-gray-500 dark:text-gray-400 text-[10px] uppercase tracking-widest">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i < rows.length - 1 ? 'border-b border-gray-100 dark:border-gray-800' : ''}>
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2.5 text-gray-600 dark:text-gray-400 align-top leading-relaxed">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="rounded-none bg-gray-950 dark:bg-black text-gray-300 text-[11px] leading-relaxed p-4 overflow-x-auto mb-4 font-mono border border-gray-800">
      {children}
    </pre>
  )
}

function Hr() {
  return <hr className="border-gray-100 dark:border-gray-800 my-10" />
}

// ─── DocsDrawer ───────────────────────────────────────────────────────────────

interface DocsDrawerProps {
  open: boolean
  onClose: () => void
}

export default function DocsDrawer({ open, onClose }: DocsDrawerProps) {
  const [mounted, setMounted] = useState(false)
  const [closing, setClosing] = useState(false)
  const [active, setActive] = useState('d-csv')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) { setMounted(true); setClosing(false) }
    else if (mounted) {
      setClosing(true)
      const t = setTimeout(() => { setMounted(false); setClosing(false) }, 300)
      return () => clearTimeout(t)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  // Scrollspy
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(e => { if (e.isIntersecting) setActive(e.target.id) })
      },
      { root: container, rootMargin: '-10% 0px -80% 0px' },
    )
    SECTIONS.forEach(s => {
      const el = container.querySelector(`#${s.id}`)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [mounted])

  if (!mounted) return null

  const scrollTo = (id: string) => {
    const el = scrollRef.current?.querySelector(`#${id}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/50 dark:bg-black/70 backdrop-blur-sm ${closing ? 'animate-fade-out' : 'animate-fade-in'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
        <div
          className={`pointer-events-auto w-full max-w-[1400px] flex flex-col bg-white dark:bg-gray-950 shadow-2xl ring-1 ring-black/8 dark:ring-white/6 overflow-hidden ${
            closing ? 'animate-slide-down-full' : 'animate-slide-up-full'
          }`}
          style={{ height: 'calc(100vh - 3rem)' }}
        >

          {/* ── Header ── */}
          <div className="shrink-0 flex items-center justify-between px-6 py-3.5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950">
            <div className="flex items-center gap-3">
              <svg className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span className="text-[13px] font-bold text-gray-900 dark:text-white">Docs</span>
              <span className="hidden sm:block w-px h-3.5 bg-gray-200 dark:bg-gray-700" />
              <span className="hidden sm:block text-[12px] text-gray-400 dark:text-gray-500">How to use Doc&rsquo;s Design Generator</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-gray-300 dark:text-gray-600 hidden sm:block">Esc</span>
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* ── Body ── */}
          <div className="flex flex-1 min-h-0">

            {/* Sidebar nav */}
            <aside className="hidden md:flex flex-col shrink-0 w-52 border-r border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950">
              <div className="flex-1 overflow-y-auto pt-6 pb-4">
                <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600 mb-2 px-5">Contents</p>
                <nav>
                  {SECTIONS.map(s => (
                    <button
                      key={s.id}
                      onClick={() => scrollTo(s.id)}
                      className={`w-full text-left px-5 py-2 text-[12px] border-l-2 transition-colors ${
                        active === s.id
                          ? 'border-gray-900 dark:border-white text-gray-900 dark:text-white font-semibold'
                          : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </nav>
              </div>

              <div className="shrink-0 px-4 py-4 border-t border-gray-100 dark:border-gray-800">
                <button
                  onClick={() => downloadTemplate()}
                  className="w-full flex items-center justify-center gap-1.5 h-8 border border-gray-200 dark:border-gray-700 text-[11px] font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                >
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  CSV Template
                </button>
              </div>
            </aside>

            {/* Content */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto">
              <div className="max-w-2xl px-8 sm:px-12 py-8 pb-20">

                {/* ── CSV Format ── */}
                <H id="d-csv">CSV Format</H>
                <P>Structure your spreadsheet so Template Mode can auto-generate all designs.</P>

                <Sub>How it works</Sub>
                <Steps items={[
                  { title: 'Prepare your CSV', body: 'Fill in product data using the column structure below. Each row is one product. Download the template CSV to get started.' },
                  { title: 'Upload & configure', body: 'Drag-drop your CSV or click to browse. Product photos are auto-fetched from Canto by SKU. Edit any text directly in the sidebar.' },
                  { title: 'Export', body: 'Click Export All in the toolbar. Designs render and download as a ZIP — one folder per product, named by product name.' },
                ]} />

                <Sub>Required columns</Sub>
                <DataTable
                  headers={['Column', 'Description']}
                  rows={[
                    [<C key="sku">sku</C>, 'Unique product identifier. Used as the export folder name and file prefix.'],
                    [<C key="pn">product_name</C>, 'Full product name. Shown in the sidebar and used in export filenames.'],
                  ]}
                />

                <Sub>A+ Content slots</Sub>
                <P>Each letter (a, b, c…) defines one A+ slide. A slot is created for every letter with a non-empty <C>_title</C> column. The tool stops at the first blank title — later letters are skipped.</P>
                <DataTable
                  headers={['Column', 'What it does']}
                  rows={[
                    [<C key="a1t">a1_title</C>, 'Slide headline. Required for the slot to be created.'],
                    [<C key="a1d">a1_desc</C>, 'Body text / description paragraph.'],
                    [<C key="a1i">a1_icon1 – a1_icon4</C>, 'Icon callout labels. Filling any of these auto-switches the layout to icon+text.'],
                    [<C key="b1">b1_title, b1_desc, …</C>, 'Repeat the same pattern for slides b, c, d, e, f, g, h (up to 8 A+ slides).'],
                  ]}
                />
                <Tip>Slots support letters a → h, giving up to 8 A+ Content slides per product. Stop filling columns at any letter to truncate that product&rsquo;s slides.</Tip>

                <Sub>Gallery slides</Sub>
                <P>Gallery slides use the <C>g</C> prefix. Up to 20 slides per product, stopping at the first blank title.</P>
                <DataTable
                  headers={['Column', 'What it does']}
                  rows={[
                    [<C key="g1t">g1_title</C>, 'Gallery slide headline.'],
                    [<C key="g1d">g1_desc</C>, 'Gallery slide description text.'],
                    [<C key="g1i">g1_icon1 – g1_icon4</C>, 'Icon callout labels for icon-layout gallery slides.'],
                    [<C key="g2">g2_title, g2_desc, …</C>, 'Repeat for each additional gallery slide (g2, g3, g4… up to g20).'],
                  ]}
                />

                <Sub>Layout types</Sub>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">A+ Layouts (1464 × 600)</p>
                    <div className="space-y-1.5">
                      {[
                        { l: 'Img | Txt', d: 'Photo left, text right (default).' },
                        { l: 'Txt | Img', d: 'Text left, photo right.' },
                        { l: 'Icons',     d: 'Icon grid only, no description.' },
                        { l: 'Icn+Txt',  d: 'Icon callouts + headline + description.' },
                      ].map(t => (
                        <div key={t.l} className="border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60 px-3 py-2">
                          <p className="text-[12px] font-semibold text-gray-800 dark:text-gray-200">{t.l}</p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-0.5">{t.d}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2">Gallery Layouts (1500 × 1500)</p>
                    <div className="space-y-1.5">
                      {[
                        { l: 'Hero',     d: 'Headline and description over the product image.' },
                        { l: 'Icons',    d: 'Icon grid with callout labels.' },
                        { l: 'Icn+Txt', d: 'Icon grid plus a title and description.' },
                      ].map(t => (
                        <div key={t.l} className="border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60 px-3 py-2">
                          <p className="text-[12px] font-semibold text-gray-800 dark:text-gray-200">{t.l}</p>
                          <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-0.5">{t.d}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <Sub>Example CSV</Sub>
                <CodeBlock>{`sku,product_name,a1_title,a1_desc,a1_icon1,a1_icon2,a1_icon3,a1_icon4,g1_title,g1_desc
TW-001,Heavy Duty Tow Strap,Built to Last,"3\" wide × 30ft — 30,000 lb break strength",E-coat,Corrosion resistant,Sealed bearing,Direct fit,Premium Quality,Engineered to outlast the competition
SB-002,Recovery Snatch Block,Maximum Pull,Rated for 8000 lb working load,High strength,Swivel hook,Anti-corrosion,Easy rig,,`}</CodeBlock>

                <Sub>Tips</Sub>
                <ul className="space-y-3 mb-4">
                  {[
                    'Start from the template CSV — it includes sample data for all common slot types.',
                    'Photos are auto-fetched from Canto by SKU — no photo columns needed unless you want a different image.',
                    'CSV content is fully editable in the sidebar after upload. Tweak titles without re-uploading.',
                    'The "Export Name" field in the sidebar overrides the product_name for file and folder naming.',
                    'You can add or remove A+ and Gallery slots from the sidebar without touching the CSV.',
                    'For icon callouts, assign icon images from Canto using the icon picker, then icon labels come from the CSV.',
                  ].map((tip, i) => (
                    <li key={i} className="flex gap-3">
                      <div className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600 shrink-0 mt-2" />
                      <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400">{tip}</p>
                    </li>
                  ))}
                </ul>

                {/* Download button (mobile) */}
                <button
                  onClick={() => downloadTemplate()}
                  className="md:hidden w-full flex items-center justify-center gap-1.5 h-9 border border-gray-200 dark:border-gray-700 text-[12px] font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors mb-4"
                >
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download template CSV
                </button>

                <Hr />

                {/* ── Template Mode ── */}
                <H id="d-template">Template Mode</H>
                <P>Configure the appearance and content of each design block, then generate at scale from a CSV. Template Mode is the primary workflow for batch production.</P>

                <Sub>Slot groups</Sub>
                <P>Each design block is a <em>slot group</em> — a named set of desktop + mobile frames that render together. Slot groups correspond to your CSV columns: A1 is the first A+ slide, B1 the second, G1 the first gallery slide, and so on. The Export dropdown's slot picker lets you select exactly which groups to render or upload.</P>
                <DataTable
                  headers={['Prefix', 'Type', 'Format']}
                  rows={[
                    ['A1 – H1', 'A+ Content slide', '1464 × 600 (desktop) + 600 × 450 (mobile)'],
                    ['G1 – G20', 'Gallery hero / icon slide', '1500 × 1500 (desktop) + 600 × 600 (mobile)'],
                    ['SG1 –',    'Square gallery variant', 'Same as gallery, alternate layout'],
                  ]}
                />

                <Sub>Asset slots</Sub>
                <P>Asset slots are placeholders filled with real content during generation. Assign defaults in Template Mode — they apply to every product unless overridden by Canto's per-SKU photo fetch.</P>
                <DataTable
                  headers={['Slot', 'What to assign', 'Source']}
                  rows={[
                    ['Product Photo',      'Main product image.',               'Auto-fetched from Canto by SKU, or upload manually.'],
                    ['Background Texture', 'Optional texture overlay.',          'Upload from disk or pick from Canto.'],
                    ['Brand Logo',         'DocsDiesel logo, pre-configured.',   'Loaded from Canto automatically. Override per-block.'],
                    ['Icon 1 – 4',         'Feature icons with callout labels.', 'Canto icon library picker. Labels come from CSV.'],
                  ]}
                />

                <Sub>Per-block settings</Sub>
                <P>Click any block on the canvas to select it. The sidebar shows all configuration for that block. Changes are independent per block — editing one does not affect others.</P>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {[
                    { t: 'Colors',      d: 'Background, text, accent, overlay opacity' },
                    { t: 'Typography',  d: 'Title/subtitle text, weight, size multiplier' },
                    { t: 'Composition', d: 'Product photo scale, horizontal and vertical pan' },
                    { t: 'Spacing',     d: 'Padding, gap, and logo placement controls' },
                    { t: 'Flip layout', d: 'Mirror image-left / text-right arrangement' },
                    { t: 'Text edit',   d: 'Edit title and body copy directly in the sidebar' },
                  ].map(c => (
                    <div key={c.t} className="border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60 px-3 py-2.5">
                      <p className="text-[12px] font-semibold text-gray-800 dark:text-gray-200 mb-0.5">{c.t}</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-500 leading-relaxed">{c.d}</p>
                    </div>
                  ))}
                </div>

                <Sub>Rendering</Sub>
                <P>Designs render in the background when you navigate between products. The Export button shows a spinner while rendering is in progress. Wait for rendering to finish before exporting — the button disables automatically while busy.</P>
                <Tip>Use "Export Current Product" to quickly check a single product before committing to a full batch export.</Tip>
                <Note>Directly uploaded files (drag-and-drop from disk) are session-only and won't appear on share links or other devices. Use Canto for assets that need to persist across sessions.</Note>

                <Hr />

                {/* ── Bulk Mode ── */}
                <H id="d-bulk">Bulk Mode</H>
                <P>Generate a complete set of designs for every product in your catalog from a single CSV file.</P>

                <Sub>Workflow</Sub>
                <Steps items={[
                  { title: 'Upload your CSV', body: 'Click "Import CSV" in Bulk Mode and select your file. The tool parses it and shows a preview grid.' },
                  { title: 'Review the preview', body: 'Each row renders a thumbnail using your template configuration. Check that text and images look correct.' },
                  { title: 'Generate all', body: 'Click "Generate All" to render every design at full resolution. Progress is shown per product.' },
                  { title: 'Export', body: 'Download individual designs or the entire batch as a ZIP.' },
                ]} />

                <Hr />

                {/* ── Export ── */}
                <H id="d-export">Export</H>
                <P>Download finished designs as high-resolution PNG files, or upload them directly to Canto. All options are in the Export dropdown in the toolbar.</P>

                <Sub>Export options</Sub>
                <DataTable
                  headers={['Option', 'What it does']}
                  rows={[
                    ['Export All ZIP', 'Renders every product × every slot at full resolution and bundles them into a ZIP. Files are named by product and slot.'],
                    ['Export Current Product', 'Renders only the currently selected product — all its slots — as a ZIP.'],
                    ['Select Slots → Export N', 'Choose specific slot groups (A1, B1, SG1 …) using the chip picker, then export only those slots across all products.'],
                    ['Save All to Canto', 'Renders all products × all slots and uploads them directly to a Canto album you choose. Requires Canto to be connected.'],
                    ['Save Current to Canto', 'Renders the current product\'s slots and uploads them to Canto.'],
                  ]}
                />

                <Sub>Slot selection</Sub>
                <P>The <strong>Select Slots</strong> picker appears in the Export dropdown when Template Mode has slot groups. Click individual chips to toggle them, or use <strong>All / None</strong> to select everything at once. The export button shows how many slots are selected.</P>
                <Tip>Slot labels match the CSV columns: A1 = first A+ slide, B1 = second A+ slide, G1 = first gallery slide, SG1 = first gallery slide at square format, and so on.</Tip>

                <Sub>Dimensions reference</Sub>
                <DataTable
                  headers={['Template', 'Desktop', 'Mobile']}
                  rows={[
                    ['A+ Content (5050, Icons Grid)', '1464 × 600 px', '600 × 450 px'],
                    ['Gallery (Hero, Icons)', '1500 × 1500 px', '600 × 600 px'],
                  ]}
                />
                <Tip>Mobile variants are generated automatically alongside every desktop block — you do not need to create them separately.</Tip>
                <Note>Export renders designs at their native resolution regardless of the canvas zoom level. What you see is what you get.</Note>

                <Hr />

                {/* ── Canto Integration ── */}
                <H id="d-canto">Canto Integration</H>
                <P>Doc's Design Generator connects directly to the Canto DAM. Once linked, Canto powers product photo fetching, icon and background asset pickers, and one-click upload of finished designs.</P>

                <Sub>Connecting your account</Sub>
                <Steps items={[
                  { title: 'Open the Export dropdown', body: 'Click the Export button in the top-right toolbar.' },
                  { title: 'Click "Connect Canto"', body: 'The button appears at the bottom of the dropdown when no account is linked.' },
                  { title: 'Sign in via Canto OAuth', body: 'A Canto login page opens. Sign in with your Canto account and approve access. You are redirected back automatically.' },
                  { title: 'Connected', body: 'The button is replaced by "Save All to Canto" and "Save Current to Canto". Your session stays active — you won\'t need to log in again unless you disconnect.' },
                ]} />
                <Tip>Click "Disconnect Canto" at the bottom of the Export dropdown at any time to unlink your account.</Tip>

                <Sub>Product photos</Sub>
                <P>When Template Mode loads a product row from the CSV, it automatically searches Canto for an asset matching the row's <C>sku</C> value. The first match becomes the product photo for that slot. No photo columns are needed in the CSV.</P>
                <Note>Photo fetching requires a Canto Client Credentials token configured in the environment. This is separate from the per-user OAuth login used for uploads — contact your admin if photos are not auto-loading.</Note>

                <Sub>Icon library</Sub>
                <P>Icon slots (1–4 per slide) can be filled from the Canto icon library. Click any icon slot placeholder on the canvas or in the sidebar to open the Canto Icon Picker. Search by name or browse, then click an icon to assign it. Icons are stored per-slot and persist across products.</P>

                <Sub>Background photos</Sub>
                <P>The background photo slot on any slide can also be sourced from Canto. Click the background slot in the sidebar to open the Canto Photo Picker and search your library.</P>

                <Sub>Save to Canto</Sub>
                <P>After designs are rendered you can upload them directly to Canto instead of (or in addition to) downloading a ZIP.</P>
                <Steps items={[
                  { title: 'Choose an export scope', body: 'Use "Save All to Canto" (all products) or "Save Current to Canto" (current product only) from the Export dropdown.' },
                  { title: 'Select a destination album', body: 'A dialog opens. Search your Canto albums by name — each album shows its name and parent folder path. Click one to select it.' },
                  { title: 'Optional metadata', body: 'Expand "Optional metadata" to add Tags, Keywords, or a Description applied to all uploaded files.' },
                  { title: 'Upload', body: 'Click Upload. Files transfer one at a time with a live progress indicator. Files are named exactly as they appear in the export (product name + slot).' },
                ]} />
                <Tip>You can also use the Slot picker in the Export dropdown to select specific slots, then "Save All to Canto" — only the selected slots will be uploaded.</Tip>

                <Hr />

                {/* ── Projects ── */}
                <H id="d-projects">Projects</H>
                <P>Each project stores an independent set of template settings, uploaded assets, and CSV content. Use projects to keep different brands, campaigns, or product lines separate.</P>

                <Sub>Managing projects</Sub>
                <DataTable
                  headers={['Action', 'How']}
                  rows={[
                    ['Create a project', 'Click the Doc\'s logo in the top-left to open the Dashboard, then "New project".'],
                    ['Switch projects',  'Open the Dashboard and click any project card.'],
                    ['Rename a project', 'Click the project name at the top of the workspace to edit it inline.'],
                    ['Thumbnails',       'A thumbnail is auto-generated when you navigate away or after a short idle period.'],
                  ]}
                />
                <Note>Projects auto-save continuously while you work. There is no manual Save button — changes are persisted within seconds.</Note>

                <Hr />

                {/* ── Share & Collaborate ── */}
                <H id="d-share">Share & Collaborate</H>
                <P>Send a public link so clients or teammates can review designs — no account required on their end.</P>

                <Sub>Access levels</Sub>
                <DataTable
                  headers={['Level', 'Can view', 'Can comment & vote', 'Can edit']}
                  rows={[
                    ['View Only', '✓', '✓', '✗'],
                    ['Can Edit',  '✓', '✓', '✓'],
                  ]}
                />

                <Sub>Real-time updates</Sub>
                <P>When you save changes in the editor, they broadcast to all open share-link tabs within seconds. The share page also polls the server every 30 seconds as a fallback. Live presence avatars show who else has the link open.</P>

                <Hr />

                {/* ── Feedback & Approvals ── */}
                <H id="d-feedback">Feedback & Approvals</H>
                <P>A structured review workflow built into the share page — no external tools needed.</P>

                <Sub>Reviewer workflow</Sub>
                <Steps items={[
                  { title: 'Enter your name', body: 'The share page prompts for a display name. This appears on all your comments and votes.' },
                  { title: 'Click a block to select it', body: 'A highlight ring appears and the feedback panel opens on the right.' },
                  { title: 'Leave a comment', body: 'Type feedback and press Enter. Comments are tied to the specific block you selected.' },
                  { title: 'Vote on approval', body: 'Use Approve or Request Changes to record your vote for that block.' },
                ]} />

                <Sub>Approval status</Sub>
                <DataTable
                  headers={['Status', 'Meaning']}
                  rows={[
                    ['Approved',          'All voters on this block have voted Approved'],
                    ['Changes Requested', 'At least one voter has requested changes'],
                    ['Pending',           'Some voters have not yet voted'],
                  ]}
                />

              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
