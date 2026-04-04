'use client'

import { useEffect, useState } from 'react'
import { Copy, Users, Award, History, Wallet, CheckCircle2, Clock, AlertCircle, TrendingUp } from 'lucide-react'
import { formatPrice } from '@/lib/utils'

interface AffiliateData {
  member: {
    id: string
    referral_code: string
    points: number
  }
  referral_count: number
  point_logs: Array<{
    id: string
    amount: number
    point_type: string
    status: string
    created_at: string
    available_at?: string
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

  if (loading) return <div className="p-8 text-center text-muted-foreground">載入中...</div>
  if (!data) return <div className="p-8 text-center text-muted-foreground">無法載入資料</div>

  const referralLink = `${window.location.origin}?ref=${data.member.referral_code}`

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">聯盟行銷中心</h1>
        <p className="text-muted-foreground mt-2">分享您的專屬連結，邀請好友註冊並賺取點數回饋。</p>
      </div>

      {/* 數據概覽 */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="p-6 rounded-2xl bg-primary/5 border border-primary/10 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform">
            <Wallet size={80} />
          </div>
          <p className="text-sm font-medium text-primary">可用點數餘額</p>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-3xl font-extrabold text-primary">{Math.floor(data.member.points)}</span>
            <span className="text-sm font-bold text-primary">P</span>
          </div>
          <p className="text-[10px] text-primary/60 mt-2 font-medium">1 點 = NT$1 結帳可全額抵扣</p>
        </div>

        <div className="p-6 rounded-2xl bg-muted/30 border border-border">
          <p className="text-sm font-medium text-muted-foreground">成功推薦人數</p>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-3xl font-extrabold text-foreground">{data.referral_count}</span>
            <span className="text-sm font-bold text-muted-foreground">人</span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-green-600 font-medium">
            <Users size={14} /> 已成功綁定關係
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-muted/30 border border-border">
          <p className="text-sm font-medium text-muted-foreground">分潤比例</p>
          <div className="mt-2 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">一級 (L1)</span>
              <span className="font-bold text-foreground">5% 點數</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">二級 (L2)</span>
              <span className="font-bold text-foreground">2% 點數</span>
            </div>
          </div>
        </div>
      </div>

      {/* 推薦工具 */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="p-6 rounded-2xl border border-border bg-card">
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
            <Award className="text-primary w-4 h-4" /> 個人推薦碼
          </h3>
          <div className="flex gap-2">
            <div className="flex-1 px-4 py-3 bg-muted rounded-xl font-mono text-xl font-black tracking-widest text-center border border-border/50">
              {data.member.referral_code}
            </div>
            <button 
              onClick={() => copyToClipboard(data.member.referral_code, 'code')}
              className="px-4 py-3 bg-primary text-white rounded-xl font-bold hover:opacity-90 transition-all flex items-center gap-2 active:scale-95"
            >
              {copyStatus === 'code' ? <CheckCircle2 size={18} /> : <Copy size={18} />}
              {copyStatus === 'code' ? '已複製' : '複製'}
            </button>
          </div>
        </div>

        <div className="p-6 rounded-2xl border border-border bg-card">
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="text-primary w-4 h-4" /> 專屬推廣連結
          </h3>
          <div className="flex gap-2">
            <div className="flex-1 px-4 py-3 bg-muted rounded-xl text-sm text-muted-foreground truncate border border-border/50">
              {referralLink}
            </div>
            <button 
              onClick={() => copyToClipboard(referralLink, 'link')}
              className="px-4 py-3 bg-primary text-white rounded-xl font-bold hover:opacity-90 transition-all flex items-center gap-2 active:scale-95"
            >
              {copyStatus === 'link' ? <CheckCircle2 size={18} /> : <Copy size={18} />}
              {copyStatus === 'link' ? '已複製' : '複製'}
            </button>
          </div>
        </div>
      </div>

      {/* 歷史明細 */}
      <div className="p-6 rounded-2xl border border-border bg-card overflow-hidden">
        <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
          <History className="text-primary w-5 h-5" /> 點數收支明細
        </h3>
        <div className="overflow-x-auto -mx-6">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs font-bold uppercase text-muted-foreground">
              <tr>
                <th className="px-6 py-4">交易日期</th>
                <th className="px-6 py-4">說明</th>
                <th className="px-6 py-4">明細</th>
                <th className="px-6 py-4 text-center">狀態</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.point_logs.map((log) => (
                <tr key={log.id} className="hover:bg-muted/30 transition-colors group">
                  <td className="px-6 py-5 whitespace-nowrap text-muted-foreground text-xs">
                    {new Date(log.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-5">
                    <div className="font-bold text-foreground">
                      {log.point_type === 'l1_commission' && '推薦分潤 (L1)'}
                      {log.point_type === 'l2_commission' && '推薦分潤 (L2)'}
                      {log.point_type === 'first_buy' && '首購獎勵加碼'}
                      {log.point_type === 'signup' && '註冊迎新禮'}
                      {log.point_type === 'redeem' && '消費點數折抵'}
                      {log.point_type === 'clawback' && '退款點數追回'}
                    </div>
                    {log.status === 'pending' && (
                      <p className="text-[10px] text-orange-500 mt-1 flex items-center gap-1 font-medium">
                        <Clock size={10} /> 預計於 {new Date(log.available_at!).toLocaleDateString()} 解凍可用
                      </p>
                    )}
                  </td>
                  <td className="px-6 py-5">
                    <span className={`text-lg font-black ${log.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {log.amount > 0 ? `+${log.amount}` : log.amount} <span className="text-xs">P</span>
                    </span>
                  </td>
                  <td className="px-6 py-5 text-center">
                    {log.status === 'pending' && (
                      <span className="inline-flex items-center px-2 py-1 rounded-md bg-orange-100 text-orange-700 text-[10px] font-bold border border-orange-200">
                        鎖定中
                      </span>
                    )}
                    {log.status === 'confirmed' && (
                      <span className="inline-flex items-center px-2 py-1 rounded-md bg-green-100 text-green-700 text-[10px] font-bold border border-green-200">
                        已入帳
                      </span>
                    )}
                    {log.status === 'void' && (
                      <span className="inline-flex items-center px-2 py-1 rounded-md bg-red-100 text-red-700 text-[10px] font-bold border border-red-200">
                        已撤銷
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {data.point_logs.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-12 text-center text-muted-foreground italic bg-muted/10">
                    <AlertCircle className="mx-auto w-8 h-8 opacity-20 mb-2" />
                    目前尚無任何點數與推薦紀錄
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
