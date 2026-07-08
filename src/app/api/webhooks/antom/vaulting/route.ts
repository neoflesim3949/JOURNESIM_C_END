import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAntomConfig, verifySignature, logAntomApi, extractCardInfo, saveMemberAntomCard } from '@/lib/antom'

// Antom 綁卡結果通知（notifyVaulting）
// 驗簽 → 取 cardToken → 寫入 member_cards（依 vaultingRequestId 對照會員）→ 必回固定 ACK
// 詳見 docs/Antom_API.md（Card vaulting）
const ACK = { result: { resultCode: 'SUCCESS', resultStatus: 'S', resultMessage: 'success' } }

export async function POST(request: Request) {
  const raw = await request.text()
  const clientId = request.headers.get('client-id') || ''
  const requestTime = request.headers.get('request-time') || ''
  const sigHeader = request.headers.get('signature') || ''
  const signature = /signature=([^,]+)/.exec(sigHeader)?.[1] || sigHeader
  const path = new URL(request.url).pathname

  const cfg = await getAntomConfig()
  if (cfg.alipayPublicKey) {
    const ok = verifySignature('POST', path, clientId, requestTime, raw, signature, cfg.alipayPublicKey)
    if (!ok) {
      console.error('[antom vaulting] 驗簽失敗')
      return NextResponse.json({ result: { resultCode: 'SIGNATURE_INVALID', resultStatus: 'F', resultMessage: 'invalid signature' } }, { status: 401 })
    }
  }

  let body: Record<string, unknown> = {}
  try { body = JSON.parse(raw) } catch {
    void logAntomApi({ action: 'notifyVaulting', endpoint: path, direction: 'incoming', request_body: { raw }, status: 'error', error_message: 'JSON 解析失敗' })
    return NextResponse.json(ACK)
  }

  const vaultingRequestId = String(body.vaultingRequestId || '')
  const status = String(body.vaultingStatus || '')
  const result = (body.result || {}) as Record<string, string>
  const success = status === 'SUCCESS' || result.resultStatus === 'S'
  const info = extractCardInfo(body)

  void logAntomApi({
    action: 'notifyVaulting', endpoint: path, direction: 'incoming',
    request_body: body, response_body: ACK,
    status: success ? 'success' : 'error', result_status: result.resultStatus || status || null,
  })

  if (vaultingRequestId && success && info) {
    const supabase = createAdminClient()
    const { data: reqRow } = await supabase.from('antom_vaulting_requests')
      .select('id, member_id, card_id').eq('vaulting_request_id', vaultingRequestId).single()
    if (reqRow) {
      const cardId = await saveMemberAntomCard(reqRow.member_id, info)
      await supabase.from('antom_vaulting_requests')
        .update({ status: 'success', card_id: cardId, updated_at: new Date().toISOString() })
        .eq('id', reqRow.id)
    }
  } else if (vaultingRequestId && !success) {
    const supabase = createAdminClient()
    await supabase.from('antom_vaulting_requests')
      .update({ status: 'fail', updated_at: new Date().toISOString() }).eq('vaulting_request_id', vaultingRequestId)
  }

  return NextResponse.json(ACK)
}
