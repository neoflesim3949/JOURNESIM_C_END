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
        // SM-DP+ 位址轉換：只轉 eSIM RSP 協定路徑（LPA 打的都是 /gsma/rsp2/es9plus/...）
        // 規則有順序性：這條要放在下面的通用規則之前
        source: '/gsma/:path*',
        has: [{ type: 'host', value: 'rsp.flesim.com' }],
        destination: 'https://rsp.billionconnect.com/gsma/:path*',
        permanent: false,   // 302：之後要改目的地不會被瀏覽器永久快取
      },
      {
        // 瀏覽器直接打 rsp.flesim.com（非 RSP 協定路徑）→ 導回官網，不露出 BC 網域
        source: '/:path*',
        has: [{ type: 'host', value: 'rsp.flesim.com' }],
        destination: 'https://www.flesim.com',
        permanent: false,
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
