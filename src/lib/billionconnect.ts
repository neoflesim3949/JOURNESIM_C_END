import crypto from 'crypto'

const BC_URL = process.env.BILLIONCONNECT_URL!
const APP_KEY = process.env.BILLIONCONNECT_APP_KEY!
const APP_SECRET = process.env.BILLIONCONNECT_APP_SECRET!

// =====================================================
// 簽名工具
// =====================================================
function generateSign(body: object): string {
  const plaintext = APP_SECRET + JSON.stringify(body)
  return crypto.createHash('md5').update(plaintext, 'utf8').digest('hex')
}

function getTradeTime(): string {
  return new Date()
    .toISOString()
    .replace('T', ' ')
    .substring(0, 19)
}

// =====================================================
// 底層呼叫
// =====================================================
async function callBC<T>(tradeType: string, tradeData: object = {}): Promise<T> {
  const body = {
    tradeType,
    tradeTime: getTradeTime(),
    tradeData,
  }

  const sign = generateSign(body)

  const res = await fetch(BC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'x-channel-id': APP_KEY,
      'x-sign-method': 'md5',
      'x-sign-value': sign,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    throw new Error(`BillionConnect HTTP error: ${res.status}`)
  }

  const data = await res.json()

  if (data.tradeCode !== '1000') {
    throw new Error(`BillionConnect API error [${data.tradeCode}]: ${data.tradeMsg}`)
  }

  return data.tradeData as T
}

// =====================================================
// F001 — 獲取覆蓋國家列表
// =====================================================
export async function getCountries(salesMethod: string, language = '1') {
  return callBC<BCCountry[]>('F001', { salesMethod, language })
}

// =====================================================
// F002 — 獲取商品
// =====================================================
export async function getProducts(params: {
  salesMethod: string
  skuId?: string
  countryCode?: string
  language?: string
  networkOperatorScope?: string
}) {
  return callBC<BCProduct[]>('F002', params)
}

// =====================================================
// F003 — 獲取商品價格
// =====================================================
export async function getProductPrices(salesMethod: string) {
  return callBC<BCProductPrice[]>('F003', { salesMethod })
}

// =====================================================
// F014 — 預存款查詢
// =====================================================
export async function getBalance() {
  return callBC<BCBalance>('F014', {})
}

// =====================================================
// F040 — 創建 eSIM 訂單
// =====================================================
export async function createEsimOrder(data: BCCreateEsimOrderInput) {
  return callBC<BCCreateOrderResult>('F040', data)
}

// =====================================================
// F006 — 創建卡訂單（郵寄/自提）
// =====================================================
export async function createSimOrder(data: BCCreateSimOrderInput) {
  return callBC<BCCreateOrderResult>('F006', data)
}

// =====================================================
// F007 — 創建充值訂單
// =====================================================
export async function createRechargeOrder(data: BCCreateRechargeOrderInput) {
  return callBC<BCCreateOrderResult>('F007', data)
}

// =====================================================
// F008 — 取消訂單
// =====================================================
export async function cancelOrder(orderId: string) {
  return callBC<null>('F008', { orderId })
}

// =====================================================
// F011 — 查詢訂單資訊
// =====================================================
export async function getOrderInfo(channelOrderId: string) {
  return callBC<BCOrderInfo>('F011', { channelOrderId })
}

// =====================================================
// F010 — 查詢卡有效期
// =====================================================
export async function getCardExpiry(iccid: string[]) {
  return callBC<BCCardExpiry[]>('F010', { iccid })
}

// =====================================================
// F012 — 查詢套餐使用信息
// =====================================================
export async function getPlanUsage(params: {
  iccid: string
  channelOrderId?: string
  language?: string
  planStatus?: string[]
}) {
  return callBC<BCPlanUsage[]>('F012', params)
}

// =====================================================
// F017 — 售後申請
// =====================================================
export async function createAfterSale(data: BCAfterSaleInput) {
  return callBC<{ afterSaleId: string }>('F017', data)
}

// =====================================================
// F020 — 查詢售後資訊
// =====================================================
export async function getAfterSaleInfo(afterSaleId: string) {
  return callBC<BCAfterSaleInfo>('F020', { afterSaleId })
}

// =====================================================
// F023 — 日流量查詢
// =====================================================
export async function getDailyTraffic(params: {
  iccid: string
  beginDate: string
  endDate: string
  tzType?: string
  language?: string
}) {
  return callBC<BCDailyTrafficItem[]>('F023', params)
}

// =====================================================
// F046 — 查詢套餐使用資訊 v2
// =====================================================
export async function getPlanUsageV2(params: {
  iccid: string
  orderId?: string
  channelOrderId?: string
  language?: string
}) {
  return callBC<BCPlanUsageV2>('F046', params)
}

// =====================================================
// F042 — 查詢 eSIM 服務狀態
// =====================================================
export async function getEsimServiceStatus(iccid: string) {
  return callBC<BCEsimServiceStatus>('F042', { iccid })
}

// =====================================================
// F054 — 查詢實名認證狀態
// =====================================================
export async function getRealNameStatus(iccid: string) {
  return callBC<BCRealNameStatus>('F054', { iccid })
}

// =====================================================
// F052 — 查詢 eSIM 充值商品
// =====================================================
export async function getEsimRechargeProducts(iccid: string) {
  return callBC<BCEsimRechargeResult>('F052', { iccid })
}

// =====================================================
// F056 — 查詢所有加速包商品
// =====================================================
export async function getAccelerationProducts(params?: {
  skuId?: string
  countryCode?: string
  language?: string
}) {
  return callBC<BCProduct[]>('F056', params ?? {})
}

// =====================================================
// Types
// =====================================================
export interface BCCountry {
  continent: string
  mcc: string
  name: string
  url?: string
}

export interface BCProduct {
  skuId: string
  name: string
  type: string
  days?: string
  capacity?: string
  highFlowSize?: string
  limitFlowSpeed?: string
  hotspotSupport?: string
  planType?: string
  country?: BCProductCountry[]
  operatorInfo?: string
  apn?: string
  desc: string
  rechargeableProduct?: string
  rechargeableProductSeriesId?: string
  rechargeableProductSeriesName?: string
  productId?: string
  productName?: string
  validityPeroid?: string
  accelerationSupport?: string
  pointContactType?: string
  pointContactHours?: string
  timeZone?: string
  usageCount?: string
  estimatedUseTimeFlag?: string
  estimatedUseTimeGapHours?: string
  applyToDevice?: string
  applyToDeviceType?: string[]
  provider?: string
  refundPolicy?: string
  speedLimitRule?: string
  carrierValidityPeroid?: string
}

export interface BCProductCountry {
  mcc: string
  name: string
  apn: string
  apnUsername?: string
  apnPassword?: string
  apnType?: string
  authenticationType?: string
  apnTypeDesc?: string
  highSpeedTime?: string
  operatorInfo?: { operator: string; network: string; priority: string }[]
  ProviderZone?: string
  ip1?: string
  ip2?: string
  ip3?: string
  ipRemarks?: string
}

export interface BCProductPrice {
  skuId: string
  price: { copies: string; retailPrice: string; settlementPrice: string }[]
}

export interface BCBalance {
  accountBalance?: string
  saleBalance?: string
  currency?: string
  availableBalance?: string
  frozenBalance?: string
}

export interface BCCreateEsimOrderInput {
  channelOrderId: string
  email?: string
  totalAmount?: string
  discountAmount?: string
  estimatedUseTime?: string
  subOrderList: {
    channelSubOrderId: string
    deviceSkuId: string
    planSkuCopies: string
    number: string
    rechargeableESIM?: string
  }[]
}

export interface BCCreateSimOrderInput {
  channelOrderId: string
  express?: object
  selfPickup?: object
  totalAmount?: string
  subOrderList: {
    channelSubOrderId: string
    deviceSkuId: string
    planSkuId?: string
    planSkuCopies?: string
    number: string
  }[]
}

export interface BCCreateRechargeOrderInput {
  channelOrderId: string
  totalAmount?: string
  subOrderList: {
    channelSubOrderId: string
    iccid: string[]
    skuId: string
    copies: string
  }[]
}

export interface BCCreateOrderResult {
  orderId: string
  channelOrderId: string
  pickupCode?: string
  subOrderList: { subOrderId: string; channelSubOrderId: string }[]
}

export interface BCOrderInfo {
  orderId: string
  channelOrderId: string
  orderStatus: string
  courierNumber?: string
  createTime: string
  express?: object
  totalAmount?: string
  subOrderList: {
    subOrderId: string
    channelSubOrderId: string
    iccid?: string[]
    skuId?: string
  }[]
}

export interface BCCardExpiry {
  iccid: string
  type: string
  status: string
  expirationDate: string
  postponedMonth: string
  maxDelayMonth: string
  usageCount: string
}

export interface BCPlanUsage {
  orderId: string
  channelOrderId: string
  subOrderList: {
    subOrderId: string
    skuId: string
    skuName: string
    copies: string
    planStatus: string
    planStartTime?: string
    planEndTime?: string
    totalDays?: string
    remainingDays?: string
    totalTraffic?: string
    remainingTraffic?: string
  }[]
}

export interface BCAfterSaleInput {
  channelOrderId: string
  channelSubOrderId?: string
  reason: string
  iccid: string[]
  refundType: string
  refundAmount?: string
  unSubscribeFlow?: string
  receivingState?: string
  returnCardOrNot?: string
  comment?: string
}

export interface BCAfterSaleInfo {
  channelOrderId: string
  channelSubOrderId?: string
  afterSaleId: string
  iccid: string[]
  reason: string
  refundType: string
  refundAmount?: string
  unSubscribeFlow?: string
  returnDays?: string
  receivingState?: string
  returnCard?: string
  auditStatus: string
  auditOpinion?: string
  refundStatus?: string
  refundOpinion?: string
}

export interface BCDailyTrafficItem {
  usedDate: string
  type: string
  usedAmount: string
  country: string
  countryRegionCode: string
}

export interface BCPlanUsageV2Sub {
  skuId: string
  skuName: string
  copies: string
  planStatus: string
  planStartTime?: string
  planEndTime?: string
  totalDays?: string
  totalTraffic?: string
  highFlowSize?: string
  planType?: string
  usageInfoList?: { useDate: string; useageAmt: string }[]
  country?: { mcc: string; name: string; apn: string; apnType?: string }[]
}

export interface BCPlanUsageV2 {
  orderId: string
  channelOrderId: string
  subOrderList: BCPlanUsageV2Sub[]
}

export interface BCEsimServiceStatus {
  iccid: string
  esimStatus?: string
  profileStatus?: string
  smdpAddress?: string
  activationCode?: string
  qrCodeUrl?: string
  qrCodeContent?: string
}

export interface BCRealNameStatus {
  iccid: string
  realNameStatus?: string
  realNameType?: string
}

export interface BCEsimRechargeResult {
  iccidValidity?: string
  skuId?: string[]
}
