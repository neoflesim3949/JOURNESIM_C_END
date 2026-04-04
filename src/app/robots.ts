import type { MetadataRoute } from 'next'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://flesim.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/auth/', '/checkout', '/cart', '/account/', '/payment/'],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  }
}
