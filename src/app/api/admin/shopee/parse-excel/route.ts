import { NextResponse } from 'next/server'
import { checkAdminAuth } from '@/lib/admin'
import * as XLSX from 'xlsx'
import officeCrypto from 'officecrypto-tool'

// POST — 解析 Excel（支援密碼保護），回傳 JSON rows
export async function POST(request: Request) {
  if (!(await checkAdminAuth())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const password = formData.get('password') as string | null

  if (!file) return NextResponse.json({ error: '未上傳檔案' }, { status: 400 })

  let buffer = Buffer.from(await file.arrayBuffer())

  // 嘗試解密
  if (officeCrypto.isEncrypted(buffer)) {
    if (!password) return NextResponse.json({ error: 'encrypted', message: '檔案有密碼保護' }, { status: 400 })
    try {
      buffer = Buffer.from(await officeCrypto.decrypt(buffer, { password }))
    } catch {
      return NextResponse.json({ error: 'wrong_password', message: '密碼錯誤' }, { status: 400 })
    }
  }

  const wb = XLSX.read(buffer, { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })

  return NextResponse.json({ rows })
}
