import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCountries } from '@/lib/billionconnect'

const BATCH_SIZE = 30

export async function POST() {
  try {
    const supabase = createAdminClient()

    const countries = await getCountries('5')

    const records = countries.map((c) => ({
      mcc: c.mcc,
      name: c.name,
      continent: c.continent,
      flag_url: c.url || null,
    }))

    // 分批 upsert
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      { status: 500 }
    )
  }
}
