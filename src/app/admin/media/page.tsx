'use client'

import { useEffect, useState, useRef } from 'react'
import { Upload, Trash2, Copy, CheckCircle, Image as ImageIcon, Search } from 'lucide-react'

interface MediaFile {
  name: string
  size: number
  type: string
  created_at: string
  url: string
}

export default function AdminMediaPage() {
  const [files, setFiles] = useState<MediaFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState('')
  const [copiedUrl, setCopiedUrl] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function loadFiles() {
    const res = await fetch('/api/admin/media')
    if (res.ok) setFiles(await res.json())
    setLoading(false)
  }

  useEffect(() => { loadFiles() }, [])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return

    setUploading(true)
    for (let i = 0; i < fileList.length; i++) {
      const formData = new FormData()
      formData.append('file', fileList[i])
      await fetch('/api/admin/media', { method: 'POST', body: formData })
    }
    setUploading(false)
    await loadFiles()
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleDelete(name: string) {
    if (!confirm(`確定要刪除 ${name}？`)) return
    await fetch('/api/admin/media', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    await loadFiles()
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url)
    setCopiedUrl(url)
    setTimeout(() => setCopiedUrl(''), 2000)
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const filtered = search
    ? files.filter((f) => f.name.toLowerCase().includes(search.toLowerCase()))
    : files

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">圖片庫</h1>
          <p className="mt-1 text-sm text-gray-500">上傳和管理圖片，可用於付款方式 Icon、商品圖片等</p>
        </div>
        <label className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 cursor-pointer ${uploading ? 'opacity-50' : ''}`}>
          <Upload className="w-4 h-4" />
          {uploading ? '上傳中...' : '上傳圖片'}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      {/* Search */}
      <div className="mt-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="搜尋檔案名稱..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>

      {/* File Grid */}
      {loading ? (
        <p className="mt-8 text-sm text-gray-500">載入中...</p>
      ) : filtered.length === 0 ? (
        <div className="mt-8 text-center py-16 bg-white rounded-xl border border-gray-200">
          <ImageIcon className="mx-auto w-12 h-12 text-gray-300" />
          <p className="mt-4 text-gray-500">{files.length === 0 ? '尚無圖片，點擊上方「上傳圖片」' : '找不到符合的圖片'}</p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {filtered.map((file) => (
            <div key={file.name} className="group bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-all">
              {/* Preview */}
              <div className="aspect-square bg-gray-50 flex items-center justify-center p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={file.url} alt={file.name} className="max-w-full max-h-full object-contain" />
              </div>

              {/* Info */}
              <div className="p-2">
                <div className="text-xs font-medium truncate" title={file.name}>{file.name}</div>
                <div className="text-xs text-gray-400 mt-0.5">{formatSize(file.size)}</div>

                {/* Actions */}
                <div className="mt-2 flex gap-1">
                  <button
                    onClick={() => copyUrl(file.url)}
                    className="flex-1 flex items-center justify-center gap-1 px-2 py-1 bg-gray-50 hover:bg-blue-50 text-xs text-gray-600 hover:text-blue-600 rounded transition-colors"
                    title="複製 URL"
                  >
                    {copiedUrl === file.url ? <CheckCircle className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                    {copiedUrl === file.url ? '已複製' : '複製'}
                  </button>
                  <button
                    onClick={() => handleDelete(file.name)}
                    className="px-2 py-1 bg-gray-50 hover:bg-red-50 text-xs text-gray-400 hover:text-red-500 rounded transition-colors"
                    title="刪除"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 text-xs text-gray-400">
        共 {files.length} 個檔案 · 支援 PNG / JPG / GIF / SVG / WebP / ICO
      </div>
    </div>
  )
}
