import Link from 'next/link'
import Image from 'next/image'
import { Globe, Zap, Shield, Smartphone } from 'lucide-react'

const POPULAR_COUNTRIES = [
  { iso: 'jp', name: '日本' },
  { iso: 'kr', name: '韓國' },
  { iso: 'th', name: '泰國' },
  { iso: 'vn', name: '越南' },
  { iso: 'sg', name: '新加坡' },
  { iso: 'my', name: '馬來西亞' },
  { iso: 'us', name: '美國' },
  { iso: 'gb', name: '英國' },
]

const FEATURES = [
  {
    icon: Zap,
    title: '即買即用',
    desc: '付款完成後立即取得 eSIM QR Code，掃碼即可安裝使用',
  },
  {
    icon: Globe,
    title: '全球覆蓋',
    desc: '支援超過 100 個國家和地區，隨時隨地保持連線',
  },
  {
    icon: Shield,
    title: '安全可靠',
    desc: '與國際電信商合作，提供穩定的 4G/5G 高速網路',
  },
  {
    icon: Smartphone,
    title: '免換卡',
    desc: 'eSIM 數位安裝，不需要實體 SIM 卡，保留原號碼',
  },
]

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative bg-gradient-to-br from-blue-600 to-blue-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32">
          <div className="max-w-2xl">
            <h1 className="text-4xl md:text-5xl font-bold leading-tight">
              出國上網
              <br />
              <span className="text-blue-200">輕鬆搞定</span>
            </h1>
            <p className="mt-6 text-lg text-blue-100">
              FLESIM 提供全球 eSIM / SIM 卡線上購買服務，
              付款後即刻取得 QR Code，掃碼安裝立即上網。
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4">
              <Link
                href="/shop"
                className="inline-flex items-center justify-center px-6 py-3 bg-white text-blue-700 font-semibold rounded-lg hover:bg-blue-50 transition-colors"
              >
                選擇目的地
              </Link>
              <Link
                href="/guide"
                className="inline-flex items-center justify-center px-6 py-3 border-2 border-white/30 text-white font-semibold rounded-lg hover:bg-white/10 transition-colors"
              >
                了解 eSIM
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Popular Destinations */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-2xl font-bold text-center">熱門目的地</h2>
        <p className="mt-2 text-center text-muted-foreground">最多旅客選擇的上網方案</p>

        <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
          {POPULAR_COUNTRIES.map((c) => (
            <Link
              key={c.iso}
              href={`/shop/${c.iso}`}
              className="flex flex-col items-center gap-3 p-4 rounded-xl border border-border hover:border-primary hover:shadow-md transition-all"
            >
              <Image
                src={`https://flagcdn.com/w80/${c.iso}.png`}
                alt={c.name}
                width={48}
                height={36}
                className="rounded shadow-sm"
              />
              <span className="text-sm font-medium">{c.name}</span>
            </Link>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/shop"
            className="inline-flex items-center text-sm font-medium text-primary hover:underline"
          >
            查看所有國家 &rarr;
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="bg-muted">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <h2 className="text-2xl font-bold text-center">為什麼選擇 FLESIM？</h2>

          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-white rounded-xl p-6 shadow-sm">
                <div className="w-12 h-12 bg-accent rounded-lg flex items-center justify-center">
                  <f.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-2xl font-bold text-center">如何使用？</h2>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { step: '1', title: '選擇目的地', desc: '搜尋你要前往的國家，挑選適合的上網方案' },
            { step: '2', title: '完成付款', desc: '填寫 Email，選擇付款方式，完成購買' },
            { step: '3', title: '掃碼上網', desc: '收到 eSIM QR Code，用手機掃碼安裝即可使用' },
          ].map((item) => (
            <div key={item.step} className="text-center">
              <div className="mx-auto w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center text-lg font-bold">
                {item.step}
              </div>
              <h3 className="mt-4 font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-primary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white">準備好出發了嗎？</h2>
          <p className="mt-4 text-blue-100">馬上選購 eSIM，讓旅途網路暢通無阻</p>
          <Link
            href="/shop"
            className="mt-6 inline-flex items-center px-8 py-3 bg-white text-primary font-semibold rounded-lg hover:bg-blue-50 transition-colors"
          >
            立即選購
          </Link>
        </div>
      </section>
    </>
  )
}
