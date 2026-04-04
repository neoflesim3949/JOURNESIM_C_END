'use client'

import Script from 'next/script'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    fbq?: (...args: unknown[]) => void
    dataLayer?: unknown[]
  }
}

interface TrackingConfig {
  ga4Id: string | null
  googleAdsId: string | null
  metaPixelId: string | null
  gtmId: string | null
}

// 前台追蹤腳本（從後台設定自動載入）
export function AnalyticsScripts() {
  const [config, setConfig] = useState<TrackingConfig | null>(null)
  const pathname = usePathname()

  useEffect(() => {
    fetch('/api/shop/site-config')
      .then((r) => r.json())
      .then((data) => {
        setConfig({
          ga4Id: data.ga4_measurement_id || null,
          googleAdsId: data.google_ads_id || null,
          metaPixelId: data.meta_pixel_id || null,
          gtmId: data.gtm_container_id || null,
        })
      })
      .catch(() => {})
  }, [])

  // 路由變更時觸發 PageView
  useEffect(() => {
    if (!config) return
    if (window.gtag && config.ga4Id) {
      window.gtag('config', config.ga4Id, { page_path: pathname })
    }
    if (window.fbq) {
      window.fbq('track', 'PageView')
    }
  }, [pathname, config])

  if (!config) return null

  const hasGtag = config.ga4Id || config.googleAdsId

  return (
    <>
      {/* GTM */}
      {config.gtmId && (
        <Script id="gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
          new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
          j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
          'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
          })(window,document,'script','dataLayer','${config.gtmId}');`}
        </Script>
      )}

      {/* GA4 + Google Ads (gtag.js) */}
      {hasGtag && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${config.ga4Id || config.googleAdsId}`} strategy="afterInteractive" />
          <Script id="gtag-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());
            ${config.ga4Id ? `gtag('config','${config.ga4Id}');` : ''}
            ${config.googleAdsId ? `gtag('config','${config.googleAdsId}');` : ''}`}
          </Script>
        </>
      )}

      {/* Meta Pixel */}
      {config.metaPixelId && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
          n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
          document,'script','https://connect.facebook.net/en_US/fbevents.js');
          fbq('init','${config.metaPixelId}');fbq('track','PageView');`}
        </Script>
      )}
    </>
  )
}

// =====================================================
// 追蹤事件工具函式（在前台各頁面呼叫）
// =====================================================

// 購買完成
export function trackPurchase(params: {
  orderId: string; totalAmount: number; currency?: string
  items?: { name: string; price: number; quantity: number }[]
}) {
  if (window.gtag) {
    window.gtag('event', 'purchase', {
      transaction_id: params.orderId,
      value: params.totalAmount,
      currency: params.currency || 'TWD',
      items: params.items?.map((i) => ({ item_name: i.name, price: i.price, quantity: i.quantity })),
    })
    // Google Ads 轉換（如有設定 conversion label）
    window.gtag('event', 'conversion', {
      send_to: `${document.querySelector('script[src*="gtag"]')?.getAttribute('src')?.match(/AW-[^&]*/)?.[0] || ''}/purchase`,
      value: params.totalAmount,
      currency: params.currency || 'TWD',
      transaction_id: params.orderId,
    })
  }
  if (window.fbq) {
    window.fbq('track', 'Purchase', {
      value: params.totalAmount, currency: params.currency || 'TWD',
      content_ids: [params.orderId],
    })
  }
}

// 加入購物車
export function trackAddToCart(params: { name: string; price: number; quantity: number }) {
  if (window.gtag) {
    window.gtag('event', 'add_to_cart', {
      value: params.price * params.quantity, currency: 'TWD',
      items: [{ item_name: params.name, price: params.price, quantity: params.quantity }],
    })
  }
  if (window.fbq) {
    window.fbq('track', 'AddToCart', {
      value: params.price * params.quantity, currency: 'TWD', content_name: params.name,
    })
  }
}

// 進入結帳
export function trackBeginCheckout(totalAmount: number) {
  if (window.gtag) window.gtag('event', 'begin_checkout', { value: totalAmount, currency: 'TWD' })
  if (window.fbq) window.fbq('track', 'InitiateCheckout', { value: totalAmount, currency: 'TWD' })
}
