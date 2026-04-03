import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(request: Request) {
  
  
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { sku_id, is_active } = await request.json()

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('bc_products')
    .update({ is_active, updated_at: new Date().toISOString() })
    .eq('sku_id', sku_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
