import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AdminSidebar } from '@/components/admin/sidebar'
import { ExpiringUnusedAlert } from '@/components/admin/expiring-unused-alert'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const token = cookieStore.get('admin_token')?.value

  if (token !== process.env.ADMIN_PASSWORD) {
    redirect('/admin-login')
  }

  return (
    <div className="min-h-screen flex bg-gray-50">
      <AdminSidebar />
      <main className="flex-1 ml-64">
        <div className="p-8">{children}</div>
      </main>
      <ExpiringUnusedAlert />
    </div>
  )
}
