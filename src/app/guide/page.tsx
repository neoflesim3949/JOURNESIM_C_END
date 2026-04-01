import { Smartphone, QrCode, Settings, CheckCircle } from 'lucide-react'

export default function GuidePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-center">eSIM 安裝教學</h1>
      <p className="mt-2 text-center text-muted-foreground">
        按照以下步驟，輕鬆安裝 eSIM 開始上網
      </p>

      {/* Prerequisites */}
      <div className="mt-10 p-6 bg-accent rounded-xl">
        <h2 className="font-semibold">安裝前請確認</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            您的裝置支援 eSIM（iPhone XS 以上、大部分 Android 旗艦機）
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            裝置已連接 Wi-Fi 或行動數據
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            建議在出發前安裝，到達目的地後開啟即可使用
          </li>
        </ul>
      </div>

      {/* iOS */}
      <div className="mt-10">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Smartphone className="w-5 h-5" />
          iPhone（iOS）安裝步驟
        </h2>
        <div className="mt-4 space-y-4">
          {[
            { step: '1', icon: QrCode, title: '掃描 QR Code', desc: '前往「設定」>「行動服務」>「加入 eSIM」>「使用 QR 碼」，掃描我們提供的 QR Code' },
            { step: '2', icon: Settings, title: '確認安裝', desc: '系統會顯示電信商資訊，點擊「繼續」並等待安裝完成' },
            { step: '3', icon: CheckCircle, title: '設定行動數據', desc: '安裝完成後，前往「設定」>「行動服務」，選擇新的 eSIM 作為行動數據線路' },
          ].map((item) => (
            <div key={item.step} className="flex gap-4 p-4 border border-border rounded-lg">
              <div className="w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                {item.step}
              </div>
              <div>
                <div className="font-medium">{item.title}</div>
                <div className="mt-1 text-sm text-muted-foreground">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Android */}
      <div className="mt-10">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Smartphone className="w-5 h-5" />
          Android 安裝步驟
        </h2>
        <div className="mt-4 space-y-4">
          {[
            { step: '1', title: '掃描 QR Code', desc: '前往「設定」>「網路和網際網路」>「SIM 卡」>「新增 eSIM」>「掃描 QR 碼」' },
            { step: '2', title: '確認安裝', desc: '掃描後系統將下載 eSIM 設定檔，確認並等待安裝完成' },
            { step: '3', title: '啟用 eSIM', desc: '安裝完成後，在 SIM 卡設定中啟用新的 eSIM，並設為行動數據使用' },
          ].map((item) => (
            <div key={item.step} className="flex gap-4 p-4 border border-border rounded-lg">
              <div className="w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                {item.step}
              </div>
              <div>
                <div className="font-medium">{item.title}</div>
                <div className="mt-1 text-sm text-muted-foreground">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* APN */}
      <div className="mt-10 p-6 bg-muted rounded-xl">
        <h2 className="font-semibold">APN 設定</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          大多數情況下，eSIM 安裝後會自動設定 APN。如果無法上網，請至「設定」{'>'}「行動服務」{'>'}「行動數據選項」{'>'}「行動數據網路」，
          手動輸入 APN 資訊（可在訂單詳情頁查看）。
        </p>
      </div>

      {/* FAQ */}
      <div className="mt-10">
        <h2 className="text-xl font-bold">常見問題</h2>
        <div className="mt-4 space-y-4">
          {[
            { q: 'eSIM 可以提前安裝嗎？', a: '可以。建議在出發前安裝好，到達目的地後開啟行動數據即可使用。' },
            { q: '一台手機可以裝幾個 eSIM？', a: '依裝置而定，iPhone 通常可儲存 8-10 個 eSIM 設定檔，但同時只能啟用一個。' },
            { q: '安裝後可以刪除嗎？', a: '可以。但刪除後無法重新安裝同一個 eSIM，需要重新購買。' },
            { q: '不支援 eSIM 怎麼辦？', a: '可以選購實體 SIM 卡方案，我們將寄送到指定地址。' },
          ].map((item) => (
            <details key={item.q} className="border border-border rounded-lg">
              <summary className="p-4 cursor-pointer font-medium text-sm">{item.q}</summary>
              <div className="px-4 pb-4 text-sm text-muted-foreground">{item.a}</div>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}
