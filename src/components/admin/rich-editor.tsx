'use client'

import { useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, Link as LinkIcon, AlignLeft, AlignCenter,
  AlignRight, Undo, Redo, Code, FileCode
} from 'lucide-react'

interface RichEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

export function RichEditor({ value, onChange }: RichEditorProps) {
  const [isSourceMode, setIsSourceMode] = useState(false)
  const [sourceCode, setSourceCode] = useState(value)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      onChange(html)
      setSourceCode(html)
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[100px] px-3 py-2 focus:outline-none',
      },
    },
  })

  function toggleSourceMode() {
    if (isSourceMode) {
      // 從原始碼切回編輯器
      editor?.commands.setContent(sourceCode)
      onChange(sourceCode)
    } else {
      // 切到原始碼模式
      setSourceCode(editor?.getHTML() || '')
    }
    setIsSourceMode(!isSourceMode)
  }

  function handleSourceChange(html: string) {
    setSourceCode(html)
    onChange(html)
  }

  if (!editor) return null

  function setLink() {
    const url = prompt('輸入連結 URL：')
    if (url) {
      editor!.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }

  const ToolBtn = ({ active, onClick, children, title }: { active?: boolean; onClick: () => void; children: React.ReactNode; title: string }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition-colors ${active ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}
    >
      {children}
    </button>
  )

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50">
        {!isSourceMode && (
          <>
            <ToolBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="粗體">
              <Bold className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="斜體">
              <Italic className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="底線">
              <UnderlineIcon className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="刪除線">
              <Strikethrough className="w-4 h-4" />
            </ToolBtn>

            <div className="w-px h-5 bg-gray-300 mx-1" />

            <ToolBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="項目符號">
              <List className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="編號清單">
              <ListOrdered className="w-4 h-4" />
            </ToolBtn>

            <div className="w-px h-5 bg-gray-300 mx-1" />

            <ToolBtn active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="靠左">
              <AlignLeft className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="置中">
              <AlignCenter className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="靠右">
              <AlignRight className="w-4 h-4" />
            </ToolBtn>

            <div className="w-px h-5 bg-gray-300 mx-1" />

            <ToolBtn active={editor.isActive('link')} onClick={setLink} title="連結">
              <LinkIcon className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="程式碼">
              <Code className="w-4 h-4" />
            </ToolBtn>

            <div className="w-px h-5 bg-gray-300 mx-1" />

            <ToolBtn onClick={() => editor.chain().focus().undo().run()} title="復原">
              <Undo className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn onClick={() => editor.chain().focus().redo().run()} title="重做">
              <Redo className="w-4 h-4" />
            </ToolBtn>
          </>
        )}

        <div className="flex-1" />

        <ToolBtn active={isSourceMode} onClick={toggleSourceMode} title={isSourceMode ? '切回編輯器' : '編輯原始碼'}>
          <FileCode className="w-4 h-4" />
        </ToolBtn>
      </div>

      {/* Editor or Source */}
      {isSourceMode ? (
        <textarea
          value={sourceCode}
          onChange={(e) => handleSourceChange(e.target.value)}
          className="w-full min-h-[120px] px-3 py-2 font-mono text-xs text-gray-700 focus:outline-none resize-y"
          spellCheck={false}
        />
      ) : (
        <EditorContent editor={editor} />
      )}
    </div>
  )
}
