'use client'

import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useCallback } from 'react'

/**
 * 把列表頁的狀態存在 URL search params。
 *
 * 好處：
 * - 進入明細後按 back，URL 帶回原本的狀態，頁面與篩選自動還原
 * - 重新整理不丟 state
 * - 可分享連結
 *
 * @example
 * const [page, setPage] = useUrlState('page', 1)
 * const [search, setSearch] = useUrlState('search', '')
 */
type Widen<T> = T extends string ? string : T extends number ? number : T

export function useUrlState<T extends string | number>(
  key: string,
  defaultValue: T,
): [Widen<T>, (val: Widen<T>) => void] {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const raw = searchParams.get(key)
  const value: string | number = raw === null
    ? defaultValue
    : (typeof defaultValue === 'number' ? Number(raw) : raw)

  const setter = useCallback((val: string | number) => {
    const params = new URLSearchParams(searchParams.toString())
    if (val === defaultValue || val === '' || (typeof val === 'number' && Number.isNaN(val))) {
      params.delete(key)
    } else {
      params.set(key, String(val))
    }
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [searchParams, router, pathname, key, defaultValue])

  return [value, setter] as unknown as [Widen<T>, (val: Widen<T>) => void]
}

/**
 * 一次更新多個 URL key（解決個別 setter 連續呼叫被覆蓋的問題）。
 * @example
 * const setMany = useUrlStateBatch()
 * setMany({ page: 1, filterType: 'F002' })   // 一次更新兩個
 * setMany({ filterType: '', filterStatus: '', page: 1 }) // 清空多個
 */
export function useUrlStateBatch() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  return useCallback((updates: Record<string, string | number | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, val] of Object.entries(updates)) {
      if (val === null || val === '' || (typeof val === 'number' && Number.isNaN(val))) {
        params.delete(key)
      } else {
        params.set(key, String(val))
      }
    }
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [searchParams, router, pathname])
}
