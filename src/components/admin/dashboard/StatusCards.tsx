'use client'

import { useRouter } from 'next/navigation'
import { DollarSign, ShoppingCart, AlertCircle, CreditCard, RotateCw } from 'lucide-react'
import { useState } from 'react'

interface Props {
  summary: { totalRevenue: number; totalVolume: number }
  balance: number | null
  realtime: { pending_sim: number; failed_esim: number }
  onRefreshBalance?: () => void
}

export function StatusCards({ summary, balance, realtime, onRefreshBalance }: Props) {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)
  const isBalanceLow = balance !== null && balance < 500

  const handleRefresh = async () => {
    if (refreshing || !onRefreshBalance) return
    setRefreshing(true)
    await onRefreshBalance()
    setTimeout(() => setRefreshing(false), 1000)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-500">總銷售額</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">
              <span className="text-xl">NT$</span>{summary.totalRevenue.toLocaleString()}
            </div>
          </div>
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-500">總套餐銷量</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">{summary.totalVolume.toLocaleString()}</div>
          </div>
          <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
            <ShoppingCart className="w-6 h-6" />
          </div>
        </div>
      </div>

      <div className={`p-5 rounded-2xl border shadow-sm transition-all duration-300 ${isBalanceLow ? 'bg-red-50 border-red-200 animate-pulse' : 'bg-white border-gray-100'}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className={`text-sm font-medium flex items-center gap-2 ${isBalanceLow ? 'text-red-500' : 'text-gray-500'}`}>
              第三方餘額
              {onRefreshBalance && (
                <button 
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className={`hover:bg-gray-100 p-1 rounded-full transition-all ${refreshing ? 'animate-spin opacity-50' : ''}`}
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className={`mt-2 text-3xl font-bold ${isBalanceLow ? 'text-red-600' : 'text-gray-900'}`}>
              <span className="text-xl">CN￥</span>{balance !== null ? balance.toLocaleString() : '--'}
            </div>
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isBalanceLow ? 'bg-red-100 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}>
            <CreditCard className="w-6 h-6" />
          </div>
        </div>
        {isBalanceLow && <p className="mt-2 text-xs text-red-600 font-medium flex items-center gap-1"><AlertCircle className="w-3 h-3"/> 餘額過低，請盡快充值</p>}
      </div>

      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
        <div className="text-sm font-medium text-gray-500 mb-2">異常配卡漏斗</div>
        <div className="grid grid-cols-2 gap-2 mt-auto">
          <button 
            onClick={() => router.push('/admin/orders?status=pending')}
            className="flex flex-col items-center justify-center p-2 rounded-lg bg-orange-50 hover:bg-orange-100 transition-colors border border-orange-100/50"
          >
            <div className="text-xs text-orange-600 font-medium mb-1 flex items-center gap-1">
              SIM 待配卡
            </div>
            <div className="text-xl font-bold text-orange-700">{realtime.pending_sim}</div>
          </button>
          <button 
            onClick={() => router.push('/admin/orders?status=failed')}
            className="flex flex-col items-center justify-center p-2 rounded-lg bg-rose-50 hover:bg-rose-100 transition-colors border border-rose-100/50"
          >
            <div className="text-xs text-rose-600 font-medium mb-1 flex items-center gap-1">
              eSIM 失敗
            </div>
            <div className="text-xl font-bold text-rose-700">{realtime.failed_esim}</div>
          </button>
        </div>
      </div>
    </div>
  )
}
