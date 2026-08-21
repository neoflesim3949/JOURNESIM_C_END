// 統計分析快照 client 小工具：打開讀快取、計算後存檔
import { useEffect, useRef, useState } from 'react'

export interface SnapMeta { computed_at: string; opts?: Record<string, unknown> }

export async function loadSnapshot<T>(key: string): Promise<{ payload: T; meta: SnapMeta } | null> {
  try {
    const res = await fetch(`/api/admin/stats/snapshot?key=${encodeURIComponent(key)}`)
    if (!res.ok) return null
    const j = await res.json()
    if (j.empty || j.payload == null) return null
    return { payload: j.payload as T, meta: { computed_at: j.computed_at, opts: j.opts } }
  } catch { return null }
}

export async function saveSnapshot(key: string, payload: unknown, opts?: Record<string, unknown>): Promise<void> {
  try {
    await fetch('/api/admin/stats/snapshot', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, payload, opts: opts ?? null }),
    })
  } catch { /* 存快照失敗不影響顯示 */ }
}

export function snapLabel(computed_at: string): string {
  if (!computed_at) return ''
  return `上次計算：${new Date(computed_at).toLocaleString('zh-TW')}`
}

// 快照載入器：掛載時讀快取（不重算）；deps 變動 或 手動 compute() 時才打 API 重算並存檔。
//   fetchUrl() 回傳要打的 API URL；apply(payload) 把回應套進元件 state；buildOpts() 記錄計算條件。
export function useSnapshotLoader<T>(cfg: {
  key: string
  deps: unknown[]
  fetchUrl: () => string
  apply: (payload: T) => void
  buildOpts?: () => Record<string, unknown>
}) {
  const [loading, setLoading] = useState(true)
  const [computing, setComputing] = useState(false)
  const [computedAt, setComputedAt] = useState('')
  const ref = useRef(cfg)
  ref.current = cfg
  const mounted = useRef(false)

  async function compute() {
    setComputing(true)
    try {
      const res = await fetch(ref.current.fetchUrl())
      if (res.ok) {
        const j = await res.json() as T
        ref.current.apply(j)
        const at = new Date().toISOString()
        setComputedAt(at)
        saveSnapshot(ref.current.key, j, ref.current.buildOpts?.())
      }
    } finally { setComputing(false); setLoading(false) }
  }

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      ;(async () => {
        const s = await loadSnapshot<T>(ref.current.key)
        if (s) { ref.current.apply(s.payload); setComputedAt(s.meta.computed_at) }
        setLoading(false)
      })()
      return
    }
    compute()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, cfg.deps)

  return { loading, computing, computedAt, compute }
}
