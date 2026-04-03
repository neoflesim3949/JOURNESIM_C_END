import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await request.json()
  const { name, scope, mcc, icon_url } = payload

  if (!mcc || !name || !scope) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = createAdminClient()
  
  const { data, error } = await supabase
    .from('bc_countries')
    .insert([{
      mcc,
      name,
      name_zh: name, // 預設帶入中文名稱欄位
      scope,
      icon_url
    }])
    .select()
    .single()

  if (error) {
    console.error('Error creating custom country group:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function PATCH(request: Request) {
  
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await request.json()
  const { mcc, name, icon_url, new_mcc } = payload

  if (!mcc) return NextResponse.json({ error: 'mcc is required' }, { status: 400 })

  const supabase = createAdminClient()

  let updateData: any = {}
  if (name !== undefined) {
    updateData.name = name
    updateData.name_zh = name
  }
  if (icon_url !== undefined) updateData.icon_url = icon_url
  if (new_mcc !== undefined && new_mcc !== mcc) updateData.mcc = new_mcc

  const { data, error } = await supabase
    .from('bc_countries')
    .update(updateData)
    .eq('mcc', mcc)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(request: Request) {
  
  if (!(await checkAdminAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const mcc = searchParams.get('mcc')

  if (!mcc) return NextResponse.json({ error: 'mcc is required' }, { status: 400 })

  const supabase = createAdminClient()
  const { error } = await supabase.from('bc_countries').delete().eq('mcc', mcc)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
