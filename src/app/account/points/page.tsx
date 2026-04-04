'use client'

import { useEffect, useState } from 'react'
import { Wallet, History, ArrowLeft, Ticket, CheckCircle2, AlertCircle, Clock } from 'lucide-react'
import Link from 'next/link'
import { formatPrice } from '@/lib/utils'

interface PointsData {
  member: {
    points: number
  }
  point_logs: Array<{
    id: string
    amount: number
    point_type: string
    status: string
    created_at: string
    available_at?: string
  }>
}

export default function FPointsPage() {
  const [data, setData] = useState<PointsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [redeemCode, setRedeemCode] = useState('')
  const [redeemLoading, setRedeemLoading] = useState(false)

  useEffect(() => {
    fetch('/api/account/affiliate')
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  async function handleRedeem() {
    if (!redeemCode) return
    setRedeemLoading(true)
    // 預留兌換碼 API 介面
    setTimeout(() => {
        alert('兌換碼功能即將上線')
        setRedeemLoading(false)
    }, 1000)
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground italic">載入中...</div>
  if (!data) return <div className="p-8 text-center text-muted-foreground">無法載入資料</div>

  return (
    <div className="max-w-lg mx-auto px-4 py-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <Link href="/account" className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={20} />
        </Link>
        <h1 className="text-lg font-bold">F Point 管理</h1>
        <div className="w-8" />
      </div>

      {/* Balance Box */}
      <div className="p-8 rounded-[2rem] bg-gray-900 text-white shadow-2xl relative overflow-hidden group">
         <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <Wallet size={120} />
         </div>
         <div className="relative z-10">
            <p className="text-gray-400 text-sm font-medium">總資產</p>
            <div className="mt-2 flex items-baseline gap-2">
                <span className="text-5xl font-black tracking-tighter">
                   {Math.floor(data.member.points)}
                </span>
                <span className="text-xl font-bold text-yellow-400">P</span>
            </div>
            <div className="mt-8 flex gap-4">
                <div className="flex-1 p-3 bg-white/10 rounded-2xl backdrop-blur-md border border-white/10">
                   <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">可使用點數</p>
                   <p className="text-lg font-bold mt-1">{Math.floor(data.member.points)}</p>
                </div>
                <div className="flex-1 p-3 bg-white/5 rounded-2xl border border-white/5 opacity-50">
                   <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">凍結中 (待解鎖)</p>
                   <p className="text-lg font-bold mt-1">
                      {data.point_logs.filter(l => l.status === 'pending').reduce((s, l) => s + l.amount, 0)}
                   </p>
                </div>
            </div>
         </div>
      </div>

      {/* Redeem Section */}
      <div className="p-6 rounded-2xl bg-white border border-border space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold">
            <Ticket className="w-4 h-4 text-primary" /> 兌換碼
        </div>
        <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="請輸入 16 位兌換碼" 
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value)}
              className="flex-1 px-4 py-3 bg-muted rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
            <button 
              onClick={handleRedeem}
              disabled={redeemLoading || !redeemCode}
              className="px-6 py-3 bg-primary text-white font-bold rounded-xl hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all"
            >
              兌換
            </button>
        </div>
      </div>

      {/* History History */}
      <div className="space-y-4">
         <div className="flex items-center gap-2 text-sm font-bold px-2">
            <History className="w-4 h-4 text-primary" /> 交易紀錄
         </div>
         <div className="space-y-2">
            {data.point_logs.map((log) => (
               <div key={log.id} className="p-4 bg-white border border-border rounded-2xl flex items-center justify-between group hover:border-primary/30 transition-all">
                  <div className="flex items-center gap-3">
                     <div className={`p-2 rounded-xl ${log.amount > 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                        {log.amount > 0 ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                     </div>
                     <div>
                        <p className="text-sm font-bold">
                            {log.point_type === 'l1_commission' && '推薦分潤 (L1)'}
                            {log.point_type === 'l1_commission_diff' && '級差分潤 (L1)'}
                            {log.point_type === 'l2_commission' && '推薦分潤 (L2)'}
                            {log.point_type === 'l2_commission_diff' && '級差分潤 (L2)'}
                            {log.point_type === 'first_buy' && '首購加碼'}
                            {log.point_type === 'signup' && 'FLESIM 迎新禮'}
                            {log.point_type === 'redeem' && '訂單折抵扣除'}
                            {log.point_type === 'clawback' && '訂單退款追回'}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                            {new Date(log.created_at).toLocaleString()}
                        </p>
                     </div>
                  </div>
                  <div className="text-right">
                     <p className={`text-sm font-black ${log.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {log.amount > 0 ? `+${log.amount}` : log.amount} P
                     </p>
                     {log.status === 'pending' && (
                        <p className="text-[9px] text-orange-500 font-bold flex items-center gap-1 justify-end mt-0.5">
                           <Clock size={8} /> 預計於 {new Date(log.available_at!).toLocaleDateString()} 解凍
                        </p>
                     )}
                     {log.status === 'confirmed' && (
                         <span className="text-[9px] text-green-600 font-bold">已入帳</span>
                     )}
                  </div>
               </div>
            ))}
            {data.point_logs.length === 0 && (
                <div className="py-12 text-center text-muted-foreground text-sm italic bg-muted/20 rounded-2xl border border-dashed border-border">
                    尚未有任何交易紀錄
                </div>
            )}
         </div>
      </div>
    </div>
  )
}
