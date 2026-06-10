'use client'

import { useEffect, useRef, useState } from 'react'
import { downloadTemplate } from '@/lib/csv'

// ─── Section registry ──────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'd-csv',      label: 'CSV Format' },
  { id: 'd-template', label: 'Template Mode' },
  { id: 'd-bulk',     label: 'Bulk Mode' },
  { id: 'd-export',   label: 'Export' },
  { id: 'd-share',    label: 'Share & Collaborate' },
  { id: 'd-feedback', label: 'Feedback' },
]

// ─── Atoms ────────────────────────────────────────────────────────────────────

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-16 text-base font-bold text-gray-900 dark:text-white mb-1">
      {children}
    </h2>
  )
}

function Sub({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-bold uppercase tracking-widest text-accent-600 dark:text-accent-400 mt-7 mb-3 pb-1.5 border-b border-accent-100 dark:border-accent-900/40">
      {children}
    </h3>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] leading-relaxed text-gray-600 dark:text-gray-400 mb-3">{children}</p>
}

function C({ children }: { children: string }) {
  return (
    <code className="font-mono text-[11px] px-1.5 py-0.5 rounded border whitespace-nowrap bg-accent-50 dark:bg-gray-800 border-accent-100 dark:border-gray-700 text-accent-700 dark:text-accent-300">
      {children}
    </code>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 px-3 py-2.5 mb-3">
      <svg className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">{children}</p>
    </div>
  )
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg bg-accent-50 dark:bg-accent-900/20 border border-accent-200 dark:border-accent-800/40 px-3 py-2.5 mb-3">
      <svg className="w-3 h-3 text-accent-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="text-[11px] leading-relaxed text-accent-800 dark:text-accent-300">{children}</p>
    </div>
  )
}

function Steps({ items }: { items: { title: string; body: string }[] }) {
  return (
    <ol className="space-y-2.5 mb-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="w-4.5 h-4.5 min-w-[1.125rem] rounded-full bg-accent-600 dark:bg-accent-700 text-white text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">
            {i + 1}
          </span>
          <div>
            <p className="text-[12px] font-semibold text-gray-800 dark:text-gray-200 leading-none mb-0.5">{item.title}</p>
            <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">{item.body}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function DataTable({ headers, rows }: { headers: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-white/8 mb-3">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-900/80 border-b border-gray-200 dark:border-white/8">
            {headers.map(h => (
              <th key={h} className="text-left px-3 py-2 font-bold text-gray-600 dark:text-gray-400 text-[10px] uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i < rows.length - 1 ? 'border-b border-gray-100 dark:border-white/6' : ''}>
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-gray-600 dark:text-gray-400 align-top">
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
    <pre className="rounded-lg bg-gray-900 dark:bg-black text-gray-100 text-[10px] leading-relaxed p-3 overflow-x-auto mb-3 font-mono">
      {children}
    </pre>
  )
}

function Hr() {
  return <hr className="border-gray-100 dark:border-white/8 my-8" />
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
        className={`fixed inset-0 z-40 bg-black/60 dark:bg-black/80 backdrop-blur-sm ${closing ? 'animate-fade-out' : 'animate-fade-in'}`}
        onClick={onClose}
      />

      {/* Panel — centered with max-width */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center">
      <div
        className={`w-full max-w-[1400px] flex flex-col bg-white dark:bg-gray-950 rounded-t-[4px] shadow-[0_-8px_40px_rgba(0,0,0,0.18)] overflow-hidden ${
          closing ? 'animate-slide-down-full' : 'animate-slide-up-full'
        }`}
        style={{ height: 'calc(100vh - 3rem)' }}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3.5 border-b border-gray-200 dark:border-white/8 bg-white dark:bg-gray-950">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-accent-100 dark:bg-accent-900/50">
              <svg className="w-3.5 h-3.5 text-accent-600 dark:text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white leading-none">Docs</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">How to use Doc&rsquo;s Design Generator</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 dark:text-gray-600 hidden sm:block">Esc to close</span>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/8 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0">

          {/* Sidebar nav */}
          <aside className="hidden md:flex flex-col shrink-0 w-44 border-r border-gray-100 dark:border-white/6 py-5 px-3 bg-gray-50/60 dark:bg-gray-900/40">
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-600 mb-2 px-2">Contents</p>
            <nav className="space-y-0.5">
              {SECTIONS.map(s => (
                <button
                  key={s.id}
                  onClick={() => scrollTo(s.id)}
                  className={`w-full text-left px-2 py-1.5 rounded text-[11px] font-medium transition-colors ${
                    active === s.id
                      ? 'bg-accent-50 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300 font-semibold'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/6'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </nav>

            <div className="mt-auto pt-4 border-t border-gray-100 dark:border-white/6">
              <button
                onClick={downloadTemplate}
                className="w-full flex items-center gap-1.5 px-2 py-2 rounded text-[11px] font-semibold text-accent-600 dark:text-accent-400 hover:bg-accent-50 dark:hover:bg-accent-900/30 transition-colors"
              >
                <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17a9 9 0 1118 0H3z" />
                </svg>
                Download CSV template
              </button>
            </div>
          </aside>

          {/* Content */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 sm:px-8 py-6 pb-16">

            {/* ── CSV Format ─────────────────────────────────────── */}
            <H id="d-csv">CSV Format</H>
            <p className="text-[12px] text-gray-400 dark:text-gray-500 mb-5">Structure your spreadsheet so Template Mode can auto-generate all designs.</p>

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
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">A+ Layouts (1464 × 600)</p>
                <div className="space-y-1.5">
                  {[
                    { l: 'Img | Txt', d: 'Photo left, text right (default).' },
                    { l: 'Txt | Img', d: 'Text left, photo right.' },
                    { l: 'Icons',     d: 'Icon grid only, no description.' },
                    { l: 'Icn+Txt',  d: 'Icon callouts + headline + description.' },
                  ].map(t => (
                    <div key={t.l} className="rounded border border-gray-100 dark:border-white/8 bg-gray-50 dark:bg-gray-900/60 px-2.5 py-2">
                      <p className="text-[11px] font-bold text-gray-800 dark:text-gray-200">{t.l}</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">{t.d}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">Gallery Layouts (1500 × 1500)</p>
                <div className="space-y-1.5">
                  {[
                    { l: 'Hero',     d: 'Headline and description over the product image.' },
                    { l: 'Icons',    d: 'Icon grid with callout labels.' },
                    { l: 'Icn+Txt', d: 'Icon grid plus a title and description.' },
                  ].map(t => (
                    <div key={t.l} className="rounded border border-gray-100 dark:border-white/8 bg-gray-50 dark:bg-gray-900/60 px-2.5 py-2">
                      <p className="text-[11px] font-bold text-gray-800 dark:text-gray-200">{t.l}</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">{t.d}</p>
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
            <ul className="space-y-2.5 mb-4">
              {[
                'Start from the template CSV — it includes sample data for all common slot types.',
                'Photos are auto-fetched from Canto by SKU — no photo columns needed unless you want a different image.',
                'CSV content is fully editable in the sidebar after upload. Tweak titles without re-uploading.',
                'The "Export Name" field in the sidebar overrides the product_name for file and folder naming.',
                'You can add or remove A+ and Gallery slots from the sidebar without touching the CSV.',
                'For icon callouts, assign icon images from Canto using the icon picker, then icon labels come from the CSV.',
              ].map((tip, i) => (
                <li key={i} className="flex gap-2.5">
                  <div className="w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-accent-100 dark:bg-accent-900/40">
                    <svg className="w-2 h-2 text-accent-600 dark:text-accent-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <p className="text-[12px] leading-relaxed text-gray-600 dark:text-gray-400">{tip}</p>
                </li>
              ))}
            </ul>

            {/* Download button (mobile — sidebar not visible) */}
            <button
              onClick={downloadTemplate}
              className="md:hidden w-full flex items-center justify-center gap-1.5 h-9 rounded-lg border border-accent-200 dark:border-accent-800 text-[12px] font-semibold text-accent-600 dark:text-accent-400 hover:bg-accent-50 dark:hover:bg-accent-900/30 transition-colors mb-4"
            >
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17a9 9 0 1118 0H3z" />
              </svg>
              Download template CSV
            </button>

            <Hr />

            {/* ── Template Mode ──────────────────────────────────── */}
            <H id="d-template">Template Mode</H>
            <P>Configure the appearance and content of each design block before generating at scale.</P>

            <Sub>Asset slots</Sub>
            <P>Asset slots are placeholders that get filled with real content during bulk generation. In Template Mode, assign a default asset (e.g. a Canto photo) to each slot. During generation, slot values are overridden per-row from the CSV where available.</P>
            <DataTable
              headers={['Slot', 'What to assign']}
              rows={[
                ['Product Photo', 'Main product image. Auto-fetched from Canto by SKU if left empty.'],
                ['Background Texture', 'Optional texture overlay for the slide background.'],
                ['Brand Logo', 'Pre-configured from Canto. Override per-block if needed.'],
                ['Icon 1 – 4', 'Feature icons from the Canto icon library. Labels come from CSV.'],
              ]}
            />

            <Sub>Per-block settings</Sub>
            <P>Click any block on the canvas to select it. The sidebar shows all configuration options for that block. Changes are independent per block — editing one does not affect others.</P>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {[
                { icon: '🎨', t: 'Colors', d: 'Background, text, accent, overlay opacity' },
                { icon: '🅰️', t: 'Typography', d: 'Title/subtitle text, weight, size multiplier' },
                { icon: '↔️', t: 'Image composition', d: 'Scale, horizontal and vertical pan' },
                { icon: '📐', t: 'Spacing', d: 'Padding and gap controls' },
              ].map(c => (
                <div key={c.t} className="rounded border border-gray-100 dark:border-white/8 bg-gray-50 dark:bg-gray-900/60 px-3 py-2.5 flex gap-2">
                  <span className="text-sm shrink-0">{c.icon}</span>
                  <div>
                    <p className="text-[11px] font-bold text-gray-800 dark:text-gray-200">{c.t}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-500">{c.d}</p>
                  </div>
                </div>
              ))}
            </div>

            <Note>Directly uploaded files (drag-and-drop from disk) are temporary and will not appear on share links or other devices. Use Canto for images that need to persist.</Note>

            <Hr />

            {/* ── Bulk Mode ──────────────────────────────────────── */}
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

            {/* ── Export ─────────────────────────────────────────── */}
            <H id="d-export">Export</H>
            <P>Download finished designs as high-resolution PNG files, individually or as a batch ZIP.</P>

            <Sub>Dimensions reference</Sub>
            <DataTable
              headers={['Template', 'Desktop', 'Mobile']}
              rows={[
                ['A+ Content (5050, Icons Grid)', '1464 × 600 px', '600 × 450 px'],
                ['Gallery (Hero, Icons)', '1500 × 1500 px', '600 × 600 px'],
              ]}
            />
            <Tip>Mobile variants are generated automatically alongside every desktop block — you do not need to create them separately.</Tip>

            <Hr />

            {/* ── Share & Collaborate ────────────────────────────── */}
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

            {/* ── Feedback & Approvals ───────────────────────────── */}
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
                ['Approved',           'All voters on this block have voted Approved'],
                ['Changes Requested',  'At least one voter has requested changes'],
                ['Pending',            'Some voters have not yet voted'],
              ]}
            />

          </div>
        </div>
      </div>
      </div>
    </>
  )
}
