'use client'

import { useEffect, useRef, useState } from 'react'

interface CountryOption { mcc: string; name: string }

// 可搜尋、多選的國家下拉（樣式比照 BC 對應彈窗的國家選單）
export default function CountryMultiSelect({
  options, value, onChange, placeholder = '國家', className = '',
}: {
  options: CountryOption[]
  value: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function toggle(mcc: string) {
    onChange(value.includes(mcc) ? value.filter(m => m !== mcc) : [...value, mcc])
  }

  const filtered = q
    ? options.filter(c => c.name.toLowerCase().includes(q.toLowerCase()) || c.mcc.toLowerCase().includes(q.toLowerCase()))
    : options

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full text-left px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white min-h-[38px]">
        {value.length > 0 ? (
          <span className="flex items-center gap-1 flex-wrap">
            {value.slice(0, 3).map(mcc => {
              const c = options.find(o => o.mcc === mcc)
              return <span key={mcc} className="inline-flex items-center gap-0.5 bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-xs">
                {c?.name || mcc} <span className="cursor-pointer" onClick={(e) => { e.stopPropagation(); toggle(mcc) }}>×</span>
              </span>
            })}
            {value.length > 3 && <span className="text-xs text-gray-400">+{value.length - 3}</span>}
          </span>
        ) : <span className="text-gray-400">{placeholder}</span>}
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-gray-300 rounded-lg shadow-lg overflow-hidden min-w-[200px]">
          <div className="p-2 border-b border-gray-100">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜尋國家..."
              className="w-full px-2 py-1.5 bg-gray-50 rounded text-sm" autoFocus />
          </div>
          {value.length > 0 && (
            <div className="px-3 py-1.5 flex items-center justify-between border-b border-gray-100">
              <span className="text-xs text-gray-500">已選 {value.length} 個</span>
              <button onClick={() => onChange([])} className="text-xs text-blue-600 hover:underline">清除全部</button>
            </div>
          )}
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-gray-400 text-center">無符合的國家</div>
            ) : filtered.map(c => (
              <label key={c.mcc} className={`flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-sm ${value.includes(c.mcc) ? 'bg-blue-50' : ''}`}>
                <input type="checkbox" checked={value.includes(c.mcc)} onChange={() => toggle(c.mcc)} className="accent-blue-600" />
                {c.name}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
