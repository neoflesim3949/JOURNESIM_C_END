import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildOptionIndex } from '@/lib/option-index'

// GET — 套餐選項貨號索引：code → { bc_sku_id, copies, sell_price, package_name }
// 供商品對應 V2 填入「套餐選項貨號」時自動解析對應的億點 BC
export async function GET() {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = createAdminClient()
  const items = await buildOptionIndex(supabase)
  return NextResponse.json({ items })
}
