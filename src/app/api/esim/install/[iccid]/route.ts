import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — 公開 eSIM 安裝資料（僅公開必要欄位，不包含訂單資訊）
export async function GET(_request: Request, { params }: { params: Promise<{ iccid: string }> }) {
  const { iccid } = await params
  if (!iccid || iccid.length < 10) {
    return NextResponse.json({ error: '無效的 ICCID' }, { status: 400 })
  }
  const supabase = createAdminClient()

  // 先查 shopee_order_items（手動 eSIM / Shopee 訂單）
  // JSONB contains 寫法：用字串形式的 JSON array 做 filter
  const { data: shopeeItems } = await supabase.from('shopee_order_items')
    .select('iccid, qr_code_url, lpa_code, delivery_type')
    .eq('delivery_type', 'esim')
    .not('iccid', 'is', null)

  const shopeeItem = (shopeeItems || []).find(it =>
    Array.isArray(it.iccid) && (it.iccid as string[]).includes(iccid)
  )

  if (shopeeItem) {
    return NextResponse.json({
      iccid,
      qr_code_url: shopeeItem.qr_code_url || null,
      lpa_code: shopeeItem.lpa_code || null,
      source: 'shopee',
    })
  }

  // 再查 esim_profiles（C-END 一般訂單）
  const { data: profile } = await supabase.from('esim_profiles')
    .select('iccid, qr_code_url, qr_code_data, activation_code, sm_dp_address')
    .eq('iccid', iccid)
    .maybeSingle()

  if (profile) {
    return NextResponse.json({
      iccid,
      qr_code_url: profile.qr_code_url || null,
      lpa_code: profile.qr_code_data || null,
      activation_code: profile.activation_code || null,
      sm_dp_address: profile.sm_dp_address || null,
      source: 'cend',
    })
  }

  return NextResponse.json({ error: '找不到此 eSIM' }, { status: 404 })
}
