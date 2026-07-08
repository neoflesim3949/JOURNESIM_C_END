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
