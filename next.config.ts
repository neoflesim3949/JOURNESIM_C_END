import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'flagcdn.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'op-flow-public.oss-cn-hangzhou.aliyuncs.com' },
      { protocol: 'https', hostname: 'ecayqnbzzkbbrsjwdobe.supabase.co' },
    ],
  },
  async redirects() {
    return [
      {
        // 子網域整域轉址：rsp.flesim.com/* → rsp.billionconnect.com/*（路徑與 query 原樣帶過去）
        // 需在 Vercel 專案加上 rsp.flesim.com 網域＋DNS CNAME 指到 Vercel 才會生效
        source: '/:path*',
        has: [{ type: 'host', value: 'rsp.flesim.com' }],
        destination: 'https://rsp.billionconnect.com/:path*',
        permanent: false,   // 302：之後要改目的地不會被瀏覽器永久快取
      },
    ]
  },
  async headers() {
    return [
      {
        // Apple Pay 域名驗證檔以純文字提供，避免部分主機以 octet-stream 造成驗證失敗
        source: '/.well-known/apple-developer-merchantid-domain-association',
        headers: [{ key: 'Content-Type', value: 'text/plain; charset=utf-8' }],
      },
    ]
  },
};

export default nextConfig;
