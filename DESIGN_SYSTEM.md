# Design System

> Inspired by Vercel's Swiss typographic clarity and Linear's keyboard-first density.
> The guiding principle: **dense precision** — every pixel intentional, restraint creates trust.

---

## Philosophy

- **Density without clutter** (Linear) — pack information tightly, but never overwhelm. Whitespace is structural, not decorative.
- **Typographic clarity** (Vercel) — the type scale is the layout. Get the scale right and spacing falls into place.
- **Restrained color** — near-monochrome base with a single accent color used sparingly. Color signals meaning, not decoration.
- **Keyboard-first** — every interaction reachable without a mouse. Shortcuts are first-class.
- **Consistent elevation** — four layers (flat → raised → floating → modal). Never mix layers.

---

## Spacing — 4px Base Unit

All spacing is a multiple of 4px. Tailwind mapping:

| Token | px  | Tailwind  | Use                                     |
|-------|-----|-----------|-----------------------------------------|
| 1     | 4px | `gap-1`   | Icon-to-label gaps, tight badge padding |
| 2     | 8px | `gap-2`   | Default item spacing inside controls    |
| 3     | 12px| `gap-3`   | Between groups of controls              |
| 4     | 16px| `gap-4`   | Section internal padding                |
| 5     | 20px| `gap-5`   | —                                       |
| 6     | 24px| `gap-6`   | Between sections / modal body padding   |
| 8     | 32px| `gap-8`   | Page-level gutters                      |
| 12    | 48px| `gap-12`  | Major layout separation                 |

**Rule**: never use `px-5 py-3` (mixed multiples). Pick from the scale.

---

## Typography

Font: **Inter** (variable, loaded by Next.js). Geist Sans/Mono as inspiration.

| Role          | Size  | Weight | Color (light)        | Tailwind                                    |
|---------------|-------|--------|----------------------|---------------------------------------------|
| Section label | 10px  | 700    | gray-400             | `text-[10px] font-bold uppercase tracking-widest text-gray-400` |
| Caption       | 11px  | 400    | gray-500             | `text-[11px] text-gray-500`                 |
| Body sm       | 12px  | 400    | gray-600             | `text-[12px] text-gray-600`                 |
| Body          | 13px  | 400    | gray-700             | `text-[13px] text-gray-700`                 |
| Body md       | 14px  | 400    | gray-800             | `text-sm text-gray-800`                     |
| Label (UI)    | 12px  | 500    | gray-700             | `text-[12px] font-medium text-gray-700`     |
| Heading sm    | 13px  | 600    | gray-900             | `text-[13px] font-semibold text-gray-900`   |
| Heading       | 14px  | 600    | gray-900             | `text-sm font-semibold text-gray-900`       |
| Heading lg    | 16px  | 600    | gray-900             | `text-base font-semibold text-gray-900`     |

**Dark mode**: replace `gray-900` → `white`, `gray-700` → `gray-200`, `gray-500` → `gray-400`, `gray-400` → `gray-500`.

**Letter spacing**: tighten at heading sizes (`tracking-tight`), uppercase labels always `tracking-widest`.

---

## Color

### Palette

```
Background layers (light):
  Page:       #fafafa  (bg-gray-50)   ← canvas, empty states
  Surface:    #ffffff  (bg-white)     ← cards, sidebars, panels
  Subtle:     #f3f4f6  (bg-gray-100)  ← hover, pill backgrounds
  Border:     #e5e7eb  (border-gray-200)   ← dividers, input borders
  Border hi:  #d1d5db  (border-gray-300)   ← selected states

Background layers (dark):
  Page:       #0a0a0a  (bg-gray-950)  ← canvas
  Surface:    #111827  (bg-gray-900)  ← sidebar, panels
  Raised:     #1f2937  (bg-gray-800)  ← cards, inputs
  Border:     #374151  (border-gray-700)   ← dividers
  Border hi:  #4b5563  (border-gray-600)   ← selected

Text (light):       gray-900 primary, gray-600 secondary, gray-400 tertiary/placeholder
Text (dark):        white primary, gray-300 secondary, gray-500 tertiary
Accent (brand):     accent-500 (#c44a4a) — brand red, used for active states and primary buttons in accent contexts
Primary action:     gray-900 / white — Vercel-style near-black primary button
Danger:             red-500 (#ef4444)
Success:            emerald-500 (#10b981)
Warning:            amber-500 (#f59e0b)
```

### Color rules
- **One accent per screen** (Linear principle) — the accent-colored element should be the most important action visible.
- Never use accent for decorative purposes (borders, backgrounds of non-interactive elements).
- Platform colors: Amazon → orange-500, Shopify → green-600. These are semantic, not brand.
- Use `opacity/10` or `/8` variants (e.g. `white/8`) for subtle overlays in dark mode.

---

## Border Radius

| Context                              | Value  | Tailwind       |
|--------------------------------------|--------|----------------|
| Inline controls (buttons, inputs, badges, chips) | 4px | `rounded`  |
| Menus, dropdowns, popovers           | 6px    | `rounded-md`   |
| Cards, panels, modals                | 8px    | `rounded-lg`   |
| Avatars, icon containers (circular)  | 9999px | `rounded-full` |

**Rule**: `rounded-xl` and above are never used. `rounded-full` only for genuinely circular elements.

---

## Elevation / Shadows

Four layers — do not skip or mix:

| Layer    | Context                        | Shadow                                              |
|----------|--------------------------------|-----------------------------------------------------|
| Flat     | Inline elements, table rows    | none                                                |
| Raised   | Cards, sidebar sections        | `shadow-sm` (0 1px 2px rgba(0,0,0,0.06))           |
| Floating | Dropdowns, popovers, tooltips  | `shadow-lg ring-1 ring-black/5`                     |
| Modal    | Full overlays, dialogs         | `shadow-2xl ring-1 ring-black/8`                    |

Dark mode: reduce shadow intensity. Prefer `ring-1 ring-white/8` instead of `ring-black/5` for floating elements in dark.

---

## Components

### Buttons

Three sizes, four variants. Heights are fixed — no mixing `py-*` with `h-*`.

**Sizes:**
```
sm:  h-7  px-2.5  text-[11px] font-semibold  gap-1.5   ← dense UI, sidebars, toolbars
md:  h-8  px-3    text-[12px] font-semibold  gap-2     ← default
lg:  h-9  px-4    text-[13px] font-semibold  gap-2     ← prominent CTAs
```

**Variants:**
```
Primary:   bg-gray-900 text-white hover:bg-gray-700               (dark: bg-white text-gray-900 hover:bg-gray-100)
Secondary: border border-gray-200 bg-white text-gray-700 hover:bg-gray-50  (dark: border-gray-700 bg-gray-800 text-gray-200 hover:bg-gray-700)
Ghost:     text-gray-600 hover:bg-gray-100 hover:text-gray-900    (dark: text-gray-400 hover:bg-gray-800 hover:text-gray-100)
Danger:    bg-red-500 text-white hover:bg-red-600
```

All buttons: `rounded transition-colors` (150ms). `disabled:opacity-40 disabled:cursor-not-allowed`. No box-shadow on buttons.

Icon buttons (square): same height as size class, `w-7`/`w-8`/`w-9`, `rounded`.

### Inputs

```
Standard:  h-8 px-3 text-[13px] rounded border border-gray-200 dark:border-gray-700
           bg-white dark:bg-gray-800 text-gray-900 dark:text-white
           placeholder:text-gray-400 dark:placeholder:text-gray-500
           focus:outline-none focus:ring-2 focus:ring-gray-900/15 dark:focus:ring-white/15 focus:border-gray-400

Small:     h-7 px-2.5 text-[12px] (same border/focus pattern)
```

Search inputs: `pl-7` (icon left), `pr-6` (clear button right), `h-7`.

### Dropdowns / Menus

```
Container: bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700
           rounded-md shadow-lg ring-1 ring-black/5 dark:ring-white/8
           p-1 (padding inside — items get their own px-2 py-1.5)

Item:      w-full px-2 py-1.5 rounded text-[12px] text-gray-700 dark:text-gray-200
           hover:bg-gray-100 dark:hover:bg-gray-800 text-left transition-colors
           
Separator: h-px bg-gray-100 dark:bg-gray-800 my-1 mx-2
```

### Modals / Dialogs

```
Backdrop:  fixed inset-0 z-[200] bg-black/40 dark:bg-black/60 backdrop-blur-sm
Container: bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700
           shadow-2xl ring-1 ring-black/5 dark:ring-white/5
           max-w-[480px] w-full (or specific widths per context)

Header:    px-5 py-3.5 border-b border-gray-100 dark:border-gray-800
           flex items-center justify-between
Body:      px-5 py-4 (or px-5 py-5 for spacious dialogs)
Footer:    px-5 py-3 border-t border-gray-100 dark:border-gray-800
           flex items-center justify-end gap-2
```

### Sidebar Navigation

Inspired by Linear's sidebar: items are compact, left-aligned, with a subtle active state.

```
Nav item:  w-full flex items-center gap-2 px-2 py-1.5 rounded text-[12px]
           text-gray-600 dark:text-gray-400
           hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white

Active:    bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-medium

Section label: text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500
               px-2 mb-1 mt-3
```

### Badges / Pills

```
Default:  px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300
Accent:   bg-accent-50 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400
Success:  bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400
Warning:  bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400
Danger:   bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400
```

### Kbd Badges

```
inline-flex items-center justify-center px-1.5 h-[18px] min-w-[18px]
rounded border border-gray-200 dark:border-gray-600
bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-300
font-mono text-[10px] font-semibold leading-none
shadow-[0_1px_0_rgba(0,0,0,0.15)] dark:shadow-[0_1px_0_rgba(0,0,0,0.5)]
```

### Dividers / Separators

```
Horizontal: <div className="h-px bg-gray-100 dark:bg-gray-800" />
Vertical:   <div className="w-px h-4 bg-gray-200 dark:bg-gray-700" />
```

---

## Motion

Inspired by Vercel timing, Linear smoothness.

| Type              | Duration | Easing                              | Tailwind class          |
|-------------------|----------|-------------------------------------|-------------------------|
| State change      | 150ms    | `ease-in-out`                       | `transition-colors`     |
| Popover open      | 160ms    | `cubic-bezier(0.16, 1, 0.3, 1)`    | `animate-slide-down`    |
| Modal open        | 220ms    | `cubic-bezier(0.16, 1, 0.3, 1)`    | `animate-scale-in`      |
| Collapse/expand   | 200ms    | `ease`                              | grid-template-rows trick|

**Rules:**
- No bouncy/spring animations on standard UI elements. Reserve `bounce-once` for celebratory moments only.
- All `transition-*` classes should specify what transitions: `transition-colors`, `transition-opacity`, not bare `transition`.
- Use `will-change-transform` on animated overlay containers for GPU acceleration.

---

## Icons

- Size 14px (`w-3.5 h-3.5`) in buttons and dense UI
- Size 16px (`w-4 h-4`) in standard UI, sidebar items
- Size 18px (`w-4.5 h-4.5`) in prominent placements
- `strokeWidth={1.75}` — slightly lighter than the default 2 for a more refined feel
- Always `currentColor` — inherit from text color, never hardcoded

---

## Dark Mode

- Always use `dark:` variants paired with every light mode color class
- Backgrounds: `bg-white dark:bg-gray-900`, `bg-gray-50 dark:bg-gray-950`, `bg-gray-100 dark:bg-gray-800`
- Borders: `border-gray-200 dark:border-gray-700` (standard), `border-gray-100 dark:border-gray-800` (subtle)
- Text: `text-gray-900 dark:text-white` (primary), `text-gray-600 dark:text-gray-300` (secondary), `text-gray-400 dark:text-gray-500` (tertiary)
- Overlays: use `bg-black/X` for backdrops (works in both modes); use `bg-white/8` or `bg-black/5` for surface-level tints

---

## Anti-patterns (never do)

- `rounded-xl` or `rounded-2xl` on UI controls
- `rounded-full` on anything that isn't circular (avatars, icon containers, toggles)
- `shadow-md` on modal containers (use `shadow-2xl`)
- Bare `transition` without specifying the property
- Font sizes below `text-[10px]` (9px and below are unreadable)
- Mixing fixed-height (`h-8`) and padding-based height (`py-2`) on buttons
- Using accent color for more than one CTA per screen section
- Hard-coded hex colors in className — use Tailwind palette tokens
- `text-gray-800` when `text-gray-900` is intended for primary text
- `opacity-50` on disabled — use `opacity-40` (Linear convention, subtler)
