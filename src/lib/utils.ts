import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(amount: number): string {
  return `NT$ ${amount.toLocaleString()}`
}

// 6碼日期 YYMMDD
function getDateCode(): string {
  const now = new Date()
  const yy = String(now.getFullYear()).slice(2)
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
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
