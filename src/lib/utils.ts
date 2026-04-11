import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(amount: number): string {
  return `NT$ ${amount.toLocaleString()}`
}

// UTC+8 當前時間
export function nowUTC8(): Date {
  const now = new Date()
  return new Date(now.getTime() + 8 * 60 * 60 * 1000)
}

// UTC+8 ISO 字串（用於寫入 DB 的 updated_at 等）
export function nowISO(): string {
  return new Date().toISOString()
}

// 6碼日期 YYMMDD（UTC+8）
function getDateCode(): string {
  const now = nowUTC8()
  const yy = String(now.getUTCFullYear()).slice(2)
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  return `${yy}${mm}${dd}`
}

// 6碼英數亂數
function randomCode(len = 6): string {
  return Math.random().toString(36).substring(2, 2 + len).toUpperCase()
}

// 主訂單號：FL + YYMMDD + 6碼亂數
export function generateOrderId(): string {
  return `FL${getDateCode()}${randomCode()}`
}

// 子訂單號：FL + YYMMDD + 6碼亂數 + E/S
export function generateSubOrderId(category: 'esim' | 'sim'): string {
  const suffix = category === 'esim' ? 'E' : 'S'
  return `FL${getDateCode()}${randomCode()}${suffix}`
}

// SKU 單號：子訂單號 + 0~9
export function generateSkuId(subOrderNumber: string, index: number): string {
  return `${subOrderNumber}${index}`
}
