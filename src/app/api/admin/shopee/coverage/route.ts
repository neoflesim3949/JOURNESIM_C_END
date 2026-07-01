import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Opt = any

// 跨帳號鍵：優先用 商品選項貨號(BC_copies)，無對應則退回規格名
function rowKey(o: Opt): string {
  if (o.bc_sku_id) return `bc:${o.bc_sku_id}_${o.copies ?? ''}`
  return `name:${(o.shopee_variation_name || '').trim()}`
}
function finalPrice(o: Opt): number | null {
  if (o.original_price != null) return Number(o.original_price)
  return null
}
function dispName(o: Opt): string {
  return (o.custom_variation_name || o.shopee_variation_name || '').trim()
}

// GET — 列出所有主檔（或 ?id= 單一），依 main_sku_code 把各帳號 V2 選項拉進來比對
// ?accounts=id1,id2 — 只比對勾選的帳號（未帶＝全部）
export async function GET(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(request.url)
  const onlyId = url.searchParams.get('id')
  const accFilter = url.searchParams.get('accounts')
  const supabase = createAdminClient()

  const { data: accounts } = await supabase.from('shopee_accounts').select('id, name').order('created_at')
  const allAccounts = (accounts || []).map(a => ({ id: a.id as string, name: a.name as string }))
  const selSet = accFilter ? new Set(accFilter.split(',').filter(Boolean)) : null
  const accList = selSet ? allAccounts.filter(a => selSet.has(a.id)) : allAccounts

  let mq = supabase.from('shopee_coverage_masters').select('*').order('sort_index').order('created_at')
  if (onlyId) mq = supabase.from('shopee_coverage_masters').select('*').eq('id', onlyId)
  const { data: masters } = await mq

  const skuCodes = [...new Set((masters || []).map(m => m.main_sku_code).filter(Boolean))] as string[]

  // 一次撈出所有相關主貨號的 V2 選項（分頁，避免 1000 上限）
  const optionsBySku = new Map<string, Opt[]>()
  if (skuCodes.length) {
    for (let from = 0; ; from += 1000) {
      const { data } = await supabase.from('shopee_product_options_v2')
        .select('account_id, main_sku_code, bc_sku_id, copies, variation_sku_code, shopee_variation_name, custom_variation_name, custom_product_name, original_price, bc_name_snapshot')
        .in('main_sku_code', skuCodes).range(from, from + 999)
      if (!data || data.length === 0) break
      for (const o of data) {
        const arr = optionsBySku.get(o.main_sku_code) || []
        arr.push(o); optionsBySku.set(o.main_sku_code, arr)
      }
      if (data.length < 1000) break
    }
  }

  const accIdSet = new Set(accList.map(a => a.id))
  const result = (masters || []).map(m => {
    const opts = (optionsBySku.get(m.main_sku_code) || []).filter(o => accIdSet.has(o.account_id))
    // 依跨帳號鍵分組
    const groups = new Map<string, Opt[]>()
    for (const o of opts) {
      const k = rowKey(o)
      const arr = groups.get(k) || []
      arr.push(o); groups.set(k, arr)
    }
    let missing = 0, codeDiff = 0, nameDiff = 0
    // 選項號 = 套餐選項貨號 > 對應BC(bc_sku_id_copies)
    const codeOf = (o: Opt): string | null => o.variation_sku_code || (o.bc_sku_id ? `${o.bc_sku_id}_${o.copies ?? ''}` : null)
    const rows = [...groups.entries()].map(([key, list]) => {
      const byAcc: Record<string, { price: number | null; name: string; code: string | null } | null> = {}
      for (const a of accList) {
        const o = list.find(x => x.account_id === a.id)
        byAcc[a.id] = o ? { price: finalPrice(o), name: dispName(o), code: codeOf(o) } : null
      }
      const listed = accList.filter(a => byAcc[a.id])
      const isMissing = listed.length > 0 && listed.length < accList.length
      // 選項號不一致：兩邊都上架但對應的選項號不同
      const codes = [...new Set(listed.map(a => byAcc[a.id]!.code).filter(Boolean))]
      const isCodeDiff = listed.length >= 2 && codes.length > 1
      const names = [...new Set(listed.map(a => byAcc[a.id]!.name).filter(Boolean))]
      const isNameDiff = names.length > 1
      if (isMissing) missing++
      if (isCodeDiff) codeDiff++
      if (isNameDiff) nameDiff++
      const rep = list[0]
      return {
        key,
        bc_sku_id: rep.bc_sku_id || null,
        copies: rep.copies || null,
        bc_name: rep.bc_name_snapshot || null,
        variation_sku: codeOf(rep),
        spec: dispName(rep) || (rep.shopee_variation_name || ''),
        byAcc,
        missing: isMissing, codeDiff: isCodeDiff, nameDiff: isNameDiff,
      }
    }).sort((a, b) => a.spec.localeCompare(b.spec, 'zh-Hant'))

    const perAcc = accList.map(a => ({ id: a.id, name: a.name, count: opts.filter(o => o.account_id === a.id).length }))
    return {
      id: m.id, inventory_name: m.inventory_name, main_sku_code: m.main_sku_code, note: m.note, sort_index: m.sort_index,
      perAcc, rows,
      issues: { missing, codeDiff, nameDiff },
      hasIssue: missing > 0 || codeDiff > 0 || nameDiff > 0 || opts.length === 0,
      empty: opts.length === 0,
    }
  })

  if (onlyId) return NextResponse.json({ accounts: accList, allAccounts, master: result[0] || null })
  return NextResponse.json({ accounts: accList, allAccounts, masters: result })
}

// POST — 新增主檔
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const inventory_name = (body.inventory_name || '').trim()
  const main_sku_code = (body.main_sku_code || '').trim()
  if (!inventory_name || !main_sku_code) return NextResponse.json({ error: '請填庫存商品名稱與主商品貨號' }, { status: 400 })
  const supabase = createAdminClient()
  const { error } = await supabase.from('shopee_coverage_masters')
    .insert({ inventory_name, main_sku_code, note: (body.note || '').trim() || null })
  if (error) return NextResponse.json({ error: error.message.includes('duplicate') ? '此主商品貨號已存在' : error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PATCH — 編輯主檔
export async function PATCH(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const { id } = body
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('inventory_name' in body) updates.inventory_name = (body.inventory_name || '').trim()
  if ('main_sku_code' in body) updates.main_sku_code = (body.main_sku_code || '').trim()
  if ('note' in body) updates.note = (body.note || '').trim() || null
  const supabase = createAdminClient()
  const { error } = await supabase.from('shopee_coverage_masters').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE ?id=
export async function DELETE(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
  const supabase = createAdminClient()
  const { error } = await supabase.from('shopee_coverage_masters').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
