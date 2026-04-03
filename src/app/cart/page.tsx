'use client'

import Link from 'next/link'
import { Minus, Plus, Trash2, ShoppingBag, ArrowLeft, Wifi, CreditCard } from 'lucide-react'
import { useCart } from '@/lib/cart'
import { formatPrice } from '@/lib/utils'

export default function CartPage() {
  const { items, esimItems, simItems, updateQuantity, removeItem, clearCart, itemCount, totalPrice } = useCart()

  if (itemCount === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <ShoppingBag className="mx-auto w-16 h-16 text-muted-foreground/30" />
        <h1 className="mt-4 text-2xl font-bold">購物車是空的</h1>
        <p className="mt-2 text-muted-foreground">快去挑選你的旅遊方案吧！</p>
        <Link href="/shop" className="mt-6 inline-flex items-center gap-2 px-6 py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-hover">
          <ArrowLeft className="w-4 h-4" /> 前往選購
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold">購物車</h1>
      <p className="mt-1 text-muted-foreground">{itemCount} 件商品</p>

      <div className="mt-8 space-y-8">
        {/* eSIM Items */}
        {esimItems.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Wifi className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg font-semibold">eSIM 商品</h2>
              <span className="text-sm text-muted-foreground">（{esimItems.length} 項）</span>
            </div>
            <div className="bg-white rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">商品</th>
                    <th className="text-left px-4 py-3 font-medium w-40">方案</th>
                    <th className="text-right px-4 py-3 font-medium w-24">價格</th>
                    <th className="text-center px-4 py-3 font-medium w-32">數量</th>
                    <th className="text-right px-4 py-3 font-medium w-24">總計</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {esimItems.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="font-medium">{item.packageName}</div>
                        <div className="text-xs text-muted-foreground">{item.countryName}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{item.displayName}</td>
                      <td className="px-4 py-3 text-right">{formatPrice(item.unitPrice)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center border border-border rounded-lg w-fit mx-auto">
                          <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="px-2 py-1 hover:bg-muted"><Minus className="w-3.5 h-3.5" /></button>
                          <span className="px-3 text-sm font-medium min-w-[28px] text-center">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="px-2 py-1 hover:bg-muted"><Plus className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">{formatPrice(item.unitPrice * item.quantity)}</td>
                      <td className="px-2 py-3">
                        <button onClick={() => removeItem(item.id)} className="p-1 text-muted-foreground hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SIM Items */}
        {simItems.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="w-5 h-5 text-green-500" />
              <h2 className="text-lg font-semibold">SIM 卡商品</h2>
              <span className="text-sm text-muted-foreground">（{simItems.length} 項）</span>
            </div>
            <div className="bg-white rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">商品</th>
                    <th className="text-left px-4 py-3 font-medium w-40">方案</th>
                    <th className="text-right px-4 py-3 font-medium w-24">價格</th>
                    <th className="text-center px-4 py-3 font-medium w-32">數量</th>
                    <th className="text-right px-4 py-3 font-medium w-24">總計</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {simItems.map((item) => (
                    <tr key={item.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="font-medium">{item.packageName}</div>
                        <div className="text-xs text-muted-foreground">{item.countryName}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{item.displayName}</td>
                      <td className="px-4 py-3 text-right">{formatPrice(item.unitPrice)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center border border-border rounded-lg w-fit mx-auto">
                          <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="px-2 py-1 hover:bg-muted"><Minus className="w-3.5 h-3.5" /></button>
                          <span className="px-3 text-sm font-medium min-w-[28px] text-center">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="px-2 py-1 hover:bg-muted"><Plus className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">{formatPrice(item.unitPrice * item.quantity)}</td>
                      <td className="px-2 py-3">
                        <button onClick={() => removeItem(item.id)} className="p-1 text-muted-foreground hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="mt-8 bg-white rounded-xl border border-border p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-muted-foreground">訂單摘要</div>
            {esimItems.length > 0 && <div className="text-xs text-muted-foreground mt-1">eSIM: {esimItems.reduce((s, i) => s + i.quantity, 0)} 件 · {formatPrice(esimItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0))}</div>}
            {simItems.length > 0 && <div className="text-xs text-muted-foreground mt-0.5">SIM: {simItems.reduce((s, i) => s + i.quantity, 0)} 件 · {formatPrice(simItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0))}</div>}
            <div className="text-2xl font-bold text-primary mt-2">{formatPrice(totalPrice)}</div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={clearCart} className="px-4 py-2 text-sm text-muted-foreground hover:text-red-500 border border-border rounded-lg hover:border-red-200">清空購物車</button>
            <Link href="/checkout"
              className="inline-flex items-center gap-2 px-8 py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-hover transition-colors">
              <ShoppingBag className="w-5 h-5" /> 前往結帳
            </Link>
          </div>
        </div>
        {esimItems.length > 0 && simItems.length > 0 && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
            訂單將自動拆分為 eSIM 子訂單和 SIM 子訂單。eSIM 付款後即時發送，SIM 卡需等待配卡和物流。
          </div>
        )}
      </div>
    </div>
  )
}
