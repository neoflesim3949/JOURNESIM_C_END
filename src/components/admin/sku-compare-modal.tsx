'use client'

import { useState, useCallback } from 'react'
import { Upload, X, FileSpreadsheet, AlertTriangle, CheckCircle } from 'lucide-react'
import * as XLSX from 'xlsx'

interface CompareResult {
  /** Excel 有、資料庫沒有 */
  missingInDb: { sku: string; name: string }[]
  /** 資料庫有、Excel 沒有 */
  missingInExcel: { sku: string; name: string }[]
  /** 兩邊都有 */
  matched: number
  excelTotal: number
  dbTotal: number
}

interface Props {
  open: boolean
  onClose: () => void
  planType: 'esim' | 'sim' | 'acceleration'
  title: string
}

export default function SkuCompareModal({ open, onClose, planType, title }: Props) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CompareResult | null>(null)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')

  const reset = useCallback(() => {
    setResult(null)
    setError('')
    setFileName('')
  }, [])

  function handleClose() {
    reset()
    onClose()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setError('')
    setResult(null)
    setFileName(file.name)
    setLoading(true)

    try {
      // 1. 解析 Excel
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })

      // 從所有工作表收集 SKU
      const excelSkus = new Map<string, string>() // sku -> name

      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName]
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

        for (const row of rows) {
          // 嘗試找到 SKU 欄位（第一欄通常是「編号」）
          const sku = String(
            row['编号'] || row['編號'] || row['編号'] || row['SKU'] || row['sku_id'] || row['skuId'] ||
            // fallback: 取第一個欄位
            Object.values(row)[0] || ''
          ).trim()

          if (!sku || sku === '编号' || sku === '編號' || sku === '編号') continue

          // 套餐名稱通常是第二欄
          const name = String(
            row['套餐名称'] || row['套餐名稱'] || row['商品名称'] || row['商品名稱'] || row['name'] ||
            Object.values(row)[1] || ''
          ).trim()

          if (/^\d{10,}$/.test(sku)) {
            excelSkus.set(sku, name)
          }
        }
      }

      if (excelSkus.size === 0) {
        setError('無法從 Excel 中解析到有效的 SKU ID（需為 10 位以上數字）')
        setLoading(false)
        return
      }

      // 2. 拉取資料庫 SKU
      const res = await fetch(`/api/admin/plans/skus?type=${planType}`)
      if (!res.ok) throw new Error('無法取得資料庫 SKU 列表')
      const { skus: dbSkus } = await res.json() as { skus: { sku_id: string; name: string }[] }

      const dbMap = new Map(dbSkus.map((s: { sku_id: string; name: string }) => [s.sku_id, s.name]))

      // 3. 比對
      const missingInDb: { sku: string; name: string }[] = []
      const missingInExcel: { sku: string; name: string }[] = []

      for (const [sku, name] of excelSkus) {
        if (!dbMap.has(sku)) {
          missingInDb.push({ sku, name })
        }
      }

      for (const [sku, name] of dbMap) {
        if (!excelSkus.has(sku)) {
          missingInExcel.push({ sku, name })
        }
      }

      const matched = excelSkus.size - missingInDb.length

      setResult({
        missingInDb,
        missingInExcel,
        matched,
        excelTotal: excelSkus.size,
        dbTotal: dbMap.size,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '解析失敗')
    } finally {
      setLoading(false)
      // 清除 input 以允許重複上傳同一檔案
      e.target.value = ''
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={handleClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold">{title} — Excel 比對</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-xl">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Upload */}
          <label className="flex flex-col items-center gap-3 p-8 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors">
            <Upload className="w-8 h-8 text-gray-400" />
            <div className="text-center">
              <div className="text-sm font-medium text-gray-700">
                {fileName ? fileName : '點擊上傳億點 Excel 檔案'}
              </div>
              <div className="text-xs text-gray-400 mt-1">支援 .xlsx / .xls，會自動讀取所有工作表的第一欄作為 SKU</div>
            </div>
            <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
          </label>

          {loading && (
            <div className="mt-6 text-center text-sm text-gray-500">比對中...</div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {result && (
            <div className="mt-6 space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-blue-50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-blue-700">{result.excelTotal}</div>
                  <div className="text-xs text-blue-600 mt-1">Excel 商品數</div>
                </div>
                <div className="p-3 bg-green-50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-green-700">{result.dbTotal}</div>
                  <div className="text-xs text-green-600 mt-1">資料庫商品數</div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg text-center">
                  <div className="text-2xl font-bold text-gray-700">{result.matched}</div>
                  <div className="text-xs text-gray-500 mt-1">匹配數量</div>
                </div>
              </div>

              {/* Missing in DB */}
              <div>
                <div className="flex items-center gap-2 text-sm font-medium mb-2">
                  <AlertTriangle className="w-4 h-4 text-orange-500" />
                  <span className="text-orange-700">Excel 有、資料庫沒有</span>
                  <span className="text-orange-500">（{result.missingInDb.length}）</span>
                </div>
                {result.missingInDb.length === 0 ? (
                  <div className="p-3 bg-green-50 rounded-lg text-sm text-green-600 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" /> 無缺少項目
                  </div>
                ) : (
                  <div className="border border-orange-200 rounded-lg overflow-hidden max-h-[200px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-orange-50 text-orange-700 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium w-48">SKU ID</th>
                          <th className="text-left px-3 py-2 font-medium">套餐名稱</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-orange-100">
                        {result.missingInDb.map((item) => (
                          <tr key={item.sku} className="hover:bg-orange-50/50">
                            <td className="px-3 py-1.5 font-mono text-xs">{item.sku}</td>
                            <td className="px-3 py-1.5 text-xs truncate max-w-[300px]">{item.name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Missing in Excel */}
              <div>
                <div className="flex items-center gap-2 text-sm font-medium mb-2">
                  <FileSpreadsheet className="w-4 h-4 text-purple-500" />
                  <span className="text-purple-700">資料庫有、Excel 沒有</span>
                  <span className="text-purple-500">（{result.missingInExcel.length}）</span>
                </div>
                {result.missingInExcel.length === 0 ? (
                  <div className="p-3 bg-green-50 rounded-lg text-sm text-green-600 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" /> 無多餘項目
                  </div>
                ) : (
                  <div className="border border-purple-200 rounded-lg overflow-hidden max-h-[200px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-purple-50 text-purple-700 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium w-48">SKU ID</th>
                          <th className="text-left px-3 py-2 font-medium">套餐名稱</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-purple-100">
                        {result.missingInExcel.map((item) => (
                          <tr key={item.sku} className="hover:bg-purple-50/50">
                            <td className="px-3 py-1.5 font-mono text-xs">{item.sku}</td>
                            <td className="px-3 py-1.5 text-xs truncate max-w-[300px]">{item.name}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
