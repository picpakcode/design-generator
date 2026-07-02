'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

// ─── Section registry ──────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'getting-started',  label: 'Getting Started' },
  { id: 'workspace',        label: 'Workspace Overview' },
  { id: 'template-mode',    label: 'Template Mode' },
  { id: 'bulk-mode',        label: 'Bulk Mode' },
  { id: 'assets',           label: 'Assets' },
  { id: 'export',           label: 'Export' },
  { id: 'share',            label: 'Share & Collaborate' },
  { id: 'feedback',         label: 'Feedback & Approvals' },
  { id: 'storage',          label: 'What Gets Stored' },
]

// ─── Small atoms ──────────────────────────────────────────────────────────────

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="scroll-mt-20 text-lg font-bold text-gray-900 dark:text-white mb-1"
    >
      {children}
    </h2>
  )
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-bold uppercase tracking-widest text-accent-600 dark:text-accent-400 mt-8 mb-3 pb-2 border-b border-accent-100 dark:border-accent-900/40">
      {children}
    </h3>
  )
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] leading-relaxed text-gray-600 dark:text-gray-400 mb-3">{children}</p>
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-none bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 px-4 py-3 mb-4">
      <svg className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <p className="text-[12px] leading-relaxed text-amber-800 dark:text-amber-300">{children}</p>
    </div>
  )
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-none bg-accent-50 dark:bg-accent-900/20 border border-accent-200 dark:border-accent-800/40 px-4 py-3 mb-4">
      <svg className="w-3.5 h-3.5 text-accent-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="text-[12px] leading-relaxed text-accent-800 dark:text-accent-300">{children}</p>
    </div>
  )
}

function Steps({ items }: { items: { title: string; body: string }[] }) {
  return (
    <ol className="space-y-3 mb-4">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span className="w-5 h-5 rounded-full bg-gray-900 dark:bg-gray-700 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
            {i + 1}
          </span>
          <div>
            <p className="text-[13px] font-semibold text-gray-900 dark:text-white leading-none mb-0.5">{item.title}</p>
            <p className="text-[12px] leading-relaxed text-gray-500 dark:text-gray-400">{item.body}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function Cards({ items }: { items: { icon: string; title: string; body: string; color?: string }[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
      {items.map(item => (
        <div key={item.title} className="rounded-none border border-gray-100 dark:border-white/8 bg-gray-50 dark:bg-gray-900 px-4 py-3 flex gap-3">
          <span className="text-base shrink-0 mt-0.5">{item.icon}</span>
          <div>
            <p className="text-[12px] font-bold text-gray-900 dark:text-white mb-0.5">{item.title}</p>
            <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">{item.body}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-none border border-gray-200 dark:border-white/8 mb-4">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-white/8">
            {headers.map(h => (
              <th key={h} className="text-left px-3 py-2 font-bold text-gray-700 dark:text-gray-300 text-[11px] uppercase tracking-wide">
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

function Code({ children }: { children: string }) {
  return (
    <pre className="rounded-none bg-gray-900 dark:bg-black text-gray-100 text-[11px] leading-relaxed p-4 overflow-x-auto mb-4 font-mono">
      {children}
    </pre>
  )
}

function Divider() {
  return <hr className="border-gray-100 dark:border-white/8 my-10" />
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocsPage() {
  const [active, setActive] = useState('getting-started')

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) setActive(e.target.id)
        })
      },
      { rootMargin: '-10% 0px -82% 0px' },
    )
    SECTIONS.forEach(s => {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [])

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 dark:bg-gray-950">

      {/* ── Top nav ───────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center gap-3">
        <Link href="/dashboard" className="flex items-center gap-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-[11px] font-semibold">Dashboard</span>
        </Link>
        <span className="w-px h-4 bg-gray-200 dark:bg-gray-700" />
        <img src="/Favicon.png" alt="" className="w-5 h-5 rounded-none object-contain shrink-0" />
        <span className="font-bold text-gray-900 dark:text-white text-sm tracking-tight">Docs</span>
        <span className="ml-1 shrink-0 px-1.5 py-0.5 rounded-none text-[9px] font-bold uppercase tracking-widest bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700">Beta</span>
      </header>

      <div className="flex flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6">

        {/* ── Sidebar ───────────────────────────────────────────────────── */}
        <aside className="hidden md:flex flex-col shrink-0 w-48 pt-8 pr-6">
          <nav className="sticky top-20">
            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-3 px-2">Contents</p>
            <ul className="space-y-0.5">
              {SECTIONS.map(s => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className={`block px-2 py-1.5 rounded-none text-[12px] font-medium transition-colors ${
                      active === s.id
                        ? 'bg-accent-50 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300 font-semibold'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                    onClick={e => {
                      e.preventDefault()
                      document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' })
                    }}
                  >
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        {/* ── Main content ──────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 py-8 pb-24">

          {/* ─── Getting Started ─────────────────────────────────────────── */}
          <SectionHeading id="getting-started">Getting Started</SectionHeading>
          <p className="text-[13px] text-gray-500 dark:text-gray-500 mb-6">Everything you need to go from sign-up to your first exported design.</p>

          <SubHeading>Sign in</SubHeading>
          <P>Open the app and click <strong className="text-gray-800 dark:text-gray-200">Sign in</strong> in the top-right corner of the dashboard. You can use email/password or an OAuth provider. Your account syncs all projects to the cloud automatically.</P>

          <SubHeading>Create a project</SubHeading>
          <Steps items={[
            { title: 'Click "New Project"', body: 'From the dashboard, hit the blue "+ New Project" button in the top-right. A blank project is created immediately and you are taken to the workspace.' },
            { title: 'Name your project', body: 'Click the project name in the header (defaults to "Untitled") to rename it. Names help you identify projects on the dashboard.' },
            { title: 'Choose a mode', body: 'The workspace has three modes accessible from the top tab bar: Design, Template, and Bulk. Start with Template Mode to configure your designs, then use Bulk Mode to generate them at scale.' },
          ]} />

          <SubHeading>Quick-start path</SubHeading>
          <Cards items={[
            { icon: '📐', title: 'Template Mode', body: 'Configure how each design block looks — pick images, set colors, edit text.' },
            { icon: '📋', title: 'Bulk Mode', body: 'Upload a CSV of products and generate all designs in one go.' },
            { icon: '📤', title: 'Export', body: 'Download any block as PNG, or the entire project as a ZIP.' },
            { icon: '🔗', title: 'Share', body: 'Generate a public link so reviewers can comment and approve.' },
          ]} />

          <Divider />

          {/* ─── Workspace Overview ──────────────────────────────────────── */}
          <SectionHeading id="workspace">Workspace Overview</SectionHeading>
          <p className="text-[13px] text-gray-500 dark:text-gray-500 mb-6">The workspace is divided into three distinct modes, each serving a different step in the design workflow.</p>

          <SubHeading>Three modes</SubHeading>
          <Table
            headers={['Mode', 'Purpose', 'When to use']}
            rows={[
              ['Design Mode', 'Visual editor for individual blocks — typography, colors, photo composition', 'Fine-tune a single design block after generating'],
              ['Template Mode', 'Configure asset slots, per-block settings, and default appearances', 'Set up your template before bulk generation'],
              ['Bulk Mode', 'Import a CSV and batch-generate designs for every product', 'Generate all listings at once from product data'],
            ]}
          />

          <SubHeading>Auto-save</SubHeading>
          <P>Every change you make is saved automatically. There is no manual save button. State is written to the database <strong className="text-gray-800 dark:text-gray-200">4 seconds</strong> after your last edit. If you switch projects or close the tab immediately after a change, that final change may not persist — give it a few seconds.</P>

          <Note>Directly uploaded files (drag-and-drop from disk) are stored as temporary blob URLs and are <strong>not</strong> synced to the cloud. Use the Canto asset picker for images that need to survive page reloads or appear on share links.</Note>

          <SubHeading>Header controls</SubHeading>
          <Table
            headers={['Control', 'Description']}
            rows={[
              ['Mode tabs', 'Switch between Design, Template, and Bulk modes'],
              ['Platform badge', 'Shows the current platform (Amazon). More platforms coming.'],
              ['Share button', 'Open the share link manager'],
              ['Presence avatars', 'Shows other users currently viewing the project via a share link'],
              ['Export button', 'Download the current block or all blocks'],
            ]}
          />

          <Divider />

          {/* ─── Template Mode ───────────────────────────────────────────── */}
          <SectionHeading id="template-mode">Template Mode</SectionHeading>
          <p className="text-[13px] text-gray-500 dark:text-gray-500 mb-6">Configure the appearance and content of each design block before generating at scale.</p>

          <SubHeading>Template types</SubHeading>
          <P>Each project can contain multiple blocks. Two categories are available, each with desktop and mobile variants generated automatically:</P>
          <Table
            headers={['Category', 'Template', 'Size (desktop)']}
            rows={[
              ['A+ Content', 'A+ 5050 — half image, half text layout', '1464 × 600 px'],
              ['A+ Content', 'A+ Icons Grid — product features with icon grid', '1464 × 600 px'],
              ['Gallery', 'Gallery Hero — full-bleed hero photo', '1500 × 1500 px'],
              ['Gallery', 'Gallery Icons — icon-based feature highlights', '1500 × 1500 px'],
            ]}
          />
          <Tip>Mobile variants (600 × 450 px for A+, 600 × 600 px for Gallery) are generated alongside every desktop block automatically — you do not need to create them separately.</Tip>

          <SubHeading>Configuring a block</SubHeading>
          <P>Click any block in the canvas to select it. The right-hand sidebar shows all configuration options for that block:</P>
          <Cards items={[
            { icon: '🎨', title: 'Colors', body: 'Background color, text color, accent color, and overlay opacity.' },
            { icon: '🖼️', title: 'Background photo', body: 'Pick from Canto photos, upload directly, or leave empty for a solid color background.' },
            { icon: '🔣', title: 'Icon slots', body: 'Assign icons to each feature slot from the Canto icon library.' },
            { icon: '🅰️', title: 'Typography', body: 'Title and subtitle text, font weight, and size multiplier.' },
            { icon: '↔️', title: 'Image composition', body: 'Scale, horizontal pan, and vertical pan to frame your photo precisely.' },
            { icon: '📐', title: 'Spacing', body: 'Padding and gap controls for layout adjustment.' },
          ]} />

          <SubHeading>Asset slots</SubHeading>
          <P>Asset slots are placeholders that get filled with real content during bulk generation. In Template Mode, you assign a <em>default</em> asset (e.g., a Canto photo) to each slot. When generating from CSV, slot values can be overridden per-row if your CSV includes asset columns.</P>

          <SubHeading>Per-block settings vs global settings</SubHeading>
          <P>Each block has independent settings. Changes to one block do not affect others. The sidebar context changes automatically as you click different blocks on the canvas.</P>

          <Divider />

          {/* ─── Bulk Mode ───────────────────────────────────────────────── */}
          <SectionHeading id="bulk-mode">Bulk Mode</SectionHeading>
          <p className="text-[13px] text-gray-500 dark:text-gray-500 mb-6">Generate a complete set of designs for every product in your catalog from a single CSV file.</p>

          <SubHeading>How it works</SubHeading>
          <Steps items={[
            { title: 'Prepare your CSV', body: 'Each row is one product. Required columns: product_name. Optional: sku, title, subtitle, and any asset overrides.' },
            { title: 'Upload the CSV', body: 'Click "Import CSV" in Bulk Mode and select your file. The tool parses it and shows a preview grid.' },
            { title: 'Review the preview', body: 'Each row renders a thumbnail using your template configuration. Check that text and images look correct.' },
            { title: 'Generate all', body: 'Click "Generate All" to render every design at full resolution. Progress is shown per block.' },
            { title: 'Export', body: 'Download individual designs or the entire batch as a ZIP.' },
          ]} />

          <SubHeading>CSV format</SubHeading>
          <P>The first row must be a header row. Column names are case-insensitive. Unrecognised columns are ignored.</P>
          <Table
            headers={['Column', 'Required', 'Description']}
            rows={[
              ['product_name', 'Yes', 'Display name of the product. Used as a fallback title.'],
              ['sku', 'No', 'Stock-keeping unit identifier. Shown on the design if a SKU slot is configured.'],
              ['title', 'No', 'Override the block title text for this row.'],
              ['subtitle', 'No', 'Override the block subtitle / description text for this row.'],
            ]}
          />
          <P>Example CSV:</P>
          <Code>{`product_name,sku,title,subtitle
Heavy Duty Tow Strap,TW-001,Built to Last,3" wide x 30ft — 30,000 lb break strength
Recovery Snatch Block,SB-002,Maximum Pull,Rated for 8,000 lb working load`}</Code>

          <Note>Text that contains commas must be wrapped in double quotes. Most spreadsheet apps (Excel, Google Sheets) handle this automatically when you export as CSV.</Note>

          <Divider />

          {/* ─── Assets ──────────────────────────────────────────────────── */}
          <SectionHeading id="assets">Assets</SectionHeading>
          <p className="text-[13px] text-gray-500 dark:text-gray-500 mb-6">Photos, icons, textures, and the logo are sourced from two places: the Canto DAM library and direct upload.</p>

          <SubHeading>Canto (brand library)</SubHeading>
          <P>Canto is the digital asset management platform where brand-approved photos, icons, and textures are stored. Any asset picked from Canto is referenced by URL and persists across sessions, devices, and share links.</P>
          <Steps items={[
            { title: 'Click a photo or icon slot', body: 'In the sidebar, any image field has a "Pick from Canto" button (or a camera/icon button on the canvas).' },
            { title: 'Browse or search', body: 'The Canto picker shows albums and a search bar. Type a keyword to filter assets.' },
            { title: 'Select an asset', body: 'Click an image to select it. It is applied to the slot immediately.' },
          ]} />
          <Tip>Assets are organised into albums in Canto (Product Photos, Icons, Textures, Logo). Ask your admin if you cannot find an expected asset — it may be in a different album.</Tip>

          <SubHeading>Direct upload</SubHeading>
          <P>You can drag a file from your desktop onto an image slot, or click the upload area to browse. Uploaded files appear immediately in the design.</P>
          <Note>Uploaded files are stored as <strong>temporary blob URLs</strong> in your browser. They are not saved to the cloud and will disappear on page reload or when viewed on another device or via a share link. Use Canto for any image that needs to be permanent.</Note>

          <SubHeading>Default logo</SubHeading>
          <P>A default brand logo is pre-configured in Canto. It appears automatically in templates that include a logo slot. You can override it per-block in the sidebar.</P>

          <Divider />

          {/* ─── Export ──────────────────────────────────────────────────── */}
          <SectionHeading id="export">Export</SectionHeading>
          <p className="text-[13px] text-gray-500 dark:text-gray-500 mb-6">Download finished designs as high-resolution PNG files, individually or as a batch ZIP.</p>

          <SubHeading>Export a single block</SubHeading>
          <Steps items={[
            { title: 'Select a block', body: 'Click the block on the canvas to make it active.' },
            { title: 'Click the Export button', body: 'Find the Export or Download button in the header or sidebar. The block renders at full resolution and downloads as PNG.' },
          ]} />

          <SubHeading>Export all blocks</SubHeading>
          <P>Click <strong className="text-gray-800 dark:text-gray-200">Export All</strong> (or the ZIP export option) to download every block in the project — including both desktop and mobile variants — as a single ZIP archive.</P>

          <SubHeading>Dimensions reference</SubHeading>
          <Table
            headers={['Template', 'Desktop', 'Mobile']}
            rows={[
              ['A+ Content (5050, Icons Grid)', '1464 × 600 px', '600 × 450 px'],
              ['Gallery (Hero, Icons)', '1500 × 1500 px', '600 × 600 px'],
            ]}
          />

          <Tip>Exports use PNG format at 1× device-pixel ratio. For print or very large displays, check that the output dimensions meet your platform's minimum requirements.</Tip>

          <Divider />

          {/* ─── Share & Collaborate ─────────────────────────────────────── */}
          <SectionHeading id="share">Share & Collaborate</SectionHeading>
          <p className="text-[13px] text-gray-500 dark:text-gray-500 mb-6">Send a public link to clients or teammates so they can review your designs — no account required on their end.</p>

          <SubHeading>Create a share link</SubHeading>
          <Steps items={[
            { title: 'Open the Share modal', body: 'Click the Share button in the workspace header. The modal shows any existing share links for this project.' },
            { title: 'Choose an access level', body: '"View Only" lets reviewers see designs and leave feedback but not edit. "Can Edit" gives full workspace access.' },
            { title: 'Copy the link', body: 'Click Copy to copy the share URL to your clipboard and send it to reviewers.' },
          ]} />

          <SubHeading>Access levels</SubHeading>
          <Table
            headers={['Level', 'Can view', 'Can comment & vote', 'Can edit design']}
            rows={[
              ['View Only', '✓', '✓', '✗'],
              ['Can Edit', '✓', '✓', '✓'],
            ]}
          />

          <SubHeading>Live presence</SubHeading>
          <P>When multiple people have the share link open simultaneously, avatar bubbles appear in the top-right corner of the share page. Each avatar shows the reviewer&rsquo;s initials (derived from the name they enter). The presence list updates in real time.</P>

          <SubHeading>Real-time design updates</SubHeading>
          <P>When the design owner saves changes in the editor, those changes broadcast to all open share-link tabs within seconds — no manual refresh needed. The share page also polls the server every 30 seconds as a fallback.</P>

          <Tip>Share links do not expire automatically. If you want to revoke access, delete the share link from the Share modal.</Tip>

          <Divider />

          {/* ─── Feedback & Approvals ────────────────────────────────────── */}
          <SectionHeading id="feedback">Feedback & Approvals</SectionHeading>
          <p className="text-[13px] text-gray-500 dark:text-gray-500 mb-6">A structured review workflow built into the share page — no external tools needed.</p>

          <SubHeading>Reviewer workflow</SubHeading>
          <Steps items={[
            { title: 'Enter your name', body: 'The share page prompts for a display name. This name appears on all your comments and votes.' },
            { title: 'Click a block to select it', body: 'Click any design block on the canvas. A highlight ring appears and the feedback panel opens on the right.' },
            { title: 'Leave a comment', body: 'Type your feedback in the comment field and press Enter or click Submit. Comments are tied to the specific block you selected.' },
            { title: 'Vote on approval', body: 'Use the Approve or Request Changes buttons to record your vote for that block.' },
            { title: 'React to comments', body: 'Hover over any comment and click a reaction emoji (👍 ❤️ 😄 👀 🎉) to acknowledge it.' },
          ]} />

          <SubHeading>Threaded replies</SubHeading>
          <P>The design owner (and other reviewers) can reply to any comment. Click <strong className="text-gray-800 dark:text-gray-200">Reply</strong> under a comment to add a threaded response. Replies are indented beneath the parent comment.</P>

          <SubHeading>Owner feedback panel</SubHeading>
          <P>Inside the workspace editor, the owner can open the <strong className="text-gray-800 dark:text-gray-200">Feedback</strong> panel to see all comments across all blocks in one place. Comments are grouped by block. From here the owner can:</P>
          <Cards items={[
            { icon: '↩️', title: 'Reply to comments', body: 'Write a response that reviewers will see on the share page.' },
            { icon: '✓', title: 'Resolve comments', body: 'Mark a thread as resolved. Resolved comments collapse and are hidden from reviewers by default.' },
            { icon: '👁️', title: 'See approval status', body: 'View each reviewer\'s latest vote (Approved / Changes Requested) per block.' },
            { icon: '🔔', title: 'Unread badge', body: 'A notification dot on the Feedback button indicates new activity since you last opened the panel.' },
          ]} />

          <SubHeading>Approval status</SubHeading>
          <P>Each reviewer casts one vote per block. Only their <em>most recent</em> vote counts. The owner sees an aggregated status badge on each canvas block showing the overall approval state:</P>
          <Table
            headers={['Status', 'Meaning']}
            rows={[
              ['Approved', 'All voters on this block have voted Approved'],
              ['Changes Requested', 'At least one voter has requested changes'],
              ['Pending', 'Some voters have not yet voted'],
              ['(no badge)', 'No votes have been cast for this block yet'],
            ]}
          />

          <Note>Comments refresh every 10 seconds on the share page. New comments from reviewers appear in the owner&rsquo;s Feedback panel automatically — no manual refresh needed.</Note>

          <Divider />

          {/* ─── What Gets Stored ────────────────────────────────────────── */}
          <SectionHeading id="storage">What Gets Stored</SectionHeading>
          <p className="text-[13px] text-gray-500 dark:text-gray-500 mb-6">Understanding what is and is not synced to the cloud helps avoid surprises.</p>

          <SubHeading>Synced to the cloud</SubHeading>
          <Table
            headers={['Data', 'Persists']}
            rows={[
              ['CSV product data (text, SKUs, names)', '✓ Yes'],
              ['Slide text & descriptions (edited in sidebar)', '✓ Yes'],
              ['Slot & gallery layout configuration', '✓ Yes'],
              ['Photos, icons, logo, texture from Canto', '✓ Yes (stored as URLs)'],
              ['Comments, replies, reactions, approvals', '✓ Yes'],
              ['Share link tokens', '✓ Yes'],
              ['Directly uploaded files (drag-drop from disk)', '✗ No — temporary'],
            ]}
          />

          <SubHeading>Directly uploaded files</SubHeading>
          <P>Images dragged from your disk are stored as <strong className="text-gray-800 dark:text-gray-200">blob URLs</strong> in the browser&rsquo;s memory. They are cached locally via IndexedDB so they survive page reloads on the same device and browser — but they do <em>not</em> sync to other devices and will not appear on share links viewed by others.</P>
          <P>To ensure images appear correctly on share links and on all devices, always use the Canto picker instead of drag-and-drop for photos that need to be permanent.</P>

          <SubHeading>Session data</SubHeading>
          <P>A design session (the current editor state) is also saved as a separate auto-save record tied to your user account. This allows the editor to restore your last-open state even if you navigate away before the project saves.</P>

          <div className="mt-12 rounded-none border border-gray-200 dark:border-white/8 bg-gray-50 dark:bg-gray-900 px-6 py-5 flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-accent-100 dark:bg-accent-900/50 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-accent-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Questions or issues?</p>
              <p className="text-[12px] leading-relaxed text-gray-500 dark:text-gray-400">
                Reach out to your admin or project owner. This tool is currently in beta — feedback is welcome and bugs are fixed quickly.
              </p>
            </div>
          </div>

        </main>
      </div>
    </div>
  )
}
