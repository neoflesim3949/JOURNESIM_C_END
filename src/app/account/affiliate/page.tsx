'use client'

import { useEffect, useState } from 'react'
import { Copy, Users, Award, History, Wallet, CheckCircle2, Clock, Info, ArrowLeft, Share2, HelpCircle } from 'lucide-react'
import Link from 'next/link'

interface AffiliateData {
  member: {
    id: string
    referral_code: string
    member_tiers: {
        name: string
        l1_rate: number
        l2_rate: number
    }
  }
  referral_count: number
  friends: Array<{
    email: string
    created_at: string
  }>
}

export default function AffiliatePage() {
  const [data, setData] = useState<AffiliateData | null>(null)
  const [loading, setLoading] = useState(true)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/account/affiliate')
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text)
    setCopyStatus(type)
    setTimeout(() => setCopyStatus(null), 2000)
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground italic">載入中...</div>
  if (!data || !data.member) return <div className="p-8 text-center text-muted-foreground">無法載入個人資料，請先登入。</div>

  const referralCode = data.member.referral_code || '---'
  const referralLink = `${window.location.origin}?ref=${referralCode}`

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <Link href="/account" className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={20} />
        </Link>
        <h1 className="text-lg font-bold">聯盟行銷</h1>
        <div className="w-8" />
      </div>

      {/* Hero / Promo Box */}
      <div className="p-8 rounded-[2rem] bg-gradient-to-br from-[#8E2DE2] to-[#4A00E0] text-white shadow-2xl relative overflow-hidden group">
         <div className="absolute top-0 right-0 p-4 opacity-20 transform translate-x-4 -translate-y-4">
             <div className="flex -space-x-8">
                <div className="w-24 h-24 bg-white/20 rounded-full backdrop-blur-sm" />
                <div className="w-24 h-24 bg-white/10 rounded-full backdrop-blur-sm mt-12" />
             </div>
         </div>
         <div className="relative z-10 text-center space-y-4">
            <h2 className="text-3xl font-black italic tracking-tighter">最高可賺取 6%</h2>
            <p className="text-white/70 text-sm font-medium">邀請好友加入，獲得 F Point 獎勵</p>
            <div className="pt-4 flex justify-center gap-4">
                <div className="px-4 py-2 bg-white/10 rounded-2xl backdrop-blur-md border border-white/10">
                   <p className="text-[10px] text-white/50 uppercase font-bold tracking-widest">您的等級</p>
                   <p className="text-sm font-bold mt-1 text-yellow-400">{data.member.member_tiers?.name || '白銀會員'}</p>
                </div>
                <div className="px-4 py-2 bg-white/10 rounded-2xl backdrop-blur-md border border-white/10 text-center">
                   <p className="text-[10px] text-white/50 uppercase font-bold tracking-widest">推薦人數</p>
                   <p className="text-sm font-bold mt-1">{data.referral_count} 人</p>
                </div>
            </div>
         </div>
      </div>

      {/* Share Section */}
      <div className="space-y-4">
         <div className="flex items-center gap-2 text-sm font-bold px-2">
            <Share2 className="w-4 h-4 text-purple-600" /> 分享與邀請
         </div>
         <div className="grid gap-3">
             <div className="p-5 bg-white border border-border rounded-2xl flex flex-col gap-3">
                <p className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">個人推薦碼</p>
                <div className="flex items-center justify-between">
                   <span className="text-2xl font-black tracking-[0.2em]">{data.member.referral_code}</span>
                   <button 
                     onClick={() => copyToClipboard(data.member.referral_code, 'code')}
                     className={`p-2.5 rounded-xl transition-all ${copyStatus === 'code' ? 'bg-green-50 text-green-600' : 'bg-purple-50 text-purple-600'}`}
                   >
                     {copyStatus === 'code' ? <CheckCircle2 size={18} /> : <Copy size={18} />}
                   </button>
                </div>
             </div>
             
             <div className="p-5 bg-white border border-border rounded-2xl flex flex-col gap-3">
                <p className="text-[10px] uppercase font-black text-muted-foreground tracking-widest">專屬推廣連結</p>
                <div className="flex items-center justify-between gap-4">
                   <span className="flex-1 truncate text-xs font-medium text-muted-foreground">{referralLink}</span>
                   <button 
                     onClick={() => copyToClipboard(referralLink, 'link')}
                     className={`p-2.5 rounded-xl transition-all flex-shrink-0 ${copyStatus === 'link' ? 'bg-green-50 text-green-600' : 'bg-purple-50 text-purple-600'}`}
                   >
                     {copyStatus === 'link' ? <CheckCircle2 size={18} /> : <Copy size={18} />}
                   </button>
                </div>
             </div>
         </div>
      </div>

      {/* List of Friends */}
      <div className="space-y-4">
         <div className="flex items-center gap-2 text-sm font-bold px-2">
            <Users className="w-4 h-4 text-purple-600" /> 已推薦好友
         </div>
         <div className="bg-white border border-border rounded-2xl overflow-hidden divide-y divide-border">
            {data.friends.map((friend, i) => (
                <div key={i} className="px-5 py-4 flex items-center justify-between group hover:bg-muted/30 transition-colors">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 font-bold">
                         {friend.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-foreground">{friend.email.replace(/(.{3}).*(@.*)/, '$1***$2')}</p>
                        <p className="text-[9px] text-muted-foreground mt-0.5">註冊時間: {new Date(friend.created_at).toLocaleDateString()}</p>
                      </div>
                   </div>
                   <div className="px-2 py-1 bg-green-50 text-green-600 text-[9px] font-black rounded uppercase tracking-tighter">
                      已綁定
                   </div>
                </div>
            ))}
            {data.friends.length === 0 && (
                <div className="py-12 text-center text-muted-foreground text-xs italic bg-muted/10">
                    尚無好友明細
                </div>
            )}
         </div>
      </div>

      {/* Rules Section */}
      <div className="p-6 bg-muted/50 rounded-[2rem] border border-border/50">
         <h3 className="flex items-center gap-2 text-sm font-bold mb-4">
            <HelpCircle className="w-4 h-4 text-purple-600" /> 推廣計畫說明
         </h3>
         <ol className="space-y-6">
            {[
                { step: '01', title: '獲取推薦碼', desc: '在推廣頁面複製您的專屬推薦碼或連結' },
                { step: '02', title: '分享給好友', desc: '好友透過連結註冊或輸入推薦碼，即永久綁定' },
                { step: '03', title: '好友下單', desc: '當好友完成第一筆訂單，您將獲得 F Point 首購加碼獎勵' },
                { step: '04', title: '長期分潤', desc: '後續好友的每一筆訂單，您皆可獲得 4%~6% 的點數回饋' },
                { step: '05', title: '級差遞補', desc: '晉升黃金或鑽石級，可額外獲取下級團隊的分潤差額獎勵' }
            ].map((item, i) => (
                <li key={i} className="flex gap-4 group">
                    <span className="flex-shrink-0 w-8 h-8 rounded-full bg-white border border-border flex items-center justify-center text-xs font-black text-purple-600 shadow-sm group-hover:scale-110 transition-transform">
                        {item.step}
                    </span>
                    <div>
                        <p className="text-xs font-bold text-foreground">{item.title}</p>
                        <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{item.desc}</p>
                    </div>
                </li>
            ))}
         </ol>
      </div>

    </div>
  )
}
