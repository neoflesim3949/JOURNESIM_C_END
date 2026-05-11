import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { smseCreateAllowance, type SmseAllowanceInput } from '@/lib/smse'

// GET — 取得該發票的折讓單列表
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('invoice_allowances')
    .select('*')
    .eq('invoice_id', id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data || [] })
}

// POST — 開立折讓單
// body: {
//   allowanceDate?: 'YYYY-MM-DD',
//   allowanceType?: '1'|'2',
//   items: [{ description, quantity, unitPriceExclTax, amountExclTax, tax, taxType }],
// }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await request.json()
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: '請至少選擇一個品項' }, { status: 400 })
  }
  const supabase = createAdminClient()
  const { data: invoice, error: invErr } = await supabase.from('invoices').select('*').eq('id', id).single()
  if (invErr || !invoice) return NextResponse.json({ error: '找不到發票' }, { status: 404 })
  if (invoice.status !== 'issued') return NextResponse.json({ error: '此發票狀態不允許折讓' }, { status: 400 })

  // 算總額
  const totalSales = body.items.reduce((s: number, it: { amountExclTax: number }) => s + Number(it.amountExclTax || 0), 0)
  const totalTax = body.items.reduce((s: number, it: { tax: number }) => s + Number(it.tax || 0), 0)
  const totalAmount = totalSales + totalTax

  // 檢查不可超過原發票可折讓額度
  const alreadyAllowed = Number(invoice.allowance_amount || 0)
  const maxAllowable = Number(invoice.total_amount) - alreadyAllowed
  if (totalAmount > maxAllowable) {
    return NextResponse.json({ error: `折讓總額 ${totalAmount} 超過可折讓金額 ${maxAllowable}` }, { status: 400 })
  }

  // 發票日期 → speedmate 需要 YYYY/MM/DD
  const invoiceDateSmse = String(invoice.invoice_date).replace(/-/g, '/')
  const smseInput: SmseAllowanceInput = {
    invoiceNumber: invoice.invoice_number,
    invoiceDate: invoiceDateSmse,
    allowanceDate: body.allowanceDate || undefined,
    allowanceType: body.allowanceType || '2',
    items: body.items,
  }

  const result = await smseCreateAllowance(smseInput)
  if (!result.ok) {
    return NextResponse.json({ error: `[${result.status}] ${result.desc}`, raw: result.raw }, { status: 500 })
  }

  // 寫入折讓單記錄
  const { data: allowance, error: insErr } = await supabase.from('invoice_allowances').insert({
    invoice_id: id,
    allowance_number: result.allowanceNumber,
    allowance_date: body.allowanceDate || new Date().toISOString().slice(0, 10),
    allowance_type: body.allowanceType || '2',
    items: body.items,
    total_sales: totalSales,
    total_tax: totalTax,
    total_amount: totalAmount,
    smse_raw_response: result.raw,
  }).select().single()
  if (insErr) console.error('[allowance] DB insert error:', insErr)

  // 累加 invoices.allowance_amount
  await supabase.from('invoices').update({
    allowance_amount: alreadyAllowed + totalAmount,
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  return NextResponse.json({ ok: true, allowanceNumber: result.allowanceNumber, allowance })
}
