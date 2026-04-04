import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '選擇目的地 — eSIM / SIM 卡方案',
  description: '搜尋全球 190+ 國家的 eSIM 和 SIM 卡上網方案，本地、區域、全球方案一次比較，即買即用。',
  openGraph: {
    title: '選擇目的地 — FLESIM eSIM / SIM 卡',
    description: '搜尋全球 190+ 國家的 eSIM 和 SIM 卡上網方案。',
  },
}

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return children
}
