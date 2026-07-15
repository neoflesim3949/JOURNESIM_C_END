# Antom Apple Pay 串接歷程與最終解法

| 項目 | 內容 |
|---|---|
| 商戶 | Flesim.com HK Limited |
| 平台 | FLESIM（www.flesim.com）｜Next.js App Router |
| 金流 | Antom（Ant International / Alipay+）One-time Payments · **Payment Element** |
| 狀態 | ✅ **嵌入式 Apple Pay 已可用**（2026-07-15 實測付款成功，TWD 計價 / USD 結算）|
| 相關 | `Docs/Antom_ApplePay_Modes.md`（模式對照）、`docs/RiskManagementPlan.md`（3DS）|

> 核心原則：**「代碼是唯一的真相」**。本案 Antom 客服建議前後改口 5+ 次、文檔散落十餘頁且範例新舊混雜；最終解法來自「官方 Payment Element 完整文檔的實際範例碼」+ 對 SDK 原始碼與 sessionData 的逐層解剖。

---

## 一、現行可用整合（最終解法）

### 架構總覽

```
結帳頁載入（不等 Email）
  → POST /api/checkout            建 pending 訂單（email 未填先用訪客佔位）
  → POST /api/payment/antom/session   createPaymentSession（ELEMENT_PAYMENT + 全部方式）
  → 前端 new AMSElement({sessionData}) → element.mount(...) 嵌入 #antom-container
  → SDK 渲染付款方式列表（信用卡 / Apple Pay / 街口 + 已綁定卡片）
  → 顧客選方式 → 點我方「確認付款」鈕（使用者手勢）→ element.submitPayment()
      · Apple Pay → 喚起 Wallet 付款表（顯示「付給 FLESIM.COM」）
      · 卡片    → 3DS 驗證（新卡強制）
  → SDK 自動導回 /payment/result → webhook(notifyPayment) + inquiryPayment 覆核
```

- Email／金額／點數／收件資料**變更時自動銷毀重建**元件（簽章比對 + 0.9s debounce）。
- 未填有效 Email 前「確認付款」禁用（訂單/eSIM 以 Email 交付）。

### 後端範例（`src/app/api/payment/antom/session/route.ts` 節錄）

```ts
// createPaymentSession —— Payment Element（嵌入式）正解
const payload = {
  productCode: 'CASHIER_PAYMENT',
  productScene: 'ELEMENT_PAYMENT',          // Payment Element 固定值（必填）
  paymentRequestId: order.order_number,
  order: {
    referenceOrderId: order.order_number,
    orderDescription: `FLESIM 訂單 ${order.order_number}`,
    orderAmount: { currency: 'TWD', value },
    merchant: { referenceMerchantId: 'FLESIM', merchantName: 'FLESIM.COM', merchantDisplayName: 'FLESIM.COM' },
    goods: [{ referenceGoodsId, goodsName, goodsQuantity: '1', goodsUnitAmount: { currency: 'TWD', value } }],
    buyer: { referenceBuyerId: email },
  },
  paymentAmount: { currency: 'TWD', value },
  // 付款方式列表：由 Payment Element 渲染（Apple Pay 不可用單一 paymentMethod 送）
  availablePaymentMethod: {
    paymentMethodTypeList: [
      { paymentMethodType: 'CARD' },
      { paymentMethodType: 'APPLEPAY' },
      { paymentMethodType: 'JKOPAY' },
    ],
    // 卡片參數放這層 metadata（applePayConfiguration 官方建議留空）
    paymentMethodMetaData: {
      is3DSAuthentication: true,            // 新卡強制 3DS（liability shift）
      tokenizeMode: 'ASKFORCONSENT',        // 登入會員顯示「儲存卡片」勾選
    },
  },
  // 會員已綁卡 → 元件內渲染「已儲存卡片」（paymentMethodType 必填，缺了報 not CARD）
  savedPaymentMethods: cards.map(c => ({ paymentMethodType: 'CARD', paymentMethodId: c.card_token })),
  settlementStrategy: { settlementCurrency: 'USD' },  // 多幣別合約必填，缺了 PROCESS_FAIL
  env: { terminalType: 'WEB', deviceLanguage: 'zh_TW', clientIp },  // clientIp 必填（Apple Pay 缺會靜默失敗）
  paymentRedirectUrl: `${origin}/payment/result?...`,
  paymentNotifyUrl: `${origin}/api/webhooks/antom`,
}
const res = await antomRequest('/ams/api/v1/payments/createPaymentSession', payload)
// 回傳 res.data.paymentSessionData 給前端（勿加工——僅本專案的 displayName 改寫例外，見五）
```

### 前端範例（`src/app/checkout/page.tsx` 節錄）

```ts
// SDK：js.antom.com/v2（v2.0.20+），類別用 AMSElement（不是 AMSCashierPayment！）
const ANTOM_SDK = 'https://js.antom.com/v2/ams-checkout.js'
const SDK = window.AMSElement

// 1) 建立元件（sessionData 在建構子傳入）
const element = new SDK({
  environment: 'prod',
  locale: 'zh_TW',
  sessionData,          // 後端回傳的 paymentSessionData
})

// 2) 嵌入結帳頁（type:'payment'；singleOption 用 'list'——'skip' 會非手勢喚起 Apple Pay → 空白+心跳逾時）
const r = await element.mount(
  { type: 'payment', appearance: { theme: 'default' }, notRedirectAfterComplete: false,
    merchantAppointParam: { singleOption: 'list' } },
  '#antom-container',
).catch(e => ({ error: e }))
if (r?.error) showError(r.error)

// 3) 顧客點「確認付款」（必須是使用者手勢——Apple Pay Wallet 的硬性要求）
const { status, userCanceled3D, session, error } = await element.submitPayment()
if (error) {
  if (userCanceled3D || status === 'PROCESSING') redirectToResultPageAndPoll()  // 結果未定 → 輪詢
  else if (error.code === 'FORM_INVALID') { /* SDK 已提示，忽略 */ }
  else showError(error)
} else if (session?.nextAction?.normalUrl) {
  window.location.href = session.nextAction.normalUrl   // 掃碼/APM 跳轉
} else if (status === 'SUCCESS' || status === 'PROCESSING') {
  redirectToResultPage()
}
```

### 關鍵參數速查

| 參數 | 值 | 為什麼 |
|---|---|---|
| `productScene` | `ELEMENT_PAYMENT` | Payment Element 必填固定值 |
| 方式指定 | `availablePaymentMethod.paymentMethodTypeList` | Apple Pay **不可**用單一 `paymentMethod` 送 |
| `applePayConfiguration` | **留空** | 官方：Payment Element 場景建議留空/預設 |
| SDK | **`AMSElement`** @ js.antom.com/v2 | `AMSCashierPayment` 是另一套（收銀台/drop-in），Apple Pay 在自架網域走不通 |
| 渲染 | `element.mount({type:'payment', singleOption:'list'})` | `'skip'` 非手勢喚起 → 空白 + `appHeartBeatTimeout` |
| 送出 | 使用者點按鈕 → `element.submitPayment()` | Wallet 必須由**新鮮手勢**觸發；mount 後自動呼叫會被 Safari 擋 |
| `settlementStrategy` | `{ settlementCurrency: 'USD' }` | 多幣別合約必填；計價幣別 TWD 可用 |
| `env.clientIp` | 真實公網 IP | 缺失 → Apple Pay **靜默失敗** |
| `savedPaymentMethods[]` | `{ paymentMethodType:'CARD', paymentMethodId }` | 型別必填，缺了報 `not CARD` |

---

## 二、從「不能用」到「能用」——歷程時間軸

| # | 階段（皆實測）| 症狀 | 學到什麼 |
|---|---|---|---|
| 1 | 托管 `CHECKOUT_PAYMENT` 跳轉 | ✅ Apple Pay 可用但整頁跳轉、體驗差 | 反證商戶合約/憑證本身 OK |
| 2 | 嵌入式 `AMSPaymentElement.mountComponent`（v2 舊認知）| ❌ 卡 `SDK_START_OF_LOADING` 靜默死 | 後端 SUCCESS ≠ 前端能渲染 |
| 3 | 各種 payload 排列（applePayConfiguration 頂層/metadata、白名單開通、www/apex）| ❌ 全部一樣卡 | 逐一排除參數/權限/網域 |
| 4 | 彈窗 marmot 1.19 `createComponent` | ⚠️ 表能跳但 `SDK_PAYMENT_ERROR`；後改 `Failed to create iframe` | marmot 1.19 太舊 |
| 5 | **升級 SDK 1.47**（官方要求 ≥1.46）+ `createComponent` + 單一 paymentMethod + 無 productScene | ✅ **Wallet 表第一次跳出**；❌ 授權瞬間 `SDK_PAYMENT_CANCEL` | 舊 SDK 無 APPLEPAY plugin 是前期卡死主因 |
| 6 | 解剖 merchant session：`domainName:"checkout.antom.com"` ≠ 頁面 `www.flesim.com` | ❌ Apple 網域不符 → 關表 | 該流程把 Apple Pay 跑在 Antom 跨網域 iframe |
| 7 | 窮舉客戶端修法：API 無 domain 參數（Java SDK 30 欄全掃）、SDK v1/v2 `initiativeContext`=0、攔改請求（在跨網域 iframe 攔不到）| ❌ 全數證死 | AMSCashierPayment 流程在自架網域**架構上走不通** |
| 8 | **發現官方 Payment Element 完整文檔：正解類別是 `AMSElement`**（`new AMSElement({sessionData})` → `mount()` → `submitPayment()`）| 🔑 整套重寫 | 前面全程用錯類別（AMSCashierPayment ≠ AMSElement）|
| 9 | AMSElement + `singleOption:'skip'` | ❌ 空白 + `appHeartBeatTimeout` | Wallet 不可非手勢喚起 |
| 10 | AMSElement + **`singleOption:'list'`** + 手勢按鈕 → submitPayment | ✅ **Apple Pay 付款成功！**（USD 2.46）| 2026-07-15 突破 |
| 11 | 幣別改回 TWD | ✅ 照樣成功 | 當初「TWD 不行」是錯流程的假象 |
| 12 | displayName 顯示 "Merchant" → sessionData metadata 改寫 | ✅ 顯示「付給 FLESIM.COM」 | Antom 伺服器寫死，API 參數不生效（見五）|
| 13 | 全方式列表 + 已綁卡 + 進頁即載（第一層嵌入）| ✅ 現行版 | 照官方 UX：一層選方式、一鍵確認 |

**歷程中曾誤判的根因**（記錄以免重蹈）：嵌入式白名單權限、支付证书（Payment Processing Certificate）未配置、網域驗證檔過期、TWD 幣別、瀏覽器不支援。**真正的根因是第 5、8、9 步的三件事：SDK 版本過舊、SDK 類別用錯、非手勢喚起。**（支付证书至今未配置，Apple Pay 照樣可收款——Antom 的預置商戶認證已涵蓋。）

---

## 三、六把鑰匙（缺一不可）

1. **SDK ≥ 1.46**（實用 js.antom.com/v2 = 2.0.20）——舊版無 APPLEPAY plugin。
2. **類別用 `AMSElement`**——Antom Web SDK 有兩套長很像的流程：`AMSCashierPayment`（收銀台/drop-in，Apple Pay 商戶驗證簽 checkout.antom.com、自架網域必死）vs **`AMSElement`（Payment Element，正解）**。
3. **`productScene: ELEMENT_PAYMENT` + `availablePaymentMethod`**（Apple Pay 不可用單一 paymentMethod）。
4. **`mount({type:'payment', singleOption:'list'})`**——'skip' 會在載入當下非手勢喚起 Apple Pay。
5. **`submitPayment()` 必須由使用者手勢觸發**（點擊當下呼叫；mount 後自動呼叫會被 Safari 擋）。
6. **前置齊備**：網域驗證檔（`.well-known/`）、Antom 後台域名管理註冊 www.flesim.com、`settlementCurrency: USD`、`env.clientIp`。

---

## 四、Apple Pay 前置條件（一次性設定）

| 前置 | 說明 | 狀態 |
|---|---|:---:|
| 網域驗證檔 | `public/.well-known/apple-developer-merchantid-domain-association`（www.flesim.com 回 200 text/plain 不轉址）| ✅ |
| Antom 後台域名管理 | Apple Pay → 域名管理 → 註冊 `www.flesim.com`（Payment Element 必要；托管模式不需）| ✅ |
| 結算幣別 | `settlementStrategy.settlementCurrency = USD`（多幣別合約必填；計價可 TWD）| ✅ |
| Apple Pay 開通 | Antom 後台 Apple Pay 狀態「已开通」（預置商戶認證，無需自備 Apple Developer 憑證）| ✅ |

---

## 五、殘留事項與 Workaround

| 事項 | 說明 |
|---|---|
| **displayName 改寫**（`checkout/page.tsx`）| Antom 產 session 時把 metadata 的 `merchantName` 寫死 `"Merchant"`（`order.merchant.*` API 參數不生效）。我方於傳入 SDK 前將 sessionData 第 4 段（base64 JSON、未簽章）中 `"merchantName":"Merchant"` 改寫為 `FLESIM.COM`，Wallet 表即顯示「付給 FLESIM.COM」。**正解**：工單請 Antom 於後台設定商戶顯示名稱，設妥後此改寫自然閒置（有 try/catch fallback，無風險）。|
| `appHeartBeatTimeout` log | SDK 與 iframe 的內部心跳重試訊息，於慢網路（閘道查詢 3~5s）常見，**不影響付款**，可忽略。|
| ALIPAY_HK 排除於列表 | AlipayHK 僅收 HKD，與 TWD 列表混用衝突；列表模式自動排除（要用需走單一方式流程）。|
| 訪客佔位訂單 | 進頁即建單：email 未填先以 `guest@flesim.com` 建 pending 單，填妥後自動重建正確訂單；棄單累積於後台屬預期。|
| 診斷碼待移除 | 畫面 SDK log 面板、console/fetch 攔截器為除錯期工具，穩定後應移除（sessionData displayName 改寫為功能性，保留）。|

---

## 六、關鍵教訓

1. **後端請求成功 ≠ 前端能渲染**：`createPaymentSession` SUCCESS 只代表 session 建立；Apple Pay 的成敗在前端 SDK 階段，需分開診斷。
2. **Antom Web SDK 有兩套流程**：`AMSCashierPayment`（收銀台）與 `AMSElement`（Payment Element）名字像、內部完全不同——**Apple Pay 在自架網域只有後者能用**。認錯類別會浪費以「週」計的時間。
3. **以官方完整範例碼為準**：客服口頭與零散文檔片段多次自相矛盾；本案每個突破都來自實際範例碼或 SDK 原始碼解剖。
4. **Apple Pay Wallet 必須由使用者手勢觸發**：任何 async 之後的自動 `submitPayment()` 都會被 Safari 擋（表不跳、心跳逾時）。
5. **把 SDK 事件/console 顯示到畫面**是手機（無 console）診斷的關鍵手段；解碼 sessionData / merchant session 則是定位「簽了什麼網域、什麼名稱」的決定性證據。
6. Apple Pay 前置（網域、結算幣別、clientIp）**任一缺失都可能靜默失敗、無錯誤訊息**。
