'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface PaymentMethod {
  id: string
  enabled: boolean
  label: string
  icons: string[]
}

interface SiteConfig {
  logo: string
  footer_logo: string
  brand_desc: string
  company_info: string
}

const SOCIAL_LINKS = [
  {
    name: 'Facebook', href: '#', icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
    )
  },
  {
    name: 'Instagram', href: '#', icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg>
    )
  },
  {
    name: 'X', href: '#', icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
    )
  },
  {
    name: 'Threads', href: '#', icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.59 12c.025 3.086.718 5.496 2.057 7.164 1.432 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.96-.065-1.187.408-2.26 1.33-3.017.88-.724 2.104-1.128 3.443-1.17 1.164-.035 2.212.138 3.123.488-.07-.95-.292-1.728-.668-2.31-.53-.82-1.394-1.258-2.566-1.3l-.084-.003c-.99 0-2.095.34-2.73.904l-1.39-1.49c.945-.88 2.465-1.441 3.96-1.441l.134.003c1.775.063 3.147.72 4.08 1.953.858 1.134 1.292 2.688 1.29 4.62v.078c.033.32.024.676-.023 1.063l.018-.003c.56.306 1.063.69 1.473 1.15 1.16 1.3 1.607 3.02 1.258 4.848-.452 2.367-2.098 4.253-4.643 5.312-1.37.57-2.924.864-4.622.877zm-.573-8.958c-.346.01-.672.04-.98.086.007.03.014.058.02.087.142.595.505 1.643 2.003 1.643.082 0 .169-.003.258-.01.965-.052 1.655-.428 2.11-1.148.32-.505.538-1.155.648-1.948-.63-.2-1.322-.305-2.059-.305z" /></svg>
    )
  },
  {
    name: 'LINE', href: '#', icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.271.175-.508.433-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" /></svg>
    )
  },
  {
    name: 'WhatsApp', href: '#', icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
    )
  },
]

export function Footer() {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [config, setConfig] = useState<SiteConfig>({ logo: '', footer_logo: '', brand_desc: '', company_info: '' })

  useEffect(() => {
    fetch('/api/shop/tappay-config')
      .then((r) => r.json())
      .then((c) => setPaymentMethods((c.methods || []).filter((m: PaymentMethod) => m.enabled)))
      .catch(() => { })

    fetch('/api/shop/site-config')
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => { })
  }, [])

  return (
    <footer className="bg-foreground text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col md:flex-row gap-8 md:gap-12">
          {/* Left: Brand */}
          <div className="md:w-[250px] flex-shrink-0">
            {config.footer_logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={config.footer_logo} alt="FLESIM" className="h-8 object-contain" />
            ) : config.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={config.logo} alt="FLESIM" className="h-8 object-contain brightness-0 invert" />
            ) : (
              <h3 className="text-lg font-bold">FLESIM</h3>
            )}
            <div
              className="mt-2 text-sm text-gray-400 prose prose-sm prose-invert max-w-none [&_a]:text-gray-300 [&_a:hover]:text-white"
              dangerouslySetInnerHTML={{ __html: config.brand_desc || '旅遊 eSIM 輕鬆買，出國上網不斷線' }}
            />
            {config.company_info && (
              <div
                className="mt-2 text-xs text-gray-500 prose prose-xs prose-invert max-w-none [&_a]:text-gray-400 [&_a:hover]:text-white"
                dangerouslySetInnerHTML={{ __html: config.company_info }}
              />
            )}
          </div>

          {/* Right: All links in one row */}
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-6">
            {/* About */}
            <div>
              <h4 className="text-sm font-semibold mb-3">關於我們</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/about" className="hover:text-white transition-colors">關於 FLESIM</Link></li>
                <li><Link href="/privacy" className="hover:text-white transition-colors">隱私權政策</Link></li>
                <li><Link href="/terms" className="hover:text-white transition-colors">服務條款</Link></li>
                <li><Link href="/refund-policy" className="hover:text-white transition-colors">退換貨政策</Link></li>
                <li><Link href="/anti-fraud" className="hover:text-white transition-colors">反詐騙宣導</Link></li>
              </ul>
            </div>

            {/* Products */}
            <div>
              <h4 className="text-sm font-semibold mb-3">產品</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/shop" className="hover:text-white transition-colors">eSIM</Link></li>
                <li><Link href="/shop?type=sim" className="hover:text-white transition-colors">實體 SIM 卡</Link></li>
              </ul>
            </div>

            {/* Account */}
            <div>
              <h4 className="text-sm font-semibold mb-3">帳戶</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/account" className="hover:text-white transition-colors">會員中心</Link></li>
                <li><Link href="/orders" className="hover:text-white transition-colors">訂單查詢</Link></li>
                <li><Link href="/after-sale" className="hover:text-white transition-colors">售後服務</Link></li>
              </ul>
            </div>

            {/* Support + Social */}
            <div>
              <h4 className="text-sm font-semibold mb-3">支援</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/guide" className="hover:text-white transition-colors">安裝教學</Link></li>
                <li><Link href="/guide#faq" className="hover:text-white transition-colors">常見問題</Link></li>
                <li><Link href="/guide" className="hover:text-white transition-colors">幫助中心</Link></li>
                <li><a href="mailto:support@flesim.com" className="hover:text-white transition-colors">聯絡我們</a></li>
              </ul>
              <div className="mt-4 flex flex-wrap gap-3">
                {SOCIAL_LINKS.map((social) => (
                  <a key={social.name} href={social.href} target="_blank" rel="noopener noreferrer"
                    className="text-gray-400 hover:text-white transition-colors" title={social.name}>
                    {social.icon}
                  </a>
                ))}
              </div>
            </div>

            {/* Payment Methods */}
            <div>
              <h4 className="text-sm font-semibold mb-3">支付方式</h4>
              <div className="flex flex-wrap gap-2">
                {paymentMethods.map((pm) => (
                  pm.icons.length > 0 ? (
                    pm.icons.map((url, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={`${pm.id}-${i}`} src={url} alt={pm.label} className="h-7 object-contain bg-white rounded px-1 py-0.5" />
                    ))
                  ) : (
                    <span key={pm.id} className="px-2 py-1 bg-gray-700 rounded text-xs text-gray-300">{pm.label}</span>
                  )
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-gray-700 text-center text-sm text-gray-400">
          &copy; {new Date().getFullYear()} FLESIM. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
