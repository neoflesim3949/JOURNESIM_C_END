import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token = searchParams.get('token')
  const type = searchParams.get('type') || 'magiclink'
  const next = searchParams.get('next') || '/account'

  if (!token) {
    return NextResponse.redirect(`${origin}/auth/login?error=missing_token`)
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.verifyOtp({
    token_hash: token,
    type: type as 'magiclink',
  })

  if (error) {
    console.error('Verify OTP failed:', error)
    return NextResponse.redirect(`${origin}/auth/login?error=verify_failed`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
