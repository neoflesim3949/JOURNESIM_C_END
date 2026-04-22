import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCountries } from '@/lib/billionconnect'
import { translateCountryName, translateCountryNameEn, translateContinent, translateContinentEn } from '@/lib/country-translations'

const BATCH_SIZE = 30

export async function POST() {
  try {
    const supabase = createAdminClient()

    const countries = await getCountries('5')

    const records = countries.map((c) => ({
      mcc: c.mcc,
      name: c.name,
      name_zh: translateCountryName(c.name),
      name_en: translateCountryNameEn(c.name),
      continent: c.continent,
      continent_zh: translateContinent(c.continent),
      continent_en: translateContinentEn(c.continent),
      flag_url: c.url || null,
    }))

    let synced = 0
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE)
      const { error } = await supabase
        .from('bc_countries')
        .upsert(batch, { onConflict: 'mcc' })

      if (error) throw error
      synced += batch.length
    }

    return NextResponse.json({ synced })
  } catch (err) {
    console.error('Country sync failed:', err)
    let msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('<!DOCTYPE') || msg.includes('<html')) {
      const codeMatch = msg.match(/Error code (\d+)/i) || msg.match(/\b(502|503|504|500)\b/)
      msg = codeMatch ? `上游服務暫時無回應（${codeMatch[1]}），請稍後再試` : '上游服務暫時無回應，請稍後再試'
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
