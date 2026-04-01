import { createAdminClient } from '@/lib/supabase/admin'
import { Users } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function AdminMembersPage() {
  const supabase = createAdminClient()

  const { data: members } = await supabase
    .from('members')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div>
      <h1 className="text-2xl font-bold">會員管理</h1>

      {(!members || members.length === 0) ? (
        <div className="mt-8 text-center py-16">
          <Users className="mx-auto w-12 h-12 text-gray-300" />
          <p className="mt-4 text-gray-500">尚無會員</p>
        </div>
      ) : (
        <div className="mt-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">名稱</th>
                <th className="text-left px-4 py-3 font-medium">登入方式</th>
                <th className="text-left px-4 py-3 font-medium">註冊時間</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{m.email}</td>
                  <td className="px-4 py-3 font-medium">{m.display_name || '-'}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100">{m.auth_provider}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{new Date(m.created_at).toLocaleString('zh-TW')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
