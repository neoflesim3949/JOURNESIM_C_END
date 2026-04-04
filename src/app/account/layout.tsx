import type { Metadata } from 'next'
export const metadata: Metadata = { title: '會員中心', robots: { index: false } }
export default function L({ children }: { children: React.ReactNode }) { return children }
