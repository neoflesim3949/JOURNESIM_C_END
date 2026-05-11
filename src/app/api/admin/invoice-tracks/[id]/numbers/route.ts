import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

// GET — 列出字軌內所有號碼的狀態（分頁）
// 每個號碼可能：未使用 / 已開立(issued) / 作廢(cancelled) / 註銷(voided)
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = parseInt(searchParams.get('pageSize') || '100')
  const filterStatus = searchParams.get('status') || '' // unused / issued / cancelled / voided

  const supabase = createAdminClient()
  const { data: track, error } = await supabase.from('invoice_tracks').select('*').eq('id', id).single()
  if (error || !track) return NextResponse.json({ error: '找不到字軌' }, { status: 404 })

  const prefix = track.track_prefix
  const start = Number(track.start_number)
  const end = Number(track.end_number)

  // 撈該字軌內所有已開立發票
  const { data: invoiceRows } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, invoice_date, invoice_time, total_amount, buyer_type, buyer_id, buyer_name, buyer_company')
    .like('invoice_number', `${prefix}%`)
    .gte('invoice_number', `${prefix}${String(start).padStart(8, '0')}`)
    .lte('invoice_number', `${prefix}${String(end).padStart(8, '0')}`)
  const invoiceMap = new Map((invoiceRows || []).map(r => [r.invoice_number, r]))

  // 建出整段號碼，再依 filterStatus 過濾
  type RowOut = {
    invoice_number: string
    status: 'unused' | 'issued' | 'cancelled' | 'voided'
    invoice_id?: string
    invoice_date?: string
    invoice_time?: string
    total_amount?: number
    buyer?: string
  }
  const all: RowOut[] = []
  for (let n = start; n <= end; n++) {
    const numStr = `${prefix}${String(n).padStart(8, '0')}`
    const inv = invoiceMap.get(numStr)
    if (inv) {
      all.push({
        invoice_number: numStr,
        status: inv.status as RowOut['status'],
        invoice_id: inv.id,
        invoice_date: inv.invoice_date,
        invoice_time: inv.invoice_time,
        total_amount: inv.total_amount,
        buyer: inv.buyer_type === 'B2C' ? (inv.buyer_name || '個人') : (inv.buyer_company || inv.buyer_id || '公司'),
      })
    } else {
      all.push({ invoice_number: numStr, status: 'unused' })
    }
  }

  const filtered = filterStatus ? all.filter(r => r.status === filterStatus) : all
  const total = filtered.length
  const from = (page - 1) * pageSize
  const slice = filtered.slice(from, from + pageSize)

  return NextResponse.json({ track, rows: slice, total })
}
