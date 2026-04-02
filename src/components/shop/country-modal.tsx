'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { X, ChevronRight } from 'lucide-react'
import { formatPrice } from '@/lib/utils'

interface BCCountry {
  mcc: string
  name: string
  flag_url: string | null
}

interface ProductSummary {
  id: string
  name: string
  product_type: string
  lowest_price: number | null
}

interface CountryModalProps {
  country: BCCountry
  products: ProductSummary[]
  loading: boolean
  onClose: () => void
  defaultTab?: 'esim' | 'sim'
}

export function CountryModal({ country, products, loading, onClose, defaultTab = 'esim' }: CountryModalProps) {
  const esimProducts = useMemo(() => products.filter((p) => p.product_type === 'esim'), [products])
  const simProducts = useMemo(() => products.filter((p) => p.product_type === 'sim'), [products])

  const hasEsim = esimProducts.length > 0
  const hasSim = simProducts.length > 0
  const hasBothTypes = hasEsim && hasSim

  const [activeTab, setActiveTab] = useState<'esim' | 'sim'>(defaultTab)

  const displayProducts = activeTab === 'esim' ? esimProducts : simProducts

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[70vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-5 pb-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {country.flag_url ? (
                <Image src={country.flag_url} alt={country.name} width={40} height={40} className="w-10 h-10 rounded-full object-cover shadow" />
              ) : (
                <div className="w-10 h-10 bg-muted rounded-full" />
              )}
              <h2 className="text-xl font-bold">{country.name}</h2>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          {hasBothTypes && (
            <div className="mt-4 flex rounded-lg overflow-hidden border border-border">
              <button
                onClick={() => setActiveTab('esim')}
                className={`flex-1 py-2 text-sm font-medium text-center transition-colors ${
                  activeTab === 'esim' ? 'bg-primary text-white' : 'bg-white text-foreground hover:bg-muted'
                }`}
              >
                eSIM
              </button>
              <button
                onClick={() => setActiveTab('sim')}
                className={`flex-1 py-2 text-sm font-medium text-center transition-colors ${
                  activeTab === 'sim' ? 'bg-primary text-white' : 'bg-white text-foreground hover:bg-muted'
                }`}
              >
                SIM 卡
              </button>
            </div>
          )}

        </div>

        {/* Products */}
        <div className="flex-1 overflow-y-auto p-5 pt-4">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">載入中...</div>
          ) : displayProducts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {products.length === 0 ? '此國家尚無上架方案' : `暫無${activeTab === 'esim' ? 'eSIM' : 'SIM 卡'}方案`}
            </div>
          ) : (
            <div className="space-y-3">
              {displayProducts.map((p) => (
                <Link
                  key={p.id}
                  href={`/shop/${country.mcc}/${p.id}`}
                  onClick={onClose}
                  className="flex items-center justify-between p-4 border border-border rounded-xl hover:border-primary hover:shadow-sm transition-all"
                >
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    {p.lowest_price && p.lowest_price > 0 && (
                      <div className="text-sm text-muted-foreground mt-0.5">
                        起價 {formatPrice(p.lowest_price)}
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
