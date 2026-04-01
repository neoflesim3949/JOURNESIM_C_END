import { Globe, Shield, Zap, Users } from 'lucide-react'

export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <h1 className="text-3xl font-bold text-center">關於 FLESIM</h1>
      <p className="mt-4 text-center text-muted-foreground text-lg">
        讓旅行上網更簡單
      </p>

      <div className="mt-12 space-y-8">
        <div className="flex gap-4">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <Globe className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">全球覆蓋</h3>
            <p className="mt-1 text-muted-foreground">
              FLESIM 提供超過 100 個國家和地區的 eSIM / SIM 卡服務，
              無論您前往亞洲、歐洲、美洲或大洋洲，都能輕鬆上網。
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <Zap className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">即買即用</h3>
            <p className="mt-1 text-muted-foreground">
              購買後立即取得 eSIM QR Code，用手機掃碼即可安裝。
              不需要等待實體卡片寄送，出發前就能準備好。
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">安全可靠</h3>
            <p className="mt-1 text-muted-foreground">
              與國際電信商合作，提供穩定的 4G/5G 高速網路。
              支援多種安全的付款方式，保障您的交易安全。
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">客戶服務</h3>
            <p className="mt-1 text-muted-foreground">
              如有任何問題，歡迎透過 Email 聯繫我們的客服團隊。
              我們將盡快為您提供協助。
            </p>
            <a href="mailto:support@flesim.com" className="mt-2 inline-block text-primary hover:underline text-sm">
              support@flesim.com
            </a>
          </div>
        </div>
      </div>

      <div className="mt-12 text-center text-sm text-muted-foreground">
        &copy; {new Date().getFullYear()} FLESIM. All rights reserved.
      </div>
    </div>
  )
}
