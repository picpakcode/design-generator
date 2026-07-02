'use client'

import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

export default function RichTextEditor({ value, onChange, placeholder = 'Write description…' }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    editorProps: {
      attributes: {
        class: 'rte-prosemirror',
        'data-placeholder': placeholder,
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })

  // Sync if value changes externally (e.g. template reset)
  useEffect(() => {
    if (editor && !editor.isDestroyed && editor.getHTML() !== value) {
      editor.commands.setContent(value)
    }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!editor) return null

  return (
    <div className="rte-wrapper border border-gray-200 dark:border-gray-600 rounded-none overflow-hidden bg-white dark:bg-gray-800 focus-within:ring-2 focus-within:ring-accent-400 focus-within:border-transparent transition-all">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80">
        <ToolbarBtn
          active={editor.isActive('bold')}
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run() }}
          title="Bold"
        >
          <span className="font-bold text-sm">B</span>
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive('italic')}
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run() }}
          title="Italic"
        >
          <span className="italic text-sm">I</span>
        </ToolbarBtn>
        <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-1" />
        <ToolbarBtn
          active={editor.isActive('bulletList')}
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBulletList().run() }}
          title="Bullet list"
        >
          <BulletListIcon />
        </ToolbarBtn>
        <ToolbarBtn
          active={editor.isActive('orderedList')}
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run() }}
          title="Numbered list"
        >
          <OrderedListIcon />
        </ToolbarBtn>
        <div className="flex-1" />
        <button
          onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().clearContent(true).run() }}
          title="Clear"
          className="text-[10px] text-gray-400 dark:text-gray-500 hover:text-red-400 transition-colors px-1"
        >
          Clear
        </button>
      </div>

      {/* Editor area */}
      <EditorContent editor={editor} />
    </div>
  )
}

function ToolbarBtn({
  children,
  active,
  onMouseDown,
  title,
}: {
  children: React.ReactNode
  active: boolean
  onMouseDown: (e: React.MouseEvent) => void
  title?: string
}) {
  return (
    <button
      onMouseDown={onMouseDown}
      title={title}
      className={`w-7 h-7 rounded-none flex items-center justify-center transition-colors ${
        active ? 'bg-gray-800 dark:bg-gray-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

function BulletListIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <circle cx="1.5" cy="3.5" r="1.2" />
      <rect x="4" y="2.8" width="9" height="1.4" rx="0.7" />
      <circle cx="1.5" cy="7" r="1.2" />
      <rect x="4" y="6.3" width="9" height="1.4" rx="0.7" />
      <circle cx="1.5" cy="10.5" r="1.2" />
      <rect x="4" y="9.8" width="9" height="1.4" rx="0.7" />
    </svg>
  )
}

function OrderedListIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
      <text x="0" y="5" fontSize="5" fontWeight="700">1.</text>
      <rect x="5" y="2.8" width="8" height="1.4" rx="0.7" />
      <text x="0" y="9" fontSize="5" fontWeight="700">2.</text>
      <rect x="5" y="6.3" width="8" height="1.4" rx="0.7" />
      <text x="0" y="13" fontSize="5" fontWeight="700">3.</text>
      <rect x="5" y="9.8" width="8" height="1.4" rx="0.7" />
    </svg>
  )
}
