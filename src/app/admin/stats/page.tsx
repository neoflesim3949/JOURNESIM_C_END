'use client'

import { BarChart3 } from 'lucide-react'

// 統計分析（待規劃）— 先做明細列表，分析維度依明細結果再定
export default function StatsAnalysisPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">統計分析</h1>
      <p className="mt-1 text-sm text-gray-500">營運分析圖表</p>
      <div className="mt-8 text-center py-20 bg-white rounded-xl border border-gray-200">
        <BarChart3 className="w-10 h-10 mx-auto text-gray-300" />
        <p className="mt-3 text-gray-500">分析維度規劃中</p>
        <p className="mt-1 text-xs text-gray-400">先用「統計明細列表」把資料拉出來，再決定要做哪些分析</p>
      </div>
    </div>
  )
}
