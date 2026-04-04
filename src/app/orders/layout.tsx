import type { Metadata } from 'next'
export const metadata: Metadata = { title: '我的訂單', robots: { index: false } }
export default function L({ children }: { children: React.ReactNode }) { return children }
