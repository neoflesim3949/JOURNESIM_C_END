import { NextResponse } from 'next/server'
import { getSettings } from '@/lib/settings'

export async function GET() {
  let settings = new Map<string, string>()
  try { settings = await getSettings() } catch {}

  const providers = [
    { key: 'login_line', id: 'line', label: 'LINE 登入', defaultProvider: 'line' },
    { key: 'login_google', id: 'google', label: 'Google 登入', defaultProvider: 'google' },
    { key: 'login_apple', id: 'apple', label: 'Apple 登入', defaultProvider: 'apple' },
    { key: 'login_facebook', id: 'facebook', label: 'Facebook 登入', defaultProvider: 'facebook' },
  ]

  const enabled = providers
    .filter((p) => settings.get(p.key) === 'true')
    .map((p) => ({
      id: p.id,
      label: p.label,
      provider: settings.get(`${p.key}_provider`) || p.defaultProvider,
      icon: settings.get(`${p.key}_icon`) || '',
    }))

  return NextResponse.json(enabled)
}
