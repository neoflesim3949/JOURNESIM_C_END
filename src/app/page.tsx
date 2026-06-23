import Link from 'next/link'
import { Globe, Zap, Shield, Smartphone, ArrowRight } from 'lucide-react'
import { PopularCountries } from '@/components/home/popular-countries'

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
      {/* Hero — Apple-inspired */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-900 via-blue-800 to-blue-950 text-white">
        {/* Background glow */}
        <div className="absolute inset-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-radial from-blue-500/30 via-blue-600/10 to-transparent rounded-full blur-3xl" />
          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-gradient-radial from-cyan-400/20 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-gradient-radial from-blue-400/20 to-transparent rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-36 text-center">
          {/* Slogan */}
          <p className="text-sm md:text-base font-medium tracking-[0.3em] uppercase text-blue-300">
            Fly. Flexible. FLESIM.
          </p>

          {/* Main heading */}
          <h1 className="mt-6 text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-white via-white to-blue-200 bg-clip-text text-transparent">
              出國上網
            </span>
            <br />
            <span className="bg-gradient-to-r from-cyan-300 via-white to-cyan-300 bg-clip-text text-transparent">
              輕鬆搞定
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mt-6 max-w-2xl mx-auto text-lg md:text-xl text-gray-400 leading-relaxed">
            全球 eSIM / SIM 卡線上購買，付款後即刻取得 QR Code
            <br className="hidden md:block" />
            掃碼安裝，立即上網
          </p>

          {/* CTA Buttons */}
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/shop"
              className="group inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-black font-semibold rounded-full hover:bg-gray-100 transition-all"
            >
              選擇目的地
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              href="/guide"
              className="inline-flex items-center justify-center px-8 py-4 border border-white/20 text-white font-semibold rounded-full hover:bg-white/10 transition-all backdrop-blur-sm"
            >
              了解 eSIM
            </Link>
          </div>

          {/* Stats */}
          <div className="mt-16 grid grid-cols-3 gap-8 max-w-lg mx-auto">
            <div>
              <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">100+</div>
              <div className="mt-1 text-xs text-gray-500">覆蓋國家</div>
            </div>
            <div>
              <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">4G/5G</div>
              <div className="mt-1 text-xs text-gray-500">高速網路</div>
            </div>
            <div>
              <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">即買即用</div>
              <div className="mt-1 text-xs text-gray-500">免等待</div>
            </div>
          </div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 inset-x-0 h-24 bg-gradient-to-t from-background to-transparent" />
      </section>

      {/* Popular Destinations */}
      <PopularCountries />

      {/* Features */}
      <section className="bg-muted">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
          <p className="text-center text-sm font-medium tracking-widest uppercase text-primary">Why FLESIM</p>
          <h2 className="mt-2 text-3xl font-bold text-center">為什麼選擇 FLESIM？</h2>

          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
                  <f.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="mt-4 font-semibold text-lg">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <p className="text-center text-sm font-medium tracking-widest uppercase text-primary">How it works</p>
        <h2 className="mt-2 text-3xl font-bold text-center">三步驟，輕鬆上網</h2>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-12">
          {[
            { step: '01', title: '選擇目的地', desc: '搜尋你要前往的國家，挑選適合的上網方案' },
            { step: '02', title: '完成付款', desc: '填寫 Email，選擇付款方式，安全完成購買' },
            { step: '03', title: '掃碼上網', desc: '收到 eSIM QR Code，用手機掃碼安裝即可使用' },
          ].map((item) => (
            <div key={item.step} className="text-center">
              <div className="mx-auto w-16 h-16 bg-black text-white rounded-2xl flex items-center justify-center text-xl font-bold">
                {item.step}
              </div>
              <h3 className="mt-5 text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-gradient-to-br from-blue-900 via-blue-800 to-blue-950 text-white">
        <div className="absolute inset-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-blue-400/20 to-transparent rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <h2 className="text-3xl md:text-4xl font-bold">準備好出發了嗎？</h2>
          <p className="mt-4 text-gray-400 text-lg">馬上選購 eSIM，讓旅途網路暢通無阻</p>
          <Link
            href="/shop"
            className="group mt-8 inline-flex items-center gap-2 px-8 py-4 bg-white text-black font-semibold rounded-full hover:bg-gray-100 transition-all"
          >
            立即選購
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </section>
    </>
  )
}
