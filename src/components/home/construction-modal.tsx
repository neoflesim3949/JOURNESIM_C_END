'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

export function ConstructionModal() {
  const [open, setOpen] = useState(false)
  const [logo, setLogo] = useState('')

  useEffect(() => {
    const finish = (url: string) => { setLogo(url); setOpen(true) }
    fetch('/api/shop/site-config')
      .then(r => r.json())
      .then(c => {
        const url = c.logo || ''
        if (!url) { finish(''); return }
        const img = new window.Image()
        img.onload = () => finish(url)
        img.onerror = () => finish('')
        img.src = url
      })
      .catch(() => finish(''))
  }, [])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl px-8 py-10"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={() => setOpen(false)}
          aria-label="關閉"
          className="absolute top-4 right-4 p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex justify-center">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="FLESIM" className="h-16 w-auto object-contain" />
          ) : (
            <span className="text-3xl font-bold text-primary">FLESIM</span>
          )}
        </div>

        <p className="mt-8 text-xl font-bold text-center text-gray-900">
          努力建設中
        </p>
        <p className="mt-3 text-xl font-bold text-center text-gray-600">
          即將提供為您服務
        </p>
        <p className="mt-3 text-xl font-bold text-center text-red-600">
          請勿進入下單
        </p>
        <p className="mt-3 text-xl font-bold text-center text-gray-900">
          COMING SOON...
        </p>

        <button
          onClick={() => setOpen(false)}
          className="mt-8 w-full py-3 bg-black text-white font-semibold rounded-full hover:bg-gray-800 transition"
        >
          我知道了
        </button>
      </div>
    </div>
  )
}
