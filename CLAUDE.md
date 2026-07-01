# Claude Code Instructions

## Design System

All UI work must follow [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md).

Key rules enforced on every PR:
- Border radius: `rounded` (controls) · `rounded-md` (menus) · `rounded-lg` (modals) · `rounded-full` (circles only)
- Button heights: `h-7` (sm) · `h-8` (md, default) · `h-9` (lg) — never mix `h-*` with `py-*`
- Borders: `border-gray-200 dark:border-gray-700` (standard) · `border-gray-100 dark:border-gray-800` (subtle)
- Shadows: none (flat) · `shadow-sm` (raised) · `shadow-lg ring-1 ring-black/5` (floating) · `shadow-2xl ring-1 ring-black/5` (modal)
- Text hierarchy: `text-gray-900 dark:text-white` → `text-gray-600 dark:text-gray-300` → `text-gray-400 dark:text-gray-500`
- Icons: `strokeWidth={1.75}`, `currentColor`, `w-4 h-4` standard / `w-3.5 h-3.5` dense

## Stack

- Next.js App Router, React, TypeScript, Tailwind CSS
- Supabase (auth + postgres + storage)
- Dark mode via `class` strategy (`dark:` prefix)

## Conventions

- Default corner radius: 4px (`rounded`) — never `rounded-xl`/`rounded-2xl` on controls
- `transition-colors` not bare `transition`
- `disabled:opacity-40` not `disabled:opacity-50`
- No comments unless the WHY is non-obvious
- No new files without a clear reason — prefer editing existing ones
