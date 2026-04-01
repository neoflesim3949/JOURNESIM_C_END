/**
 * 格式化流量顯示（KB → MB/GB）
 * @param kb KB 值（字串），null/-1 表示不限量
 * @param perDay plan_type === '1' 時為 true，加 "/天" 後綴
 */
export function formatCapacity(kb: string | null | undefined, perDay = false): string {
  if (!kb || kb === '' || kb === '-1') {
    return perDay ? '無限/天' : '不限量'
  }
  const val = parseFloat(kb)
  if (isNaN(val) || val === -1) {
    return perDay ? '無限/天' : '不限量'
  }
  const mb = val / 1024
  let result: string
  if (mb >= 1024) {
    const gb = mb / 1024
    result = `${gb % 1 === 0 ? gb.toFixed(0) : gb.toFixed(1)}GB`
  } else {
    result = `${mb % 1 === 0 ? mb.toFixed(0) : mb.toFixed(0)}MB`
  }
  return perDay ? `${result}/天` : result
}

/**
 * 格式化限速顯示
 */
export function formatSpeed(kbps: string | null | undefined): string {
  if (!kbps || kbps === '' || kbps === '0' || kbps === '-1') return '-'
  const val = parseFloat(kbps)
  if (isNaN(val)) return kbps
  if (val >= 1024) return `${(val / 1024).toFixed(0)}Mbps`
  return `${val}kbps`
}
