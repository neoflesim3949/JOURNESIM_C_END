import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdminAuth, getUnauthorizedResponse } from '@/lib/admin'

export async function GET() {
  if (!(await checkAdminAuth())) return getUnauthorizedResponse()
  const supabase = createAdminClient()

  const { data: tiers } = await supabase
    .from('member_tiers')
    .select('*')
    .order('sort_order', { ascending: true })

  return NextResponse.json(tiers || [])
}

export async function PATCH(request: Request) {
  if (!(await checkAdminAuth())) return getUnauthorizedResponse()
  const body = await request.json()
  const supabase = createAdminClient()

  const { id, l1_rate, l2_rate, min_order_count, min_yearly_spend } = body as { 
    id: string; 
    l1_rate: number; 
    l2_rate: number;
    min_order_count?: number;
    min_yearly_spend?: number;
  }

  const { error } = await supabase
    .from('member_tiers')
    .update({ 
        l1_rate: Number(l1_rate),
        l2_rate: Number(l2_rate),
        min_order_count: min_order_count !== undefined ? Number(min_order_count) : undefined,
        min_yearly_spend: min_yearly_spend !== undefined ? Number(min_yearly_spend) : undefined,
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
