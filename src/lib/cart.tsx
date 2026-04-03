'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

export interface CartItem {
  // 識別
  id: string                    // unique key: `${packageId}_${planId}_${copies}`
  // 套餐資訊
  packageId: string
  packageName: string
  // 方案資訊
  planId: string                // package_plan_id
  bcSkuId: string
  bcSkuName: string
  displayName: string           // 顯示名稱（如 "1GB/天" 或自訂名稱）
  // 規格
  copies: string
  days: number
  planCategory: 'daily' | 'fixed'
  productType: 'esim' | 'sim'   // 決定 eSIM/SIM 子訂單分流
  // 價格
  unitPrice: number
  quantity: number
  // 國家資訊
  countryCode: string
  countryName: string
}

interface CartContextType {
  items: CartItem[]
  addItem: (item: Omit<CartItem, 'id' | 'quantity'>, quantity?: number) => void
  removeItem: (id: string) => void
  updateQuantity: (id: string, quantity: number) => void
  clearCart: () => void
  itemCount: number
  totalPrice: number
  esimItems: CartItem[]
  simItems: CartItem[]
}

const CartContext = createContext<CartContextType | null>(null)

const CART_KEY = 'flesim_cart'

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [loaded, setLoaded] = useState(false)

  // 從 localStorage 載入
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CART_KEY)
      if (stored) setItems(JSON.parse(stored))
    } catch {}
    setLoaded(true)
  }, [])

  // 儲存到 localStorage
  useEffect(() => {
    if (loaded) localStorage.setItem(CART_KEY, JSON.stringify(items))
  }, [items, loaded])

  const addItem = useCallback((item: Omit<CartItem, 'id' | 'quantity'>, quantity = 1) => {
    const id = `${item.packageId}_${item.planId}_${item.copies}`
    setItems((prev) => {
      const existing = prev.find((i) => i.id === id)
      if (existing) {
        return prev.map((i) => i.id === id ? { ...i, quantity: i.quantity + quantity } : i)
      }
      return [...prev, { ...item, id, quantity }]
    })
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const updateQuantity = useCallback((id: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => i.id !== id))
    } else {
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, quantity } : i))
    }
  }, [])

  const clearCart = useCallback(() => setItems([]), [])

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0)
  const totalPrice = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
  const esimItems = items.filter((i) => i.productType === 'esim')
  const simItems = items.filter((i) => i.productType === 'sim')

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, clearCart, itemCount, totalPrice, esimItems, simItems }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
