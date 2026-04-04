import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ConditionalLayout } from "@/components/layout/conditional-layout";
import { CartProvider } from "@/lib/cart";
import { AnalyticsScripts } from "@/components/tracking/analytics";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://flesim.com'

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'FLESIM — 旅遊 eSIM 輕鬆買',
    template: '%s | FLESIM',
  },
  description: '出國上網不斷線，eSIM / SIM 卡線上購買，即買即用。覆蓋全球 190+ 國家，即買即裝，免換卡。',
  keywords: ['eSIM', 'SIM卡', '旅遊上網', '出國上網', '國際漫遊', 'FLESIM', '旅遊SIM卡'],
  openGraph: {
    type: 'website',
    siteName: 'FLESIM',
    title: 'FLESIM — 旅遊 eSIM 輕鬆買',
    description: '出國上網不斷線，eSIM / SIM 卡線上購買，即買即用。',
    url: BASE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FLESIM — 旅遊 eSIM 輕鬆買',
    description: '出國上網不斷線，eSIM / SIM 卡線上購買，即買即用。',
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: BASE_URL,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-TW"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <CartProvider>
          <AnalyticsScripts />
          <ConditionalLayout>{children}</ConditionalLayout>
        </CartProvider>
      </body>
    </html>
  );
}
