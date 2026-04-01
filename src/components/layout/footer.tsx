import Link from 'next/link'

export function Footer() {
  return (
    <footer className="bg-foreground text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <h3 className="text-lg font-bold">FLESIM</h3>
            <p className="mt-2 text-sm text-gray-400">
              旅遊 eSIM 輕鬆買，出國上網不斷線
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="text-sm font-semibold mb-3">產品</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="/shop" className="hover:text-white transition-colors">eSIM 商品</Link></li>
              <li><Link href="/guide" className="hover:text-white transition-colors">安裝教學</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-3">帳戶</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><Link href="/orders" className="hover:text-white transition-colors">訂單查詢</Link></li>
              <li><Link href="/account" className="hover:text-white transition-colors">會員中心</Link></li>
              <li><Link href="/after-sale" className="hover:text-white transition-colors">售後服務</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-3">支援</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li><a href="mailto:support@flesim.com" className="hover:text-white transition-colors">聯絡我們</a></li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-gray-700 text-center text-sm text-gray-400">
          &copy; {new Date().getFullYear()} FLESIM. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
