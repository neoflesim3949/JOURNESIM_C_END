import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

async function checkAuth() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_token')?.value === process.env.ADMIN_PASSWORD
}

// GET — 列出所有圖片
export async function GET() {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { data, error } = await supabase.storage.from('media').list('', {
    limit: 500,
    sortBy: { column: 'created_at', order: 'desc' },
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl: baseUrl } } = supabase.storage.from('media').getPublicUrl('')

  const files = (data || [])
    .filter((f) => !f.name.startsWith('.'))
    .map((f) => ({
      name: f.name,
      size: f.metadata?.size || 0,
      type: f.metadata?.mimetype || '',
      created_at: f.created_at,
      url: `${baseUrl}${f.name}`,
    }))

  return NextResponse.json(files)
}

// POST — 上傳圖片
export async function POST(request: Request) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) return NextResponse.json({ error: '請選擇檔案' }, { status: 400 })

  // 驗證檔案類型
  const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp', 'image/x-icon']
  if (!allowed.includes(file.type)) {
    return NextResponse.json({ error: '不支援的檔案格式，僅接受 PNG/JPG/GIF/SVG/WebP/ICO' }, { status: 400 })
  }

  // 檔名去空格、加時間戳避免重名
  const ext = file.name.split('.').pop() || 'png'
  const safeName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_')
  const fileName = `${safeName}_${Date.now()}.${ext}`

  const supabase = createAdminClient()
  const { error } = await supabase.storage.from('media').upload(fileName, file, {
    contentType: file.type,
    upsert: false,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(fileName)

  return NextResponse.json({ name: fileName, url: publicUrl })
}

// DELETE — 刪除圖片
export async function DELETE(request: Request) {
  if (!(await checkAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await request.json()
  const supabase = createAdminClient()

  const { error } = await supabase.storage.from('media').remove([name])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
