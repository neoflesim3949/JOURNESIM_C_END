'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { CountryModal } from '@/components/shop/country-modal'

interface Country {
  mcc: string
  name: string
  flag_url: string | null
}

interface ProductSummary {
  id: string; name: string; product_type: string; lowest_price: number | null
}

export function PopularCountries() {
  const [countries, setCountries] = useState<Country[]>([])
  const [loading, setLoading] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  // 彈窗
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null)
  const [products, setProducts] = useState<ProductSummary[]>([])
  const [productsLoading, setProductsLoading] = useState(false)

  useEffect(() => {
    fetch('/api/shop/popular-countries')
      .then((r) => r.json())
      .then(setCountries)
      .finally(() => setLoading(false))
  }, [])

  function updateScrollButtons() {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10)
  }

  useEffect(() => {
    updateScrollButtons()
    window.addEventListener('resize', updateScrollButtons)
    return () => window.removeEventListener('resize', updateScrollButtons)
  }, [countries])

  function scroll(dir: 'left' | 'right') {
    const el = scrollRef.current
    if (!el) return
    const amount = el.clientWidth * 0.8
    el.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' })
    setTimeout(updateScrollButtons, 300)
  }

  async function openCountry(c: Country) {
    setSelectedCountry(c)
    setProducts([])
    setProductsLoading(true)
    const res = await fetch(`/api/shop/country-products?mcc=${c.mcc}`)
    if (res.ok) setProducts(await res.json())
    setProductsLoading(false)
  }

  if (loading || countries.length === 0) return null

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h2 className="text-2xl font-bold text-center">熱門目的地</h2>
      <p className="mt-2 text-center text-muted-foreground">最多旅客選擇的上網方案</p>

      <div className="mt-10 relative">
        {canScrollLeft && (
          <button onClick={() => scroll('left')}
            className="hidden lg:flex absolute -left-5 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-white border border-border rounded-full items-center justify-center shadow-md hover:shadow-lg transition-shadow">
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        <div ref={scrollRef} onScroll={updateScrollButtons}
          className="flex gap-4 overflow-x-auto scrollbar-hide lg:overflow-x-hidden"
          style={{ scrollSnapType: 'x mandatory' }}>
          {countries.map((c, i) => (
            <button key={c.mcc} onClick={() => openCountry(c)}
              className={`flex-shrink-0 flex flex-col items-center gap-3 p-4 rounded-xl border border-border hover:border-primary hover:shadow-md transition-all w-[calc(25%-12px)] sm:w-[calc(25%-12px)] lg:w-[calc(12.5%-14px)] ${i >= 8 ? 'hidden sm:flex lg:flex' : ''}`}
              style={{ scrollSnapAlign: 'start' }}>
              {c.flag_url ? (
                <Image src={c.flag_url} alt={c.name} width={56} height={56} className="w-14 h-14 rounded-full object-cover shadow-sm" />
              ) : (
                <div className="w-14 h-14 bg-muted rounded-full" />
              )}
              <span className="text-sm font-medium text-center">{c.name}</span>
            </button>
          ))}
        </div>

        {canScrollRight && (
          <button onClick={() => scroll('right')}
            className="hidden lg:flex absolute -right-5 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-white border border-border rounded-full items-center justify-center shadow-md hover:shadow-lg transition-shadow">
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="mt-8 text-center">
        <Link href="/shop" className="inline-flex items-center text-sm font-medium text-primary hover:underline">
          查看所有國家 &rarr;
        </Link>
      </div>

      {/* 彈窗 */}
      {selectedCountry && (
        <CountryModal
          country={{ mcc: selectedCountry.mcc, name: selectedCountry.name, flag_url: selectedCountry.flag_url }}
          products={products}
          loading={productsLoading}
          onClose={() => setSelectedCountry(null)}
        />
      )}
    </section>
  )
}
