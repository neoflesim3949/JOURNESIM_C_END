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
    // RSP 子網域（rsp / rsp1 / rsp2 ...）：
    //  - /gsma/*（SM-DP+ 協定路徑）不在這裡處理 → 由 middleware 查 rsp_domains 表動態轉址
    //    （next.config redirects 先於 middleware 執行，所以這裡必須排除 /gsma）
    //  - 其他路徑（瀏覽器打開）→ 導回官網，不露出上游 RSP 網域
    const RSP_HOST = { type: 'host' as const, value: '^rsp\\d*\\.flesim\\.com$' }
    return [
      { source: '/', has: [RSP_HOST], destination: 'https://www.flesim.com', permanent: false },
      { source: '/:path((?!gsma).*)', has: [RSP_HOST], destination: 'https://www.flesim.com', permanent: false },
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
