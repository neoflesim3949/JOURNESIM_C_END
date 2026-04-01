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
  })
}
