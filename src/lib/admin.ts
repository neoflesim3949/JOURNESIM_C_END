import { cookies } from 'next/headers'

/**
 * 檢查當前請求是否具備管理員權限
 * @returns boolean
 */
export async function checkAdminAuth(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get('admin_token')?.value
  return token === process.env.ADMIN_PASSWORD
}

/**
 * 取得管理員權限檢查的錯誤回應
 */
export function getUnauthorizedResponse() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 })
}
