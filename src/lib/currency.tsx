'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'

export type Currency = 'TWD' | 'USD' | 'HKD'
export const CURRENCIES: Currency[] = ['TWD', 'USD', 'HKD']
export const CURRENCY_LABEL: Record<Currency, string> = { TWD: '新台幣 TWD', USD: '美金 USD', HKD: '港元 HKD' }

const SYMBOLS: Record<Currency, string> = { TWD: 'NT$', USD: 'US$', HKD: 'HK$' }
const DECIMALS: Record<Currency, number> = { TWD: 0, USD: 2, HKD: 0 }
// rate = 每 1 TWD 兌換的外幣（與 exchange_rates 的 CNY 語意一致）
const DEFAULT_RATES: Record<string, number> = { TWD: 1, USD: 0.0312, HKD: 0.244 }

interface Ctx {
  currency: Currency
  setCurrency: (c: Currency) => void
  format: (twd: number) => string
  ready: boolean
}
const CurrencyContext = createContext<Ctx | null>(null)

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>('USD') // 預設美金（使用者曾選過則沿用）
  const [rates, setRates] = useState<Record<string, number>>(DEFAULT_RATES)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('currency') as Currency | null
      if (saved && CURRENCIES.includes(saved)) setCurrencyState(saved)
    } catch {}
    fetch('/api/shop/rates')
      .then(r => r.json())
      .then(d => { if (d && typeof d === 'object') setRates({ ...DEFAULT_RATES, ...d, TWD: 1 }) })
      .catch(() => {})
      .finally(() => setReady(true))
  }, [])

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c)
    try { localStorage.setItem('currency', c) } catch {}
  }, [])

  const format = useCallback((twd: number) => {
    const rate = rates[currency] ?? DEFAULT_RATES[currency] ?? 1
    const v = (twd || 0) * rate
    const d = DECIMALS[currency]
    const num = d > 0 ? v.toFixed(d) : Math.round(v).toLocaleString()
    return `${SYMBOLS[currency]} ${num}`
  }, [currency, rates])

  return <CurrencyContext.Provider value={{ currency, setCurrency, format, ready }}>{children}</CurrencyContext.Provider>
}

export function useCurrency(): Ctx {
  const ctx = useContext(CurrencyContext)
  if (!ctx) {
    return { currency: 'TWD', setCurrency: () => {}, format: (twd: number) => `NT$ ${Math.round(twd || 0).toLocaleString()}`, ready: true }
  }
  return ctx
}
