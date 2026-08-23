'use client'

import { useState } from 'react'
import PackRecalcView from '@/components/admin/PackRecalcView'
import VolumeRecalcView from '@/components/admin/VolumeRecalcView'

// 各流量算法的設定（依方案另用 PackRecalcView）
const VOLUME_TABS: Record<string, { params: Record<string, string>; csv: string; title: string; subtitle: string; logic: string[] }> = {
  avg: {
    params: { mode: 'volume' }, csv: 'cost-recalc-volume.csv',
    title: '成本重算（依流量均價）',
    subtitle: '用 1GB 基礎方案「所有天數階梯的總價÷總量」算出平均每GB價，家族內所有品項一律「每GB價 × 實際總用量」計價；逐原始商品(SKU)呈現（基礎以下不動；¥ CNY）',
    logic: [
      '納入範圍：與「依方案」相同——單日型、原 SKU 在 bc_products、已分組（組內≥1GB或吃到飽）或名稱≥1GB。基礎方案以下（<1GB）不動。',
      '平均每GB價：取該組 1GB 基礎方案「實際有的所有天數階梯」，每GB價＝Σ(各階梯結算價) ÷ Σ(各階梯GB，N天=N GB)。含長天數的量大折扣，一支基礎方案一個固定值。',
      '重算後成本＝平均每GB價 × 該卡實際總用量(GB)；不分天數、不分原本幾GB或吃到飽，同家族一律套同一個每GB價。用量取自 card_usage_daily（F023）。',
      '呈現：每個原始商品(SKU)一列；同家族的 SKU 都套用該家族基礎方案的每GB價（MB單價＝每GB價÷1024）。',
      '舊成本＝原方案結算價。節省＝舊成本 − 重算後（可能為負）。沒有 1GB 基準者列「待處理」不計入。',
    ],
  },
  avg5: {
    params: { mode: 'volume', pergb_avg_days: '5' }, csv: 'cost-recalc-volume-avg5.csv',
    title: '成本重算（依1GB五天平均）',
    subtitle: '用 1GB 基礎方案「1~5 天各階梯的總價 ÷ 總量」算出平均每GB價（Σ第1..5天結算價 ÷ (1+2+3+4+5=15GB)），家族內所有品項一律「每GB價 × 實際總用量」計價；逐原始商品(SKU)呈現（¥ CNY）',
    logic: [
      '納入範圍：與其他成本重算相同——單日型、原 SKU 在 bc_products、已分組（組內≥1GB或吃到飽）或名稱≥1GB。',
      '每GB價：取該組 1GB 基礎方案「1~5 天」的階梯，Σ(第1..5天結算價) ÷ Σ(第1..5天GB，即15GB)。是 1~5 天的區間平均（不是只取第5天）。',
      '重算後成本＝每GB價 × 該卡實際總用量(GB)；同家族一律套同一個每GB價。用量取自 card_usage_daily（F023）。',
      '呈現：每個原始商品(SKU)一列（MB單價＝每GB價÷1024）。舊成本＝原方案結算價。節省可能為負。',
    ],
  },
  '5': {
    params: { mode: 'volume', pergb_days: '5' }, csv: 'cost-recalc-volume5.csv',
    title: '成本重算（依1GB五日）',
    subtitle: '用 1GB 基礎方案「5 天檔結算價 ÷ 5GB」當每GB價，家族內所有品項一律「每GB價 × 實際總用量」計價；逐原始商品(SKU)呈現（基礎以下不動；¥ CNY）',
    logic: [
      '納入範圍：與其他成本重算相同——單日型、原 SKU 在 bc_products、已分組（組內≥1GB或吃到飽）或名稱≥1GB。',
      '每GB價：取該組 1GB 基礎方案的「5 天檔」結算價 ÷ 5GB（5天=5GB）。以 5 天當代表性用量計價；無 5 天檔時退回單日價。',
      '重算後成本＝每GB價 × 該卡實際總用量(GB)；不分天數、不分原本幾GB或吃到飽，同家族一律套同一個每GB價。用量取自 card_usage_daily（F023）。',
      '呈現：每個原始商品(SKU)一列；同家族的 SKU 都套用該家族基礎方案的每GB價（MB單價＝每GB價÷1024）。',
      '舊成本＝原方案結算價。節省＝舊成本 − 重算後（可能為負）。沒有 1GB 基準者列「待處理」不計入。',
    ],
  },
  '3': {
    params: { mode: 'volume', pergb_days: '3' }, csv: 'cost-recalc-volume3.csv',
    title: '成本重算（依1GB三日）',
    subtitle: '用 1GB 基礎方案「3 天檔結算價 ÷ 3GB」當每GB價，家族內所有品項一律「每GB價 × 實際總用量」計價；逐原始商品(SKU)呈現（基礎以下不動；¥ CNY）',
    logic: [
      '納入範圍：與其他成本重算相同——單日型、原 SKU 在 bc_products、已分組（組內≥1GB或吃到飽）或名稱≥1GB。',
      '每GB價：取該組 1GB 基礎方案的「3 天檔」結算價 ÷ 3GB（3天=3GB）。以 3 天當代表性用量計價；無 3 天檔時退回單日價。',
      '重算後成本＝每GB價 × 該卡實際總用量(GB)；不分天數、不分原本幾GB或吃到飽，同家族一律套同一個每GB價。用量取自 card_usage_daily（F023）。',
      '呈現：每個原始商品(SKU)一列；同家族的 SKU 都套用該家族基礎方案的每GB價（MB單價＝每GB價÷1024）。',
      '舊成本＝原方案結算價。節省＝舊成本 − 重算後（可能為負）。沒有 1GB 基準者列「待處理」不計入。',
    ],
  },
  '1': {
    params: { mode: 'volume', pergb_days: '1' }, csv: 'cost-recalc-volume1.csv',
    title: '成本重算（依一日流量價）',
    subtitle: '用 1GB 基礎方案「1 天檔結算價 ÷ 1GB」當每GB價（即單日價），家族內所有品項一律「每GB價 × 實際總用量」計價；逐原始商品(SKU)呈現（基礎以下不動；¥ CNY）',
    logic: [
      '納入範圍：與其他成本重算相同——單日型、原 SKU 在 bc_products、已分組（組內≥1GB或吃到飽）或名稱≥1GB。',
      '每GB價：取該組 1GB 基礎方案的「1 天檔」結算價 ÷ 1GB（＝單日價）。以單日價當每GB成本，一支基礎方案一個固定值。',
      '重算後成本＝每GB價 × 該卡實際總用量(GB)；不分天數、不分原本幾GB或吃到飽，同家族一律套同一個每GB價。用量取自 card_usage_daily（F023）。',
      '呈現：每個原始商品(SKU)一列；同家族的 SKU 都套用該家族基礎方案的每GB價（MB單價＝每GB價÷1024）。',
      '舊成本＝原方案結算價。節省＝舊成本 − 重算後（可能為負）。沒有 1GB 基準者列「待處理」不計入。',
    ],
  },
  global: {
    params: { mode: 'volume', pergb_basis: 'global' }, csv: 'cost-recalc-volumeavg.csv',
    title: '成本重算（依總平均）',
    subtitle: '不看單一基礎方案：用「所有非吃到飽方案的總價÷總量」算出一個全域每GB價，套用到所有卡的實際用量；逐原始商品(SKU)呈現（¥ CNY）',
    logic: [
      '納入範圍：與其他成本重算相同——單日型、原 SKU 在 bc_products、已分組（組內≥1GB或吃到飽）或名稱≥1GB。',
      '全域每GB價：掃 bc_products 內「所有非吃到飽方案」，每GB價＝Σ(各方案各階梯結算價) ÷ Σ(份數 × 每份GB(high_flow_size))。整個系統一個單價，不分家族。',
      '（排除吃到飽：sku_meta 標記吃到飽、或名稱含 无限/吃到饱/unlimited 者不計入分母分子。）',
      '重算後成本＝全域每GB價 × 該卡實際總用量(GB)；所有卡（含吃到飽）都套同一個單價。用量取自 card_usage_daily（F023）。',
      '呈現：每個原始商品(SKU)一列。舊成本＝原方案結算價。節省＝舊成本 − 重算後（可能為負）。',
    ],
  },
  globalall: {
    params: { mode: 'volume', pergb_basis: 'globalall' }, csv: 'cost-recalc-volumeall.csv',
    title: '成本重算（依全部）',
    subtitle: '用「所有方案（含吃到飽）的總價÷總量」算出一個全域每GB價，套用到所有卡的實際用量；逐原始商品(SKU)呈現（¥ CNY）',
    logic: [
      '納入範圍：與其他成本重算相同——單日型、原 SKU 在 bc_products、已分組（組內≥1GB或吃到飽）或名稱≥1GB。',
      '全域每GB價：掃 bc_products 內「所有方案（含吃到飽）」，每GB價＝Σ(各方案各階梯結算價) ÷ Σ(份數 × 每份GB(high_flow_size))。整個系統一個單價。',
      '（吃到飽方案的「每份GB」以其 high_flow_size 高速上限計，故此版每GB價通常會比「依總平均」略高。）',
      '重算後成本＝全域每GB價 × 該卡實際總用量(GB)；所有卡都套同一個單價。用量取自 card_usage_daily（F023）。',
      '呈現：每個原始商品(SKU)一列。舊成本＝原方案結算價。節省＝舊成本 − 重算後（可能為負）。',
    ],
  },
}

const TABS: [string, string][] = [
  ['pack', '依方案'],
  ['globalall', '依全部'],
  ['global', '依1GB以上平均'],
  ['avg', '依1GB平均'],
  ['avg5', '依1GB五天平均'],
  ['5', '依1GB五日'],
  ['3', '依1GB三日'],
  ['1', '依1GB一日'],
]

export default function CostRecalcTabs({ grouping }: { grouping: 'custom' | 'system' }) {
  // 系統組別不提供「依方案」（1GB＋加速包在 product_id 分組下不適用）
  const tabList = grouping === 'system' ? TABS.filter(([k]) => k !== 'pack') : TABS
  const [tab, setTab] = useState(tabList[0][0])
  const cfg = VOLUME_TABS[tab]
  const title = grouping === 'system' ? '成本重算（系統組別）' : '成本重算（自訂分組）'
  const note = grouping === 'system'
    ? '分組依 BC product_id（方案列表→系統組別設基礎）；總量型也納入、依實際用量計價。'
    : '分組依你在方案列表的自訂組別；總量型也納入、依實際用量計價。'
  return (
    <div>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-1 text-xs text-gray-500">{note}</p>
      <div className="mt-3 inline-flex items-center gap-1 bg-gray-100 rounded-lg p-1 max-w-full overflow-x-auto">
        {tabList.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-1.5 text-sm rounded-md whitespace-nowrap transition-colors ${tab === k ? 'bg-white shadow font-medium text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {tab === 'pack'
          ? <PackRecalcView grouping={grouping} />
          : <VolumeRecalcView key={tab} variantParams={{ ...cfg.params, grouping }} csvName={cfg.csv} subtitle={cfg.subtitle} logicItems={cfg.logic} />}
      </div>
    </div>
  )
}
