'use client'

import { useState } from 'react'
import ReactECharts from 'echarts-for-react'

interface TrendData {
  date: string
  revenue: number
  skusCount: number
  ordersCount: number
}

interface DistData {
  name: string
  value: number
}

interface Props {
  trend: TrendData[]
  distribution: {
    inner: DistData[]
    outer: DistData[]
  }
}

export function AnalyticsCharts({ trend, distribution }: Props) {
  const [metric, setMetric] = useState<'revenue' | 'volume'>('revenue')

  const donutOptions = {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    series: [
      {
        name: '物理類型',
        type: 'pie',
        selectedMode: 'single',
        radius: [0, '40%'],
        label: { position: 'inner', fontSize: 11, color: '#fff' },
        labelLine: { show: false },
        data: distribution.inner,
        color: ['#6366f1', '#10b981', '#f59e0b']
      },
      {
        name: '地理分佈',
        type: 'pie',
        radius: ['55%', '75%'],
        label: {
          formatter: '{b} \n{c}',
          backgroundColor: '#F6F8FC',
          borderColor: '#8C8D8E',
          borderWidth: 1,
          borderRadius: 4,
          padding: [4, 7],
          color: '#475569'
        },
        data: distribution.outer.sort((a,b) => b.value - a.value),
        color: ['#3b82f6', '#0ea5e9', '#06b6d4', '#14b8a6', '#22c55e', '#8b5cf6', '#d946ef', '#f43f5e']
      }
    ]
  }

  const isRevenue = metric === 'revenue'

  const trendOptions = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
    legend: { 
      data: isRevenue ? ['銷售額'] : ['套餐量', '訂單量'], 
      bottom: 0 
    },
    grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
    xAxis: [
      {
        type: 'category',
        boundaryGap: false,
        data: trend.map(t => t.date.slice(5)), // MM-DD
        axisLine: { lineStyle: { color: '#cbd5e1' } },
        axisLabel: { color: '#64748b' }
      }
    ],
    yAxis: [
      {
        type: 'value',
        name: isRevenue ? '金額 (NT$)' : '數量',
        position: 'left',
        axisLine: { show: true, lineStyle: { color: isRevenue ? '#6366f1' : '#94a3b8' } },
        axisLabel: { formatter: '{value}' },
        splitLine: { lineStyle: { type: 'dashed', color: '#f1f5f9' } }
      }
    ],
    series: isRevenue ? [
      {
        name: '銷售額',
        type: 'line',
        smooth: true,
        itemStyle: { color: '#6366f1' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: 'rgba(99, 102, 241, 0.4)' }, { offset: 1, color: 'rgba(99, 102, 241, 0)' }]
          }
        },
        data: trend.map(t => t.revenue)
      }
    ] : [
      {
        name: '套餐量',
        type: 'line',
        smooth: true,
        itemStyle: { color: '#6366f1' },
        lineStyle: { width: 3 },
        data: trend.map(t => t.skusCount)
      },
      {
        name: '訂單量',
        type: 'line',
        smooth: true,
        itemStyle: { color: '#f43f5e' },
        lineStyle: { width: 2, type: 'dashed' },
        data: trend.map(t => t.ordersCount)
      }
    ]
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm lg:col-span-1">
        <h3 className="text-base font-semibold text-gray-800 mb-2">套餐物理與區域分佈</h3>
        <div className="h-[350px]">
          <ReactECharts option={donutOptions} style={{ height: '100%', width: '100%' }} />
        </div>
      </div>
      <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm lg:col-span-2">
         <div className="flex items-center justify-between mb-2">
           <h3 className="text-base font-semibold text-gray-800">銷售趨勢分析</h3>
           <div className="flex bg-gray-100 p-1 rounded-lg">
             <button 
               onClick={() => setMetric('revenue')}
               className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${metric === 'revenue' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
             >
               金額
             </button>
             <button 
               onClick={() => setMetric('volume')}
               className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${metric === 'volume' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
             >
               數量
             </button>
           </div>
         </div>
         <div className="h-[350px]">
           <ReactECharts option={trendOptions} style={{ height: '100%', width: '100%' }} key={metric} />
         </div>
      </div>
    </div>
  )
}

