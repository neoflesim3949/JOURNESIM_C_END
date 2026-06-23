import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// 前台幣別匯率（每 1 TWD 兌換的外幣）。admin 匯率管理可調整 USD / HKD。
export async function GET() {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase.from('exchange_rates').select('currency, rate').in('currency', ['USD', 'HKD'])
    const out: Record<string, number> = {}
    for (const r of data || []) if (Number(r.rate) > 0) out[r.currency] = Number(r.rate)
    return NextResponse.json(out)
  } catch {
    return NextResponse.json({})
  }
}
