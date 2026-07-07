import Link from 'next/link'
import { Mail, MessageCircle, HelpCircle, MapPin, Building2, ExternalLink } from 'lucide-react'

export const metadata = { title: '聯絡我們 · FLESIM' }

const OFFICES = [
  {
    region: '台灣',
    lines: [
      ['公司名稱', '飛訊移動科技有限公司（FLESIM.COM, INC.）'],
      ['統一編號', '60636261'],
    ],
    email: 'tw_cs@flesim.com',
    address: '桃園市蘆竹區南崁路 265 號 6 樓之 6',
    addressEn: '6F.-6, No. 265, Nankan Rd., Luzhu Dist., Taoyuan City 338019, Taiwan (R.O.C.)',
    map: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('桃園市蘆竹區南崁路265號6樓之6'),
  },
  {
    region: '香港 Hong Kong',
    lines: [
      ['Company Name', 'Flesim.com HK Limited（飛訊移動科技有限公司）'],
      ['BR No.', '77562223'],
    ],
    email: 'hk_cs@flesim.com',
    address: 'RM D07, 8/F, Kai Tak Fty Building, No. 99 King Fuk Street, San Po Kong, Hong Kong',
    addressEn: '',
    map: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Kai Tak Factory Building, 99 King Fuk Street, San Po Kong, Hong Kong'),
  },
]

const CHANNELS = [
  { icon: Mail, title: '客服信箱', desc: 'support@flesim.com', href: 'mailto:support@flesim.com', cta: '寄信給我們' },
  { icon: MessageCircle, title: '線上客服', desc: '透過官方 LINE／WhatsApp 與我們對談', href: '#', cta: '開始對談' },
  { icon: HelpCircle, title: '幫助中心', desc: '安裝教學、常見問題與使用說明', href: '/guide', cta: '前往幫助中心' },
]

export default function ContactPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
      {/* Hero */}
      <div className="max-w-2xl">
        <h1 className="text-3xl sm:text-4xl font-bold">我們很樂意為您提供協助。</h1>
        <p className="mt-3 text-muted-foreground text-lg">
          有任何關於 eSIM／SIM 卡、訂單或帳號的問題，歡迎透過以下方式與我們聯繫，我們將盡快為您服務。
        </p>
      </div>

      {/* Channels */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {CHANNELS.map(c => {
          const Icon = c.icon
          const inner = (
            <div className="h-full rounded-2xl border border-gray-200 p-5 hover:shadow-md transition bg-white">
              <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Icon className="w-5 h-5" /></div>
              <div className="mt-3 font-semibold">{c.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{c.desc}</div>
              <div className="mt-3 text-sm text-primary font-medium">{c.cta} →</div>
            </div>
          )
          return c.href.startsWith('/')
            ? <Link key={c.title} href={c.href}>{inner}</Link>
            : <a key={c.title} href={c.href} target={c.href.startsWith('mailto') ? undefined : '_blank'} rel="noopener noreferrer">{inner}</a>
        })}
      </div>

      {/* Office locations */}
      <h2 className="mt-14 text-2xl font-bold flex items-center gap-2"><Building2 className="w-6 h-6 text-primary" />辦公室據點</h2>
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {OFFICES.map(o => (
          <div key={o.region} className="rounded-2xl border border-gray-200 p-6 bg-white">
            <div className="text-lg font-semibold">{o.region}</div>
            <dl className="mt-3 space-y-1.5 text-sm">
              {o.lines.map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <dt className="text-muted-foreground shrink-0 w-40">{k}</dt>
                  <dd className="text-gray-800">{v}</dd>
                </div>
              ))}
              <div className="flex gap-2">
                <dt className="text-muted-foreground shrink-0 w-40">聯繫信箱</dt>
                <dd><a href={`mailto:${o.email}`} className="text-primary hover:underline">{o.email}</a></dd>
              </div>
            </dl>
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-start gap-2 text-sm text-gray-700">
                <MapPin className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <div>{o.address}</div>
                  {o.addressEn && <div className="text-muted-foreground mt-0.5">{o.addressEn}</div>}
                </div>
              </div>
              <a href={o.map} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline">
                在 Google 地圖開啟 <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
