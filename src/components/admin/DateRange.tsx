'use client'

import { useEffect, useRef, useState } from 'react'

// 彈出式日期區間選擇器：日/月/年三種粒度，雙面板，點兩格拉頭尾。
// 對外 from/to 一律 YYYY-MM-DD（月=該月首/末日，年=1/1~12/31），查詢邏輯不用改。
type Mode = 'day' | 'month' | 'year'
const pad = (n: number) => String(n).padStart(2, '0')
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate()   // m: 1-12

export default function DateRange({ from, to, onFrom, onTo, label = '日期' }: {
  from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void; label?: string
}) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('day')
  const [anchor, setAnchor] = useState(() => (from ? new Date(from + 'T00:00:00') : new Date()))
  const [pending, setPending] = useState<string | null>(null)   // 第一次點的 key
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  // 對外值 → 各粒度 key
  const fromKey = from ? (mode === 'day' ? from.slice(0, 10) : mode === 'month' ? from.slice(0, 7) : from.slice(0, 4)) : ''
  const toKey = to ? (mode === 'day' ? to.slice(0, 10) : mode === 'month' ? to.slice(0, 7) : to.slice(0, 4)) : ''
  const toFrom = (k: string) => mode === 'day' ? k : mode === 'month' ? `${k}-01` : `${k}-01-01`
  const toTo = (k: string) => mode === 'day' ? k : mode === 'month' ? `${k}-${pad(lastDay(Number(k.slice(0, 4)), Number(k.slice(5, 7))))}` : `${k}-12-31`

  function pick(key: string) {
    if (!pending) { setPending(key); onFrom(toFrom(key)); onTo('') }
    else {
      let a = pending, b = key
      if (b < a) [a, b] = [b, a]
      onFrom(toFrom(a)); onTo(toTo(b)); setPending(null); setOpen(false)
    }
  }
  const move = (dir: -1 | 1, step: 'unit' | 'page') => {
    const d = new Date(anchor)
    if (mode === 'day') d.setMonth(d.getMonth() + dir * (step === 'unit' ? 1 : 12))
    else if (mode === 'month') d.setFullYear(d.getFullYear() + dir * (step === 'unit' ? 1 : 5))
    else d.setFullYear(d.getFullYear() + dir * 10)
    setAnchor(d)
  }

  const cellCls = (k: string) => {
    const inRange = fromKey && toKey && k > fromKey && k < toKey
    const isStart = k === fromKey || k === pending
    const isEnd = k === toKey
    if (isStart || isEnd) return 'bg-blue-600 text-white'
    if (inRange) return 'bg-blue-50 text-blue-700'
    return 'hover:bg-gray-100 text-gray-700'
  }

  // ── 各粒度面板 ──
  function DayPanel({ y, m }: { y: number; m: number }) {   // m: 0-11
    const first = new Date(y, m, 1)
    const off = (first.getDay() + 6) % 7   // 週一起
    const cells = Array.from({ length: 42 }, (_, i) => new Date(y, m, 1 - off + i))
    return (
      <div>
        <div className="text-center text-sm font-medium mb-2">{y}年 {m + 1}月</div>
        <div className="grid grid-cols-7 gap-0.5 text-xs text-gray-400 mb-1">{['一', '二', '三', '四', '五', '六', '日'].map(w => <div key={w} className="text-center">{w}</div>)}</div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((d, i) => {
            const inM = d.getMonth() === m
            const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
            return <button key={i} disabled={!inM} onClick={() => pick(k)}
              className={`h-8 text-xs rounded ${inM ? cellCls(k) : 'text-gray-300'}`}>{d.getDate()}</button>
          })}
        </div>
      </div>
    )
  }
  function MonthPanel({ y }: { y: number }) {
    return (
      <div>
        <div className="text-center text-sm font-medium mb-2">{y}年</div>
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 12 }, (_, i) => { const k = `${y}-${pad(i + 1)}`; return <button key={i} onClick={() => pick(k)} className={`h-11 text-sm rounded ${cellCls(k)}`}>{i + 1}月</button> })}
        </div>
      </div>
    )
  }
  function YearPanel({ dec }: { dec: number }) {
    return (
      <div>
        <div className="text-center text-sm font-medium mb-2">{dec}-{dec + 9}</div>
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 12 }, (_, i) => { const yr = dec - 1 + i; const k = String(yr); const edge = yr < dec || yr > dec + 9; return <button key={i} onClick={() => pick(k)} className={`h-11 text-sm rounded ${edge ? 'text-gray-300' : cellCls(k)}`}>{yr}</button> })}
        </div>
      </div>
    )
  }

  const y = anchor.getFullYear(), m = anchor.getMonth()
  const rightMonth = new Date(y, m + 1, 1)
  const dec = Math.floor(y / 10) * 10

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 text-sm text-left min-w-[15rem] hover:border-blue-400">
          <span className="text-xs text-gray-500 shrink-0">{label}</span>
          <span className={from || to ? 'text-gray-800' : 'text-gray-400'}>{from || '開始'} <span className="text-gray-400">→</span> {to || '結束'}</span>
        </button>
        <div className="flex items-center gap-0.5">
          {(['day', 'month', 'year'] as const).map(mm => (
            <button key={mm} type="button" onClick={() => { setMode(mm); setPending(null); setOpen(true) }}
              className={`text-xs px-2 py-1.5 rounded border ${mode === mm ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              {mm === 'day' ? '日' : mm === 'month' ? '月' : '年'}
            </button>
          ))}
        </div>
      </div>

      {open && (
        <div className="absolute z-30 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg p-4">
          <div className="flex items-center justify-between mb-2 text-gray-400">
            <div className="flex gap-1">
              <button type="button" onClick={() => move(-1, 'page')} className="px-1 hover:text-gray-700">«</button>
              <button type="button" onClick={() => move(-1, 'unit')} className="px-1 hover:text-gray-700">‹</button>
            </div>
            <div className="flex gap-1">
              <button type="button" onClick={() => move(1, 'unit')} className="px-1 hover:text-gray-700">›</button>
              <button type="button" onClick={() => move(1, 'page')} className="px-1 hover:text-gray-700">»</button>
            </div>
          </div>
          <div className="flex gap-6">
            {mode === 'day' && <><DayPanel y={y} m={m} /><DayPanel y={rightMonth.getFullYear()} m={rightMonth.getMonth()} /></>}
            {mode === 'month' && <><MonthPanel y={y} /><MonthPanel y={y + 1} /></>}
            {mode === 'year' && <><YearPanel dec={dec} /><YearPanel dec={dec + 10} /></>}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-gray-400">{pending ? '再點一格選結束' : '點兩格拉頭尾'}</span>
            <button type="button" onClick={() => { onFrom(''); onTo(''); setPending(null) }} className="text-gray-500 hover:text-rose-600">清除</button>
          </div>
        </div>
      )}
    </div>
  )
}
