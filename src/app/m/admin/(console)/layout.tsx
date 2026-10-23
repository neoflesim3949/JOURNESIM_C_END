import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { MobileAdminNav } from './_nav'

// 手機版管理端「已登入區」：統一登入保護（未登入 → /m/admin/login）＋頂欄 nav。
// login 頁在此 route group 之外，不受此保護（避免轉圈）。
export default async function MobileConsoleLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const token = cookieStore.get('admin_token')?.value
  if (token !== process.env.ADMIN_PASSWORD) redirect('/m/admin/login')
  return (
    <>
      <MobileAdminNav />
      {children}
    </>
  )
}
