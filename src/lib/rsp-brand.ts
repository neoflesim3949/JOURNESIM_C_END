import { createAdminClient } from '@/lib/supabase/admin'

// eSIM 安裝資訊品牌化：把 LPA / SM-DP+ 位址裡的上游主機（如 rsp.billionconnect.com）
// 換成我們啟用中的品牌子網域（rspN.flesim.com）。對照來源＝rsp_domains（target_host → subdomain）。

// 讀啟用中的對照，回傳 { 上游主機小寫: '子網域.flesim.com' }
async function loadBrandMap(): Promise<Record<string, string>> {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase.from('rsp_domains')
      .select('subdomain, target_host, is_active').eq('is_active', true)
    const map: Record<string, string> = {}
    for (const d of data || []) {
      if (d.target_host && d.subdomain) map[d.target_host.toLowerCase()] = `${d.subdomain}.flesim.com`
    }
    return map
  } catch { return {} }
}

// 改寫單一主機（比對忽略大小寫）；無對應回原值
function brandHost(host: string, map: Record<string, string>): string {
  return map[host.trim().toLowerCase()] || host
}

// 改寫 LPA 字串（LPA:1$smdp$activation[$confirm]）的 SM-DP+ 段
function brandLpa(lpa: string, map: Record<string, string>): string {
  if (!lpa.startsWith('LPA:1$')) return lpa
  const rest = lpa.slice(6).split('$')
  if (rest[0]) rest[0] = brandHost(rest[0], map)
  return 'LPA:1$' + rest.join('$')
}

// 對安裝資料做品牌化改寫；回傳新物件（含 rebranded 旗標，供上層決定是否棄用 BC 的 QR 圖）
export async function rebrandEsim<T extends { lpa_code?: string | null; sm_dp_address?: string | null; qr_code_url?: string | null }>(
  data: T,
): Promise<T & { rebranded: boolean }> {
  const map = await loadBrandMap()
  if (Object.keys(map).length === 0) return { ...data, rebranded: false }

  const newLpa = data.lpa_code ? brandLpa(data.lpa_code, map) : data.lpa_code
  const newSmdp = data.sm_dp_address ? brandHost(data.sm_dp_address, map) : data.sm_dp_address
  const rebranded = newLpa !== data.lpa_code || newSmdp !== data.sm_dp_address

  return {
    ...data,
    lpa_code: newLpa,
    sm_dp_address: newSmdp,
    // BC 預先產的 QR 圖檔內含 BC 網域、無法改圖；一旦位址改寫，就棄用該圖，
    // 讓前端用改寫後的 lpa_code 重新畫 QR（品牌位址才會進 QR）
    qr_code_url: rebranded ? null : data.qr_code_url,
    rebranded,
  }
}
