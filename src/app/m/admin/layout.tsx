// 手機版 admin 外層：全寬、行動裝置友善（不含側欄）。
// 登入保護放在 /m/admin/shopee 的 layout，讓 /m/admin/login 本身不被攔（避免轉圈）。
export default function MobileAdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-gray-50">{children}</div>
}
