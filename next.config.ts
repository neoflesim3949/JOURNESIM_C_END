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
};

export default nextConfig;
