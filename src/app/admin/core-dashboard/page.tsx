'use client'

import { useState, useEffect } from 'react'
import ReactECharts from 'echarts-for-react'
import { Users, DollarSign, BarChart3, TrendingUp, Percent, Clock, Loader2, ArrowUpRight, Calendar } from 'lucide-react'

type Aggregation = 'day' | 'month' | 'quarter' | 'year'

export default function CoreDashboardPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  
  // Filters
  const [aggregation, setAggregation] = useState<Aggregation>('day')
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const params = new URLSearchParams({ aggregation, startDate, endDate })
        const res = await fetch(`/api/admin/metrics/core?${params.toString()}`)
        const json = await res.json()
        setData(json)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [aggregation, startDate, endDate])

  if (!data && loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
        <p className="text-gray-500 font-medium">數據計算中，請稍候...</p>
      </div>
    )
  }

  if (!data) return null
  const { trend, summary } = data

  const formatGrowth = (val: number) => {
    const p = (val * 100).toFixed(1)
    const isPos = val > 0
    return `<span style="color: ${isPos ? '#10b981' : '#f43f5e'}">${isPos ? '+' : ''}${p}%</span>`
  }

  const growthChartOptions = {
    tooltip: { 
      trigger: 'axis', 
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        let res = `<div style="font-weight:bold;margin-bottom:4px">${params[0].name}</div>`
        params.forEach((p: any) => {
          const item = trend[p.dataIndex]
          let growth = 0
          if (p.seriesName === '會員增長') growth = item.membersGrowth
          if (p.seriesName === '銷量增長') growth = item.volumeGrowth
          if (p.seriesName === '營收增長') growth = item.revenueGrowth
          
          res += `<div style="display:flex;justify-content:space-between;gap:20px;font-size:12px">
            <span>${p.marker} ${p.seriesName}</span>
            <span><b>${p.value}</b> (成長: ${formatGrowth(growth)})</span>
          </div>`
        })
        return res
      }
    },
    legend: { data: ['會員增長', '營收增長', '銷量增長'], bottom: 0 },
    grid: { left: '3%', right: '4%', bottom: '15%', containLabel: true },
    xAxis: {
      type: 'category',
      data: trend.map((t: any) => t.date),
      axisLine: { lineStyle: { color: '#cbd5e1' } }
    },
    yAxis: [
      { type: 'value', name: '人數/銷量', position: 'left' },
      { type: 'value', name: '金額', position: 'right', axisLabel: { formatter: '${value}' } }
    ],
    series: [
      {
        name: '會員增長',
        type: aggregation === 'day' ? 'bar' : 'line',
        smooth: true,
        data: trend.map((t: any) => t.members),
        itemStyle: { color: '#3b82f6' }
      },
      {
        name: '銷量增長',
        type: aggregation === 'day' ? 'bar' : 'line',
        smooth: true,
        data: trend.map((t: any) => t.volume),
        itemStyle: { color: '#10b981' }
      },
      {
        name: '營收增長',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        data: trend.map((t: any) => t.revenue),
        itemStyle: { color: '#f59e0b' },
        lineStyle: { width: 3 }
      }
    ]
  }

  const profitChartOptions = {
    tooltip: { trigger: 'axis' },
    legend: { data: ['營收', '成本', '利潤'], bottom: 0 },
    grid: { left: '3%', right: '0%', bottom: '15%', containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: trend.map((t: any) => t.date),
    },
    yAxis: { type: 'value', name: '金額 (NT$)' },
    series: [
      { name: '營收', type: 'line', smooth: true, data: trend.map((t: any) => t.revenue), itemStyle: { color: '#6366f1' } },
      { name: '成本', type: 'line', smooth: true, data: trend.map((t: any) => t.cost), itemStyle: { color: '#94a3b8' } },
      { name: '利潤', type: 'line', smooth: true, areaStyle: { opacity: 0.1 }, data: trend.map((t: any) => t.profit), itemStyle: { color: '#10b981' } }
    ]
  }

  const formatPrice = (p: number) => new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 }).format(p).replace('TWD', 'NT$')

  return (
    <div className="pb-10 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 tracking-tight">核心業務指標 (Core BI)</h1>
          <p className="text-gray-500 text-sm mt-1 flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5" />
            分析區間：{startDate} 至 {endDate} ({aggregation === 'day' ? '日' : aggregation === 'month' ? '月' : aggregation === 'quarter' ? '季' : '年'}級聚合)
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Aggregation Selection */}
          <div className="flex bg-gray-100 p-1 rounded-xl">
            {(['day', 'month', 'quarter', 'year'] as Aggregation[]).map(a => (
              <button
                key={a}
                onClick={() => setAggregation(a)}
                className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all ${aggregation === a ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {a === 'day' ? '日' : a === 'month' ? '月' : a === 'quarter' ? '季' : '年'}
              </button>
            ))}
          </div>

          {/* Date Picker */}
          <div className="flex items-center gap-2 bg-white border border-gray-200 p-1 rounded-xl shadow-sm">
            <input 
              type="date" 
              value={startDate} 
              onChange={e => setStartDate(e.target.value)}
              className="text-xs font-medium px-2 py-1 outline-none text-gray-600"
            />
            <span className="text-gray-300">|</span>
            <input 
              type="date" 
              value={endDate} 
              onChange={e => setEndDate(e.target.value)}
              className="text-xs font-medium px-2 py-1 outline-none text-gray-600"
            />
          </div>
        </div>
      </div>

      {loading && (
        <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-50 flex items-center justify-center rounded-2xl">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="區間總營收" value={formatPrice(summary.revenue)} icon={DollarSign} color="blue" />
        <MetricCard label="預估利潤" value={formatPrice(summary.profit)} icon={BarChart3} color="emerald" sub={`${(summary.margin * 100).toFixed(1)}% 毛利率`} />
        <MetricCard label="會員回購率" value={`${(summary.repurchaseRate * 100).toFixed(1)}%`} icon={Percent} color="indigo" />
        <MetricCard label="平均回購時長" value={`${summary.avgRepurchaseDays.toFixed(1)} 天`} icon={Clock} color="orange" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              業務增長與成長率分析
            </h3>
            <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded-md font-bold uppercase tracking-wider">Growth Trend</span>
          </div>
          <div className="h-[400px]">
            <ReactECharts option={growthChartOptions} style={{ height: '100%' }} />
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-emerald-500" />
              營收、成本與利潤分佈
            </h3>
            <span className="text-[10px] bg-emerald-50 text-emerald-600 px-2 py-1 rounded-md font-bold uppercase tracking-wider">Profitability</span>
          </div>
          <div className="h-[400px]">
            <ReactECharts option={profitChartOptions} style={{ height: '100%' }} />
          </div>
        </div>
      </div>

      {/* Retention Analysis Info */}
      <div className="bg-gray-900 rounded-2xl p-8 text-white flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="max-w-md">
          <h4 className="text-xl font-bold mb-2">留存與回購分析結論</h4>
          <p className="text-gray-400 text-sm leading-relaxed">
            目前您的平台回購率為 <span className="text-blue-400 font-bold">{(summary.repurchaseRate * 100).toFixed(1)}%</span>。
            通常會員在完成首次訂單後，平均會在 <span className="text-orange-400 font-bold">{summary.avgRepurchaseDays.toFixed(1)} 天</span> 內進行二次購買。
            建議在第 7-14 天針對高潛力會員發送促銷優惠以提升留存。
          </p>
        </div>
        <div className="flex gap-4">
           <div className="px-6 py-4 bg-gray-800 rounded-xl border border-gray-700 text-center min-w-[140px]">
              <div className="text-xs text-gray-500 mb-1">回購會員</div>
              <div className="text-2xl font-bold">{(summary.repurchaseRate * 100).toFixed(0)} <span className="text-sm font-normal text-gray-500">%</span></div>
           </div>
           <div className="px-6 py-4 bg-gray-800 rounded-xl border border-gray-700 text-center min-w-[140px]">
              <div className="text-xs text-gray-500 mb-1">回購週期</div>
              <div className="text-2xl font-bold">{summary.avgRepurchaseDays.toFixed(0)} <span className="text-sm font-normal text-gray-500">Days</span></div>
           </div>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value, icon: Icon, color, sub }: any) {
  const colors: any = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    orange: 'bg-orange-50 text-orange-600',
  }
  return (
    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative overflow-hidden group">
      <div className="flex items-center justify-between relative z-10">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {sub && <p className="text-[10px] font-medium text-emerald-600 mt-1 flex items-center gap-1"><ArrowUpRight className="w-2.5 h-2.5" /> {sub}</p>}
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 duration-300 ${colors[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  )
}

