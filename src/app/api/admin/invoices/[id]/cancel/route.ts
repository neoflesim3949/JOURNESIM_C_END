import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { smseModifyInvoice } from '@/lib/smse'

// POST — 作廢發票（types=Cancel）
// 注意：作廢後號碼仍佔用，不歸還字軌
// body: { cancelReason: string, returnTaxDocumentNumber?: string, remark?: string }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await request.json()
  const reason = String(body.cancelReason || '').trim()
  if (!reason) return NextResponse.json({ error: '請輸入作廢原因' }, { status: 400 })
  if (reason.length > 20) return NextResponse.json({ error: '作廢原因最多 20 字' }, { status: 400 })

  const supabase = createAdminClient()
  const { data: invoice, error } = await supabase.from('invoices').select('*').eq('id', id).single()
  if (error || !invoice) return NextResponse.json({ error: '找不到發票' }, { status: 404 })
  if (invoice.status !== 'issued') return NextResponse.json({ error: '此發票狀態不允許作廢' }, { status: 400 })

  const invoiceDateSmse = String(invoice.invoice_date).replace(/-/g, '/')
  const result = await smseModifyInvoice({
    invoiceNumber: invoice.invoice_number,
    invoiceDate: invoiceDateSmse,
    types: 'Cancel',
    cancelReason: reason,
    returnTaxDocumentNumber: body.returnTaxDocumentNumber || undefined,
    remark: body.remark || undefined,
  })

  if (!result.ok) {
    return NextResponse.json({ error: `[${result.status}] ${result.desc}`, raw: result.raw }, { status: 500 })
  }

  // 更新發票狀態（號碼**不歸還字軌**，next_number 維持原樣）
  await supabase.from('invoices').update({
    status: 'cancelled',
    cancelled_at: new Date().toISOString(),
    cancel_reason: reason,
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  return NextResponse.json({ ok: true, cancelDate: result.cancelDate, cancelTime: result.cancelTime })
}
