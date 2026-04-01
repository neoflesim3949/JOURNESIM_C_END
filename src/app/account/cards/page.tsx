'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CreditCard, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface SavedCard {
  id: string
  last_four: string
  card_type: string
  issuer: string
  created_at: string
}

export default function CardsPage() {
  const [cards, setCards] = useState<SavedCard[]>([])
  const [loading, setLoading] = useState(true)
  const [cardTypeIcons, setCardTypeIcons] = useState<Record<string, string>>({})

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth/login?next=/account/cards'; return }

      const [cardsRes, configRes] = await Promise.all([
        fetch('/api/shop/saved-cards').then((r) => r.json()),
        fetch('/api/shop/tappay-config').then((r) => r.json()),
      ])
      setCards(cardsRes)
      setCardTypeIcons(configRes.cardTypeIcons || {})
      setLoading(false)
    }
    load()
  }, [])

  async function handleDelete(cardId: string) {
    if (!confirm('確定要刪除此卡片？')) return
    await fetch('/api/shop/saved-cards', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cardId }),
    })
    setCards((prev) => prev.filter((c) => c.id !== cardId))
  }

  if (loading) return <div className="max-w-lg mx-auto px-4 py-16 text-center text-muted-foreground">載入中...</div>

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <Link href="/account" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="w-4 h-4" /> 返回帳戶
      </Link>

      <h1 className="mt-6 text-2xl font-bold">卡片管理</h1>

      {cards.length === 0 ? (
        <div className="mt-8 text-center py-16">
          <CreditCard className="mx-auto w-12 h-12 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">尚無儲存的卡片</h2>
          <p className="mt-2 text-sm text-muted-foreground">在結帳時勾選「儲存此卡片」即可</p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {cards.map((card) => (
            <div key={card.id} className="flex items-center justify-between p-4 bg-white border border-border rounded-xl">
              <div className="flex items-center gap-4">
                {cardTypeIcons[card.card_type] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cardTypeIcons[card.card_type]} alt="" className="w-10 h-7 object-contain" />
                ) : (
                  <div className="w-10 h-7 bg-muted rounded flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <div className="font-medium">•••• •••• •••• {card.last_four}</div>
                  <div className="text-xs text-muted-foreground">{card.issuer || '信用卡'}</div>
                </div>
              </div>
              <button onClick={() => handleDelete(card.id)} className="p-2 text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
