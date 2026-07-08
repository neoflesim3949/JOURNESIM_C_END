'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CreditCard, Trash2, Plus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { mountAntom } from '@/lib/antom-sdk'

interface SavedCard {
  id: string
  last_four: string
  bin_code?: string | null
  card_type: string
  issuer: string
  provider?: string
  exp_month?: string | null
  exp_year?: string | null
  created_at: string
}

export default function CardsPage() {
  const [cards, setCards] = useState<SavedCard[]>([])
  const [loading, setLoading] = useState(true)
  const [cardTypeIcons, setCardTypeIcons] = useState<Record<string, string>>({})
  const [provider, setProvider] = useState<'tappay' | 'antom'>('tappay')
  const [binding, setBinding] = useState(false)   // 綁卡彈窗開啟
  const [bindLoading, setBindLoading] = useState(false)
  const [bindError, setBindError] = useState('')

  async function loadCards() {
    const cardsRes = await fetch('/api/shop/saved-cards').then((r) => r.json())
    setCards(Array.isArray(cardsRes) ? cardsRes : [])
  }

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth/login?next=/account/cards'; return }

      const [, configRes] = await Promise.all([
        loadCards(),
        fetch('/api/shop/tappay-config').then((r) => r.json()),
      ])
      setCardTypeIcons(configRes.cardTypeIcons || {})
      if (configRes.provider === 'antom') setProvider('antom')
      setLoading(false)
      // 綁卡導回（redirectUrl 帶 ?vaulted=1）→ 稍候刷新（notifyVaulting 為非同步）
      if (new URLSearchParams(window.location.search).get('vaulted')) {
        setTimeout(loadCards, 2500)
      }
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

  // 開始 Antom 綁卡：建立 vaulting session → 掛載 SDK 卡片元件
  async function startBinding() {
    setBinding(true); setBindError(''); setBindLoading(true)
    try {
      const s = await fetch('/api/shop/antom/vault-session', { method: 'POST' }).then((r) => r.json()).catch(() => null)
      if (!s?.vaultingSessionData) { setBindError(s?.error || '建立綁卡失敗，請確認後台 Antom 設定'); setBindLoading(false); return }
      // 等容器 render 後掛載
      setTimeout(async () => {
        try {
          await mountAntom(s.vaultingSessionData, '#antom-vault-container', s.environment === 'prod' ? 'prod' : 'sandbox')
        } catch (e) {
          setBindError('綁卡元件載入失敗：' + (e instanceof Error ? e.message : String(e)))
        } finally { setBindLoading(false) }
      }, 100)
    } catch (e) {
      setBindError(e instanceof Error ? e.message : String(e)); setBindLoading(false)
    }
  }

  function closeBinding() {
    setBinding(false); setBindError('')
    // 關閉後刷新卡片（可能剛綁成功）
    loadCards()
  }

  if (loading) return <div className="max-w-lg mx-auto px-4 py-16 text-center text-muted-foreground">載入中...</div>

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <Link href="/account" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="w-4 h-4" /> 返回帳戶
      </Link>

      <div className="mt-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">卡片管理</h1>
        {provider === 'antom' && (
          <button onClick={startBinding} className="inline-flex items-center gap-1.5 px-3 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover transition-colors">
            <Plus className="w-4 h-4" /> 綁定新卡
          </button>
        )}
      </div>

      {cards.length === 0 ? (
        <div className="mt-8 text-center py-16">
          <CreditCard className="mx-auto w-12 h-12 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">尚無儲存的卡片</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {provider === 'antom' ? '點右上「綁定新卡」新增，日後結帳可一鍵付款' : '在結帳時勾選「儲存此卡片」即可'}
          </p>
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
                  <div className="font-medium font-mono tracking-wide">
                    {card.bin_code ? `${card.bin_code} •••• ${card.last_four}` : `•••• •••• •••• ${card.last_four}`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {card.issuer || '信用卡'}
                    {card.exp_month && card.exp_year ? ` · ${card.exp_month}/${String(card.exp_year).slice(-2)}` : ''}
                  </div>
                </div>
              </div>
              <button onClick={() => handleDelete(card.id)} className="p-2 text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Antom 綁卡彈窗 */}
      {binding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeBinding}>
          <div className="w-full max-w-md bg-white rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">綁定信用卡</h3>
              <button onClick={closeBinding} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">卡號由 Antom 安全代碼化，本站不儲存卡號。</p>
            {bindError && <p className="mt-3 text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{bindError}</p>}
            {bindLoading && <p className="mt-4 text-sm text-muted-foreground text-center">載入綁卡元件中…</p>}
            <div id="antom-vault-container" className="mt-4" />
            <p className="mt-4 text-[11px] text-muted-foreground text-center">綁定完成後可能需數秒同步，關閉後將自動刷新卡片列表。</p>
          </div>
        </div>
      )}
    </div>
  )
}
