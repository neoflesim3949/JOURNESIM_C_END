'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

/**
 * 推薦碼追蹤元件
 * 放在 RootLayout 中，負責捕捉 URL 中的 ref 參數並存入 Cookie 或 LocalStorage
 */
export function ReferralTracker() {
  const searchParams = useSearchParams()
  const ref = searchParams.get('ref')

  useEffect(() => {
    if (ref) {
      // 將推薦碼存入 LocalStorage，註冊時讀取
      localStorage.setItem('flesim_ref', ref)
      
      // 同時存入過期時間為 30 天的 Cookie (可選，這裡先用 localStorage 較簡單)
      document.cookie = `flesim_ref=${ref}; path=/; max-age=${30 * 24 * 60 * 60}; SameSite=Lax`
      
      console.log('Capture referral code:', ref)
    }
  }, [ref])

  return null
}
