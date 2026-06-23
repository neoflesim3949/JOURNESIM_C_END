'use client'

import { useRef, useEffect } from 'react'

// 簡易 HTML 編輯器（contentEditable + 工具列）。輸出 HTML 字串。
export default function HtmlEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)

  // 初始內容只在掛載時寫入，避免每次輸入重設游標（外層用 key 切換不同文章時會重新掛載）
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value || ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const emit = () => { if (ref.current) onChange(ref.current.innerHTML) }
  const exec = (cmd: string, arg?: string) => { document.execCommand(cmd, false, arg); ref.current?.focus(); emit() }

  function Btn({ onClick, children, title }: { onClick: () => void; children: React.ReactNode; title: string }) {
    return (
      <button type="button" title={title} onMouseDown={e => e.preventDefault()} onClick={onClick}
        className="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-100 bg-white">{children}</button>
    )
  }

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      <div className="flex flex-wrap gap-1 p-2 border-b border-gray-200 bg-gray-50">
        <Btn title="大標題" onClick={() => exec('formatBlock', '<h2>')}>H2</Btn>
        <Btn title="小標題" onClick={() => exec('formatBlock', '<h3>')}>H3</Btn>
        <Btn title="內文段落" onClick={() => exec('formatBlock', '<p>')}>內文</Btn>
        <Btn title="粗體" onClick={() => exec('bold')}><b>B</b></Btn>
        <Btn title="斜體" onClick={() => exec('italic')}><i>I</i></Btn>
        <Btn title="項目清單" onClick={() => exec('insertUnorderedList')}>• 清單</Btn>
        <Btn title="編號清單" onClick={() => exec('insertOrderedList')}>1. 清單</Btn>
        <Btn title="插入連結" onClick={() => { const url = prompt('連結網址（含 https://）'); if (url) exec('createLink', url) }}>連結</Btn>
        <Btn title="清除格式" onClick={() => exec('removeFormat')}>清除格式</Btn>
      </div>
      <div ref={ref} contentEditable suppressContentEditableWarning onInput={emit}
        className="prose prose-sm max-w-none min-h-[320px] p-4 focus:outline-none" />
    </div>
  )
}
