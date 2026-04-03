'use client'

import { useState, useEffect } from 'react'
import { StatusCards } from '@/components/admin/dashboard/StatusCards'
import { AnalyticsCharts } from '@/components/admin/dashboard/AnalyticsCharts'
import { HotRankings } from '@/components/admin/dashboard/HotRankings'
import { Loader2 } from 'lucide-react'

export default function AdminDashboard() {
  const [days, setDays] = useState(30)
  const [typeFilter, setTypeFilter] = useState('all') // 'all' | 'esim' | 'sim'
  const [aggregation, setAggregation] = useState('day') // day | month | quarter | year
  
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const refreshData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/dashboard?days=${days}&productType=${typeFilter}&aggregation=${aggregation}`)
      const json = await res.json()
      setData(json)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshData()
  }, [days, typeFilter, aggregation])

  return (
    <div className="pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 relative z-10">
        <h1 className="text-2xl font-bold text-gray-800 tracking-tight">綜合業務儀表盤</h1>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
            {(['day', 'month', 'quarter', 'year'] as const).map(a => (
              <button
                key={a}
                onClick={() => setAggregation(a)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${aggregation === a ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                {a === 'day' ? '日' : a === 'month' ? '月' : a === 'quarter' ? '季' : '年'}
              </button>
            ))}
          </div>

          <div className="flex items-center bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
            <button
              onClick={() => setDays(7)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${days === 7 ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              近 7 天
            </button>
            <button
              onClick={() => setDays(15)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${days === 15 ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              近 15 天
            </button>
            <button
              onClick={() => setDays(30)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${days === 30 ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              近 30 天
            </button>
          </div>

          <div className="flex items-center bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${typeFilter === 'all' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
            >
              全部
            </button>
            <button
              onClick={() => setTypeFilter('esim')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${typeFilter === 'esim' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
            >
              eSIM
            </button>
            <button
              onClick={() => setTypeFilter('sim')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${typeFilter === 'sim' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
            >
              SIM
            </button>
          </div>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : data ? (
        <div className={`transition-opacity duration-300 ${loading ? 'opacity-50' : 'opacity-100'}`}>
          <StatusCards 
            summary={data.summary} 
            balance={data.balance} 
            realtime={data.realtime} 
            onRefreshBalance={refreshData}
          />
          <AnalyticsCharts 
            trend={data.trend} 
            distribution={data.distribution} 
          />
          <HotRankings 
            hotPlans={data.hotPlansTree} 
          />
        </div>
      ) : (
        <div className="text-center py-12 text-gray-500">
          無法載入儀表盤數據
        </div>
      )}
    </div>
  )
}
