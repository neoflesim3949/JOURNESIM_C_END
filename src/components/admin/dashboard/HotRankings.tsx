'use client'

import { useState } from 'react'
import { PlusCircle, MinusCircle } from 'lucide-react'

export interface TreeItem {
  id: string
  name: string
  qty: number
  revenue: number
  children?: TreeItem[]
}

interface TreeTableProps {
  title: string
  data: TreeItem[]
}

function TreeRow({ item, level }: { item: TreeItem, level: number }) {
  const [expanded, setExpanded] = useState(false)
  const isOuter = level === 0;

  return (
    <>
      <tr className="hover:bg-gray-50/50 border-b border-gray-100 transition-colors group">
        <td className="px-4 py-3" style={{ paddingLeft: `${16 + level * 24}px` }}>
          <div className="flex items-center gap-2">
            {item.children && item.children.length > 0 ? (
              <button 
                onClick={() => setExpanded(!expanded)} 
                className="text-gray-400 hover:text-indigo-500 focus:outline-none"
              >
                {expanded ? (
                  <MinusCircle className="w-4 h-4" />
                ) : (
                  <PlusCircle className="w-4 h-4" />
                )}
              </button>
            ) : (
              <span className="w-4 h-4" /> // placeholder
            )}
            <span className={`${isOuter ? 'font-medium text-gray-800' : level === 1 ? 'text-gray-600 font-medium' : 'text-gray-500 text-xs font-mono'}`}>
              {item.name}
            </span>
          </div>
        </td>
        <td className="px-4 py-3 text-right text-gray-700">{item.qty.toLocaleString()}</td>
        <td className="px-4 py-3 text-right text-gray-600 font-mono">
          <span className="text-gray-400 mr-1">$</span>{item.revenue.toLocaleString()}
        </td>
      </tr>
      {expanded && item.children && item.children.map((child) => (
        <TreeRow key={child.id} item={child} level={level + 1} />
      ))}
    </>
  )
}

function TreeTable({ title, data }: TreeTableProps) {
  const [page, setPage] = useState(1)
  const pageSize = 10
  const totalPages = Math.ceil(data.length / pageSize)
  const currentData = data.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
      </div>
      
      <div className="overflow-x-auto border border-gray-100 rounded-lg">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">商品組 / 方案</th>
              <th className="px-4 py-3 font-medium text-right w-32">數量</th>
              <th className="px-4 py-3 font-medium text-right w-40">結算金額</th>
            </tr>
          </thead>
          <tbody>
            {currentData.length > 0 ? (
              currentData.map((item) => (
                <TreeRow key={item.id} item={item} level={0} />
              ))
            ) : (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                  尚無數據
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
          <div>共 {data.length} 個頂層排行</div>
          <div className="flex gap-1">
            <button 
              disabled={page === 1} 
              onClick={() => setPage(page - 1)}
              className="px-3 py-1.5 rounded-md border border-gray-200 disabled:opacity-50 hover:bg-gray-50"
            >
              上一頁
            </button>
            <button 
              disabled={page === totalPages} 
              onClick={() => setPage(page + 1)}
              className="px-3 py-1.5 rounded-md border border-gray-200 disabled:opacity-50 hover:bg-gray-50"
            >
              下一頁
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface Props {
  hotPlans: TreeItem[]
}

export function HotRankings({ hotPlans }: Props) {
  return (
    <div className="mt-6">
      <TreeTable title="熱門方案及套餐排行" data={hotPlans} />
    </div>
  )
}
