// 速買配（SmilePay / smse）電子發票 API client
// Docs: Docs/smse_API.md

import { createAdminClient } from '@/lib/supabase/admin'

const TEST_BASE = 'https://ssl.smse.com.tw/api_test'
const PROD_BASE = 'https://ssl.smse.com.tw/api'

// 預設測試帳號（可被環境變數覆蓋）
const DEFAULT_TEST_GRVC = 'SEI1000383'
const DEFAULT_TEST_VERIFY_KEY = 'CA448DE3B5C58417599FD5215CA7E9BC'

function getConfig() {
  const useProd = process.env.SMSE_USE_PROD === 'true'
  const base = useProd ? PROD_BASE : TEST_BASE
  const grvc = process.env.SMSE_GRVC || DEFAULT_TEST_GRVC
  const verifyKey = process.env.SMSE_VERIFY_KEY || DEFAULT_TEST_VERIFY_KEY
  return { base, grvc, verifyKey, useProd }
}

async function logSmseApi(entry: {
  api_type: string
  endpoint: string
  request_body: Record<string, string>
  response_body: Record<string, string | undefined> | null
  response_raw: string
  status: 'success' | 'error'
  smse_status_code: string | null
  error_message?: string
  duration_ms: number
}) {
  try {
    const supabase = createAdminClient()
    await supabase.from('smse_api_logs').insert(entry)
  } catch (e) {
    console.error('[smse log] write fail:', e)
  }
}

// 簡易 XML tag 取值（速買配回應結構固定，不引入 XML parser）
function pickXml(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))
  return m ? m[1].trim() : ''
}

export interface SmseIssueInput {
  // 發票資訊
  invoiceDate: string  // YYYY/MM/DD
  invoiceTime: string  // HH:MM:SS
  intype: '07' | '08'  // 一般稅額 / 特種稅額
  taxType: '1' | '2' | '3' | '4' | '9'  // 應稅/零稅率/免稅/特種/混合
  taxRate?: string     // Intype=08 + TaxType=4/9 才需要
  // 發票號碼 — 留空走系統配號
  invoiceNumber?: string
  randomNumber?: string

  // 對象類別 + 統編
  buyerType: 'B2C' | 'B2B' | 'B2G'
  buyerId?: string         // B2B/B2G 統編
  companyName?: string
  name?: string
  phone?: string
  email?: string
  address?: string

  // 捐贈 / 載具（僅 B2C）
  donate?: boolean
  loveKey?: string
  carrierType?: 'EJ0113' | '3J0002' | 'CQ0001'
  carrierId?: string

  // 商品明細
  items: { description: string; quantity: number; unitPrice: number; unit?: string; amount: number; remark?: string }[]
  allAmount: number
  unitTAX?: 'Y' | 'N' // B2B 才有效

  // 備註
  mainRemark?: string
  certificateRemark?: string
  dataId?: string // 不可重複自訂號碼
  orderid?: string // 可重複自訂號碼

  // 信用卡末四碼
  visaLast4?: string
}

export interface SmseIssueResult {
  ok: boolean
  status: string  // 速買配 Status
  desc: string
  invoiceNumber?: string
  randomNumber?: string
  invoiceDate?: string
  invoiceTime?: string
  invoiceType?: string
  carrierID?: string
  raw: string
  sentParams: Record<string, string>
}

export async function smseIssueInvoice(input: SmseIssueInput): Promise<SmseIssueResult> {
  const { base, grvc, verifyKey } = getConfig()

  const sep = '|'
  const params: Record<string, string> = {
    Grvc: grvc,
    Verify_key: verifyKey,
    InvoiceDate: input.invoiceDate,
    InvoiceTime: input.invoiceTime,
    Intype: input.intype,
    TaxType: input.taxType,
    Description: input.items.map(i => i.description).join(sep),
    Quantity: input.items.map(i => String(i.quantity)).join(sep),
    UnitPrice: input.items.map(i => String(i.unitPrice)).join(sep),
    Amount: input.items.map(i => String(i.amount)).join(sep),
    AllAmount: String(input.allAmount),
    DonateMark: input.donate ? '1' : '0',
  }
  if (input.items.some(i => i.unit)) params.Unit = input.items.map(i => i.unit || '').join(sep)
  if (input.items.some(i => i.remark)) params.Remark = input.items.map(i => i.remark || '').join(sep)
  if (input.invoiceNumber) params.InvoiceNumber = input.invoiceNumber
  if (input.randomNumber) params.RandomNumber = input.randomNumber
  if (input.taxRate) params.TaxRate = input.taxRate
  if (input.loveKey) params.LoveKey = input.loveKey
  if (input.visaLast4) params.Visa_Last4 = input.visaLast4
  if (input.mainRemark) params.MainRemark = input.mainRemark
  if (input.certificateRemark) params.Certificate_Remark = input.certificateRemark
  if (input.dataId) params.data_id = input.dataId
  if (input.orderid) params.orderid = input.orderid

  // 買受人
  if (input.buyerType === 'B2B' || input.buyerType === 'B2G') {
    if (!input.buyerId) throw new Error('B2B/B2G 必須提供統編 (Buyer_id)')
    params.Buyer_id = input.buyerId
    if (input.companyName) params.CompanyName = input.companyName
    if (input.buyerType === 'B2G') {
      params.UnitTAX = 'Y'
      params.Einvoice_Type = 'B2B'
    }
  } else {
    // B2C
    if (input.name) params.Name = input.name
    if (input.carrierType) {
      params.CarrierType = input.carrierType
      if (input.carrierId) {
        params.CarrierID = input.carrierId
        params.CarrierID2 = input.carrierId
      }
    }
  }
  if (input.phone) params.Phone = input.phone
  if (input.email) params.Email = input.email
  if (input.address) params.Address = input.address
  if (input.unitTAX) params.UnitTAX = input.unitTAX

  // 編碼為 form body（API 接受 GET/POST，用 POST 較安全）
  const body = new URLSearchParams(params).toString()
  const endpoint = `${base}/SPEinvoice_Storage.asp`
  const start = Date.now()
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body,
  })
  const text = await res.text()
  const duration = Date.now() - start

  const status = pickXml(text, 'Status')
  const ok = status === '0'
  const parsed = {
    invoiceNumber: pickXml(text, 'InvoiceNumber') || undefined,
    randomNumber: pickXml(text, 'RandomNumber') || undefined,
    invoiceDate: pickXml(text, 'InvoiceDate') || undefined,
    invoiceTime: pickXml(text, 'InvoiceTime') || undefined,
    invoiceType: pickXml(text, 'InvoiceType') || undefined,
    carrierID: pickXml(text, 'CarrierID') || undefined,
    desc: pickXml(text, 'Desc'),
  }

  // 寫入 log（含 verify_key 遮蔽）
  const safeParams = { ...params, Verify_key: '***' }
  await logSmseApi({
    api_type: 'issue',
    endpoint,
    request_body: safeParams,
    response_body: parsed,
    response_raw: text,
    status: ok ? 'success' : 'error',
    smse_status_code: status || null,
    error_message: ok ? undefined : `[${status}] ${parsed.desc}`,
    duration_ms: duration,
  })

  return { ok, status, ...parsed, raw: text, sentParams: params }
}

export function smseConfigSummary() {
  const { base, grvc, useProd } = getConfig()
  return { base, grvc, mode: useProd ? 'prod' : 'test' }
}

// =====================================================
// 作廢/註銷 SPEinvoice_Storage_Modify.asp
// =====================================================
export interface SmseModifyInput {
  invoiceNumber?: string
  invoiceDate?: string // YYYY/MM/DD（speedmate 接受 YYYY/MM/DD 或 YYYY-MM-DD）
  allowanceNumber?: string
  allowanceDate?: string
  types: 'Cancel' | 'Void' | 'CancelAllowance' | 'StopProcessing'
  cancelReason?: string
  voidReason?: string
  returnTaxDocumentNumber?: string
  remark?: string
}
export interface SmseModifyResult {
  ok: boolean
  status: string
  desc: string
  types?: string
  invoiceNumber?: string
  allowanceNumber?: string
  cancelDate?: string
  cancelTime?: string
  voidDate?: string
  voidTime?: string
  raw: string
}

export async function smseModifyInvoice(input: SmseModifyInput): Promise<SmseModifyResult> {
  const { base, grvc, verifyKey } = getConfig()
  const params: Record<string, string> = {
    Grvc: grvc,
    Verify_key: verifyKey,
    types: input.types,
  }
  if (input.invoiceNumber) params.InvoiceNumber = input.invoiceNumber
  if (input.invoiceDate) params.InvoiceDate = input.invoiceDate
  if (input.allowanceNumber) params.AllowanceNumber = input.allowanceNumber
  if (input.allowanceDate) params.AllowanceDate = input.allowanceDate
  if (input.cancelReason) params.CancelReason = input.cancelReason
  if (input.voidReason) params.VoidReason = input.voidReason
  if (input.returnTaxDocumentNumber) params.ReturnTaxDocumentNumber = input.returnTaxDocumentNumber
  if (input.remark) params.Remark = input.remark

  const endpoint = `${base}/SPEinvoice_Storage_Modify.asp`
  const start = Date.now()
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: new URLSearchParams(params).toString(),
  })
  const text = await res.text()
  const duration = Date.now() - start
  const status = pickXml(text, 'Status')
  const ok = status === '0'
  const parsed = {
    desc: pickXml(text, 'Desc'),
    types: pickXml(text, 'Types') || undefined,
    invoiceNumber: pickXml(text, 'InvoiceNumber') || undefined,
    allowanceNumber: pickXml(text, 'AllowanceNumber') || undefined,
    cancelDate: pickXml(text, 'CancelDate') || undefined,
    cancelTime: pickXml(text, 'CancelTime') || undefined,
    voidDate: pickXml(text, 'VoidDate') || undefined,
    voidTime: pickXml(text, 'VoidTime') || undefined,
  }
  await logSmseApi({
    api_type: 'modify',
    endpoint,
    request_body: { ...params, Verify_key: '***' },
    response_body: parsed,
    response_raw: text,
    status: ok ? 'success' : 'error',
    smse_status_code: status || null,
    error_message: ok ? undefined : `[${status}] ${parsed.desc}`,
    duration_ms: duration,
  })
  return { ok, status, ...parsed, raw: text }
}

// =====================================================
// 開立折讓單 SPEinvoice_Storage_Allowance.asp
// =====================================================
export interface SmseAllowanceInput {
  invoiceNumber: string
  invoiceDate: string  // YYYY/MM/DD
  allowanceNumber?: string
  allowanceDate?: string // YYYY-MM-DD
  allowanceType?: '1' | '2'
  items: {
    description: string
    quantity: number
    unitPriceExclTax: number // 未稅單價
    amountExclTax: number    // 各明細未稅總額
    tax: number              // 稅金
    taxType: '1' | '2' | '3' | '4'
    unit?: string
  }[]
}
export interface SmseAllowanceResult {
  ok: boolean
  status: string
  desc: string
  allowanceNumber?: string
  invoiceNumber?: string
  raw: string
}

export async function smseCreateAllowance(input: SmseAllowanceInput): Promise<SmseAllowanceResult> {
  const { base, grvc, verifyKey } = getConfig()
  const sep = '|'
  const params: Record<string, string> = {
    Grvc: grvc,
    Verify_key: verifyKey,
    InvoiceNumber: input.invoiceNumber,
    InvoiceDate: input.invoiceDate,
    Description: input.items.map(i => i.description).join(sep),
    Quantity: input.items.map(i => String(i.quantity)).join(sep),
    UnitPrice: input.items.map(i => String(i.unitPriceExclTax)).join(sep),
    Amount: input.items.map(i => String(i.amountExclTax)).join(sep),
    Tax: input.items.map(i => String(i.tax)).join(sep),
    TaxType: input.items.map(i => i.taxType).join(sep),
  }
  if (input.allowanceNumber) params.AllowanceNumber = input.allowanceNumber
  if (input.allowanceDate) params.AllowanceDate = input.allowanceDate
  if (input.allowanceType) params.AllowanceType = input.allowanceType
  if (input.items.some(i => i.unit)) params.Unit = input.items.map(i => i.unit || '').join(sep)

  const endpoint = `${base}/SPEinvoice_Storage_Allowance.asp`
  const start = Date.now()
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: new URLSearchParams(params).toString(),
  })
  const text = await res.text()
  const duration = Date.now() - start
  const status = pickXml(text, 'Status')
  const ok = status === '0'
  const parsed = {
    desc: pickXml(text, 'Desc'),
    allowanceNumber: pickXml(text, 'AllowanceNumber') || undefined,
    invoiceNumber: pickXml(text, 'InvoiceNumber') || undefined,
  }
  await logSmseApi({
    api_type: 'allowance',
    endpoint,
    request_body: { ...params, Verify_key: '***' },
    response_body: parsed,
    response_raw: text,
    status: ok ? 'success' : 'error',
    smse_status_code: status || null,
    error_message: ok ? undefined : `[${status}] ${parsed.desc}`,
    duration_ms: duration,
  })
  return { ok, status, ...parsed, raw: text }
}
