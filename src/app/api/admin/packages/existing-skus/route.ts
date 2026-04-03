import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { data } = await supabase.from('package_plans').select('bc_sku_id')

  const skus = [...new Set((data || []).map((p) => p.bc_sku_id))]
  return NextResponse.json(skus)
}
