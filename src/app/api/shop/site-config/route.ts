import { NextResponse } from 'next/server'
import { getSettings } from '@/lib/settings'

export async function GET() {
  let settings = new Map<string, string>()
  try {
    settings = await getSettings()
  } catch {}

  return NextResponse.json({
    logo: settings.get('site_logo') || '',
    footer_logo: settings.get('footer_logo') || '',
    site_name: settings.get('site_name') || 'FLESIM',
    brand_desc: settings.get('brand_desc') || '',
    company_info: settings.get('company_info') || '',
    // 廣告追蹤
    ga4_measurement_id: settings.get('ga4_measurement_id') || '',
    google_ads_id: settings.get('google_ads_id') || '',
    google_ads_conversion_label: settings.get('google_ads_conversion_label') || '',
    meta_pixel_id: settings.get('meta_pixel_id') || '',
    gtm_container_id: settings.get('gtm_container_id') || '',
  })
}
