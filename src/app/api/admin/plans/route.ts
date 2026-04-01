import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

// eSIM 類型碼
const ESIM_TYPES = ['110', '111', '3105', '3106']

// SIM 類型碼（含 eSIM 重疊的 110, 111）
const SIM_TYPES = [
  '110', '111',
  '210', '211', '212',
  '220', '221',
  '311',
  '3101', '3102', '3103', '3104',
  '3201', '3202', '3211', '3212',
]

// 加速包排除列表（所有 eSIM + SIM 主商品類型）
const ESIM_SIM_EXCLUDE = ['110', '111', '210', '211', '212', '220', '221', '230', '250', '311']

export async function GET(request: Request) {
  const cookieStore = await cookies()
  const token = cookieStore.get('admin_token')?.value
  if (token !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') || 'esim'
  const types = searchParams.get('types')
  const acceleration = searchParams.get('acceleration') === 'true'

  const supabase = createAdminClient()

  let query = supabase
    .from('bc_products')
    .select('*')
    .order('name')

  if (types) {
    // 直接用傳入的 types 過濾
    query = query.in('type', types.split(','))
  } else if (acceleration || type === 'acceleration') {
    // 加速包：排除 eSIM/SIM 主商品類型
    query = query.not('type', 'in', `(${ESIM_SIM_EXCLUDE.join(',')})`)
  } else if (type === 'sim') {
    query = query.in('type', SIM_TYPES)
  } else {
    // eSIM（預設）
    query = query.in('type', ESIM_TYPES)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data || [])
}
