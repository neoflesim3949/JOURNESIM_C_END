import { cookies } from 'next/headers'
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export const TRAVEL_COOKIE = 'travel_token'
const SESSION_DAYS = 30

// ---- 密碼雜湊（Node scrypt，不加套件）----
export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(pw, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = (stored || '').split(':')
  if (!salt || !hash) return false
  const derived = scryptSync(pw, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return derived.length === expected.length && timingSafeEqual(derived, expected)
}

// 產生一次性初始密碼（給管理者/業務）
export function genPassword(len = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const b = randomBytes(len)
  let s = ''
  for (let i = 0; i < len; i++) s += chars[b[i] % chars.length]
  return s
}

export function genSessionToken(): string {
  return randomBytes(32).toString('hex')
}

export function sessionExpiry(): string {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

export interface TravelSession {
  staff_id: string
  agency_id: string
  role: 'manager' | 'sales'
  display_name: string
  agency_name: string
}

// 讀 cookie → session → staff → agency，回傳登入資訊；無效回 null
export async function checkTravelAuth(): Promise<TravelSession | null> {
  const store = await cookies()
  const token = store.get(TRAVEL_COOKIE)?.value
  if (!token) return null
  const supabase = createAdminClient()
  const { data: sess } = await supabase.from('travel_sessions')
    .select('staff_id, agency_id, expires_at').eq('token', token).single()
  if (!sess || new Date(sess.expires_at).getTime() < Date.now()) return null
  const { data: staff } = await supabase.from('travel_staff')
    .select('id, role, display_name, active').eq('id', sess.staff_id).single()
  if (!staff || !staff.active) return null
  const { data: agency } = await supabase.from('travel_agencies')
    .select('name, status').eq('id', sess.agency_id).single()
  if (!agency || agency.status !== 'active') return null
  return {
    staff_id: sess.staff_id, agency_id: sess.agency_id,
    role: staff.role as 'manager' | 'sales',
    display_name: staff.display_name || staff.id, agency_name: agency.name,
  }
}
