# Antom Cashier Payment（收銀台支付 / One-time Payments）串接參考

本文件彙整 Antom（Alipay+ / Ant International）**Cashier Payment（收銀台單筆支付）** 的開發者串接資訊，作為 FLESIM 前後端整合的單一參考。內容取自 Antom 官方文件（`docs.antom.com`），以繁體中文說明，欄位名稱 / JSON / API 英文術語維持原文。

## Cashier Payment 是什麼

Cashier Payment 讓商戶在自家網站 / App 收銀台收款，支援桌機網站、行動網站與 App，涵蓋電子錢包、銀行轉帳與信用卡等多種在地支付方式。

### 三種整合模式

| 模式 | 說明 | 對應 API |
| --- | --- | --- |
| **Payment Element 集成（Embedded，推薦）** | 於商戶頁面內嵌 Antom 前端元件（含 Apple Pay / Google Pay），先在伺服器建立支付 session，前端用 SDK 渲染 | `createPaymentSession` |
| **Checkout Page 集成（Hosted）** | 建立支付 session 後取得 Antom 收銀台 H5 URL，將使用者重定向過去付款 | `createPaymentSession`（取 `paymentSessionData` / URL） |
| **純 API 集成（API-only）** | 直接呼叫 `pay`，回傳跳轉 URL / scheme，由商戶自行導轉 | `pay` |

> SDK 集成（舊）已下架。純 API / 建立 session 皆走 AMS（Ant Merchant Services）閘道，統一使用 RSA 簽章。

---

## 來源頁面

成功擷取並整理的頁面：

- 總覽（zh-cn）：https://docs.antom.com/ac/cashierpay_zh-cn/overview
- 快速開始（zh-cn）：https://docs.antom.com/ac/cashierpay_zh-cn/quick_start
- 場景總覽（zh-cn）：https://docs.antom.com/ac/cashierpay_zh-cn/use_case_overview
- Payment Element 集成（zh-cn）：https://docs.antom.com/ac/cashierpay_zh-cn/element
- 請款 capture（zh-cn）：https://docs.antom.com/ac/cashierpay_zh-cn/capture
- 接收通知 notifications（zh-cn）：https://docs.antom.com/ac/cashierpay_zh-cn/notifications
- 取消 cancel（zh-cn）：https://docs.antom.com/ac/cashierpay_zh-cn/cancel
- 退款 refund（zh-cn）：https://docs.antom.com/ac/cashierpay_zh-cn/refund
- 對帳 reconcile（zh-cn）：https://docs.antom.com/ac/cashierpay_zh-cn/reconcile
- 最佳實踐 best_practice（zh-cn）：https://docs.antom.com/ac/cashierpay_zh-cn/best_practice
- 付款狀態說明：https://docs.antom.com/ac/cashierpay/payment_status_desc
- **API Reference（英文，欄位最完整）**
  - 簽名與驗簽：https://docs.antom.com/ac/ams_zh-cn/digital_signature ／ https://docs.antom.com/ac/ams/digital_signature
  - 閘道與請求規範：https://docs.antom.com/ac/ams/api_fund
  - createPaymentSession：https://docs.antom.com/ac/ams/session_cashier
  - pay：https://docs.antom.com/ac/ams/payment_cashier
  - inquiryPayment：https://docs.antom.com/ac/ams/paymentri_online
  - notifyPayment：https://docs.antom.com/ac/ams/paymentrn_online
  - capture：https://docs.antom.com/ac/ams/capture
  - cancel：https://docs.antom.com/ac/ams/paymentc_online
  - refund：https://docs.antom.com/ac/ams_zh-cn/refund_online

> 註：`cashierpay_zh-cn` 的多數頁面為 JS 導覽殼，正文欄位需由對應的 `ams` API Reference 頁補齊，本文件已合併。部分頁面（reconcile、payment methods 清單）內容稀疏，已於各節標註。

---

## 閘道與請求規範

所有請求皆為 **HTTPS POST**，Body 為 JSON，回應為 JSON。使用 SHA256 + RSA 簽章。

**請求 URL 格式**

```
https://{domain}/ams/api/{version}/{endpoint}
例：https://open-sea-global.alipay.com/ams/api/v1/payments/pay
```

**區域閘道 domain**

| 區域 | 建議 domain | 舊 / 其他 |
| --- | --- | --- |
| 亞洲（含東南亞） | `open-sea-global.alipay.com` | `open-sea.alipay.com` |
| 北美（非美國商戶） | `open-na-global.alipay.com` | `open-na.alipay.com` |
| 北美（美國商戶） | `open.antglobal-us.com` | — |
| 歐洲 | `open-de-global.alipay.com` | `open-eu.alipay.com`（僅店內支付） |

> **Sandbox vs Production**：先在 sandbox 測試，不影響 production 資料；完成後遷移只需更換請求 URL 與金鑰等設定（沙盒的 `Client-Id` 通常以 `SANDBOX_` 開頭，正式為 `T_`／實際值以 Dashboard 為準）。實際 sandbox 閘道位址請以 Antom Dashboard 提供者為準。

**必要 HTTP Header**

| Header | 必填 | 說明 |
| --- | --- | --- |
| `Content-Type` | 否 | `application/json; charset=UTF-8` |
| `Client-Id` | 是 | 商戶識別碼（綁定簽章金鑰） |
| `Request-Time` | 是 | 毫秒時間戳，例 `1685599933871` |
| `Signature` | 是 | `algorithm=RSA256, keyVersion=1, signature=<url-encoded-base64>` |
| `agent-token` | 否 | ISV 授權 token（最長 128 字） |

---

## 簽章 / 驗簽（Signature）

演算法：**SHA256withRSA**（Header 中標示為 `algorithm=RSA256`）。

**待簽名字串（請求）**

```
POST <http-uri>
<client-id>.<request-time>.<request-body>
```

- `<http-uri>`：資源路徑，例 `/ams/api/v1/payments/pay`
- `<client-id>`：例 `SANDBOX_5X00000000000000`
- `<request-time>`：毫秒時間戳，例 `1685599933871`
- `<request-body>`：完整 JSON 請求 body（原字串）

**簽名流程**

1. 依上式串接（第一行 `POST <uri>`，換行後 `client-id.request-time.request-body`）。
2. 用**商戶 RSA 私鑰**做 `SHA256withRSA` 簽名。
3. 對簽名結果做 Base64 編碼，再做 URL 編碼。
4. 放入 Header：`Signature: algorithm=RSA256, keyVersion=1, signature=<url-encoded-base64-signature>`。

**驗簽（回應 / 通知）**

Antom 的回應與通知皆帶簽章，應驗簽以確認來源。待驗字串：

```
POST <http-uri>
<client-id>.<response-time>.<response-body>
```

- `response-time` 為 ISO 8601（例 `2019-05-28T12:12:14+08:00`），取自回應 Header。
- 驗簽語法：`is_valid = sha256withRSA_verify(base64Decode(urlDecode(<signature>)), <content_to_be_validated>, <antomPublicKey>)`
- **重要：直接用原始 HTTP body 驗簽，不要先 JSON parse 再重組，否則驗簽會失敗。**

**金鑰設定**

- 商戶：RSA 私鑰（PKCS8、Base64 編碼）用於簽自己的請求。
- Antom：公鑰（由 Antom Dashboard 取得）用於驗 Antom 回應 / 通知。
- 可用 Antom SDK 的 `SignatureTool.sign(...)` / `SignatureTool.verify(httpMethod, path, clientId, rspTime, rspBody, signature, antomPublicKey)` 簡化實作。

---

## 快速開始（Quick Start）

整體流程（以推薦的 Payment Element / Checkout 為主）：

1. **伺服器**：呼叫 `createPaymentSession` 建立支付 session，取得 `paymentSessionData`。
2. **前端**：用 `paymentSessionData` 初始化 Antom 前端 SDK（Element 內嵌）或重定向至收銀台 URL（Hosted）。使用者完成付款後導回 `paymentRedirectUrl`。
3. **伺服器**：接收 `notifyPayment` 非同步通知（打到 `paymentNotifyUrl`），**驗簽**後更新訂單，回傳 success。
4. **伺服器**：以 `inquiryPayment` 主動查詢做二次確認（避免只信前端導回結果）。
5. 後續視需要進行 `capture`（手動請款）、`refund`、`cancel`、對帳。

純 API 模式則以 `pay` 取代步驟 1–2，直接取得跳轉 URL。

---

## Payment Element 集成 / 建立支付 Session — `createPaymentSession`

用途：伺服器建立支付 session，回傳加密的 `paymentSessionData` 給前端渲染 Element 或導轉收銀台。

**端點**

```
POST /ams/api/v1/payments/createPaymentSession
```

**主要請求欄位**

| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `productCode` | String | 是 | 固定 `CASHIER_PAYMENT` |
| `paymentRequestId` | String | 是 | 商戶端唯一請求 ID（冪等），≤64 字 |
| `order` | Object | 是 | 買家 / 商戶 / 商品 / 物流資訊（風控與法遵用） |
| `paymentAmount` | Object | 是 | 收款金額，`{currency, value}`（`value` 為最小貨幣單位字串，如美金分） |
| `paymentRedirectUrl` | URL | 是 | 付款完成後導回的商戶頁，≤2048 字 |
| `paymentMethod` | Object | 否 | 指定支付方式 |
| `paymentNotifyUrl` | URL | 否 | 接收 `notifyPayment` 的 URL，≤2048 字（亦可於 Dashboard 設定） |
| `settlementStrategy` | Object | 是 | 結算策略（結算幣別等） |
| `env` | Object | 否 | 下單環境（`terminalType` 等） |
| `merchantRegion` | String | 否 | 2 碼國家 / 地區代碼（ISO 3166） |

**主要回應欄位**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `paymentSessionData` | String | 加密 session 資料，傳給前端 SDK，≤4096 字 |
| `paymentSessionId` | String | Antom 指派的 session ID，≤64 字 |
| `paymentSessionExpiryTime` | DateTime | session 到期時間（ISO 8601） |
| `result` | Object | `{resultCode, resultStatus, resultMessage}` |

---

## 純 API / 收銀台跳轉 — `pay`

用途：直接取得收銀台頁面 / 跳轉位址，由商戶自行導轉使用者付款。

**端點**

```
POST /ams/api/v1/payments/pay
```

**主要請求欄位**

| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `productCode` | String | 是 | 固定 `CASHIER_PAYMENT` |
| `paymentRequestId` | String | 是 | 商戶唯一請求 ID（冪等），≤64 字 |
| `order` | Object | 是 | 買家 / 商戶 / 商品資訊（風控、申報用） |
| `paymentAmount` | Amount | 是 | `{currency, value}` |
| `paymentMethod` | Object | 是 | 含 `paymentMethodType`（如 `CARD`、`ALIPAY_CN`、`KAKAOPAY`…） |
| `paymentRedirectUrl` | URL | 是 | 付款完成導回頁，≤2048 字 |
| `paymentNotifyUrl` | URL | 否 | 非同步通知位址，≤2048 字 |
| `env` | Object | 是 | 含 `terminalType`（`APP`/`WAP`/`WEB`/`MINI_APP`）與裝置資訊 |
| `settlementStrategy` | Object | 是 | 結算設定 |
| `merchantRegion` | String | 否 | ISO 3166 2 碼；GAGW 商品時必填 |

**主要回應欄位**

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `result` | Object | `{resultCode, resultStatus, resultMessage}` |
| `paymentId` | String | Antom 支付 ID（`resultCode = PAYMENT_IN_PROCESS` 時回傳） |
| `paymentData` | String | 前端 SDK 渲染資料，≤20000 字 |
| `normalUrl` | URL | WAP / WEB 跳轉 URL |
| `schemeUrl` | URL | iOS / Android 原生 scheme |
| `applinkUrl` | URL | Universal / App Link |
| `paymentAmount` | Amount | 回傳的請求金額 |

`result.resultStatus`：`S` 成功 / `F` 失敗 / `U` 處理中（`U` 且 `PAYMENT_IN_PROCESS` 時可取得跳轉 URL）。

---

## 接收通知 Webhook — `notifyPayment`

用途：支付到達成功 / 失敗終態時，Antom 以 **POST** 打到商戶 `paymentNotifyUrl`。

**觸發**：`pay` 或 `createPaymentSession` 的 `paymentNotifyUrl`，或 Dashboard「開發者 > 通知地址」設定。

**Notification（Body）主要欄位**

| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `notifyType` | String | 是 | `PAYMENT_RESULT`（終態）或 `PAYMENT_PENDING`（處理中） |
| `result` | Object | 是 | `{resultCode, resultStatus, resultMessage}`（`S` 成功 / `F` 失敗） |
| `paymentRequestId` | String | 是 | 商戶請求 ID，≤64 字 |
| `paymentId` | String | 是 | Antom 支付 ID，≤64 字 |
| `paymentAmount` | Object | 是 | `{currency, value}` |
| `paymentCreateTime` | DateTime | 是 | 建單時間（ISO 8601） |
| `paymentTime` | DateTime | 條件 | `resultStatus = S` 時回傳 |
| `grossSettlementAmount` | Object | 否 | 結算金額 |
| `customsDeclarationAmount` | Object | 否 | 報關金額 |

**進站 Header 範例**

```json
{
  "Content-Type": "application/json",
  "Request-Time": "2019-07-12T12:08:56+05:30",
  "client-id": "T_111222333",
  "Signature": "algorithm=RSA256,keyVersion=1,signature=..."
}
```

**驗簽**：用 Antom 公鑰驗證（見「簽章 / 驗簽」節）。務必以**原始 body** 驗簽。

**商戶必須回應的成功 body**（用以確認收訖，回應 Header 帶 `client-id`、`response-time`）

```json
{
  "result": {
    "resultCode": "SUCCESS",
    "resultStatus": "S",
    "resultMessage": "success"
  }
}
```

**重送策略**：24 小時內最多重送 8 次，間隔約 `0s, 2min, 10min, 10min, 1h, 2h, 6h, 15h`，直到收到正確回應。**務必實作冪等**以處理重複通知。

---

## 查詢 — `inquiryPayment`

用途：主動查詢支付結果（與非同步通知互補，做二次確認）。

**端點**

```
POST /ams/api/v1/payments/inquiryPayment
```

**請求欄位**（`paymentId` 或 `paymentRequestId` 擇一必填）

| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `paymentRequestId` | String | 擇一 | 商戶請求 ID，≤64 字 |
| `paymentId` | String | 擇一 | Antom 支付 ID，≤64 字 |
| `merchantAccountId` | String | 否 | 多門店帳號用，≤32 字 |

**主要回應欄位**

| 欄位 | 說明 |
| --- | --- |
| `result` | `{resultStatus(S/F/U), resultCode, resultMessage}` |
| `paymentStatus` | `SUCCESS` / `FAIL` / `PROCESSING` / `CANCELLED` / `PENDING` |
| `paymentResultCode` / `paymentResultMessage` | 狀態說明 |
| `paymentId` / `paymentRequestId` | 對應 ID |
| `paymentAmount` | 請求金額 |
| `paymentTime` / `paymentCreateTime` | 成功時間 / 建單時間（ISO 8601） |
| `transactions` | 後續退款 / 請款動作陣列 |
| `acquirerReferenceNo` | 收單機構交易號 |
| `paymentMethodType` | 使用的支付方式 |
| `authExpiryTime` | 卡片授權到期時間 |
| `metadata` | 原支付帶入的商戶資料 |

**`paymentStatus` 對應處置**

| 狀態 | 處置 |
| --- | --- |
| `SUCCESS` | 出貨 / 請款 |
| `FAIL` | 關單，或用**新的** `paymentRequestId` 重試 |
| `PROCESSING` | 繼續輪詢（間隔 3–5 秒）或等關單 |
| `CANCELLED` | 關單或重新發起 |
| `PENDING` | 繼續查詢或等非同步通知 |

---

## 請款 — `capture`

用途：分離授權 / 請款情境下，對已授權支付進行請款（手動 capture）。

**端點**

```
POST /ams/api/v1/payments/capture
```

**請求欄位**

| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `captureRequestId` | String | 是 | 商戶請款請求 ID，每次重試須換新 |
| `paymentId` | String | 是 | 授權階段的 Antom 支付 ID（須與 `notifyPayment` 一致） |
| `captureAmount.currency` | String | 是 | 須與原 `paymentAmount.currency` 一致 |
| `captureAmount.value` | String | 是 | 須與原金額一致 |

**回應欄位**：`captureId`（供後續退款）、`captureRequestId`、`captureTime`、`paymentId`、`captureAmount`、`result`。請款結果亦透過 `notifyCapture` 非同步通知。

**請求 / 回應範例**

```json
// Request
{
  "paymentId": "20241212********0211082739",
  "captureRequestId": "4c6c8ffd-*******eeb5af0e3f4",
  "captureAmount": { "currency": "USD", "value": "2000" }
}
```

```json
// Response
{
  "captureAmount": { "currency": "USD", "value": "2000" },
  "captureId": "2024121219********670209694544",
  "captureRequestId": "4c6c8ffd-*******eeb5af0e3f4",
  "captureTime": "2024-12-11T23:34:03-08:00",
  "paymentId": "20241212********0211082739",
  "result": { "resultCode": "SUCCESS", "resultMessage": "success", "resultStatus": "S" }
}
```

---

## 退款 — `refund`

用途：對已請款成功的交易退款（支援部分 / 全額，一年內可退）。

**端點**

```
POST /ams/api/v1/payments/refund
```

**請求欄位**

| 欄位 | 型別 | 必填 | 說明 |
| --- | --- | --- | --- |
| `refundRequestId` | String | 是 | 商戶端唯一退款 ID |
| `paymentId` | String | 是 | 須與支付通知的 `paymentId` 一致 |
| `refundAmount.currency` | String | 是 | 須與原支付幣別一致 |
| `refundAmount.value` | String | 是 | 最小貨幣單位正整數字串，不得超過原金額 |
| `refundReason` | String | 否 | 退款原因 |
| `refundNotifyUrl` | URL | 否 | 退款結果非同步通知 URL |

**回應欄位**：`refundId`、`refundRequestId`、`paymentId`、`refundAmount`、`refundTime`、`result`。

**請求 / 回應範例**

```json
// Request
{
  "paymentId": "20181129190741010007000000XXXX",
  "refundReason": "amsdemorefund",
  "refundRequestId": "20181129190741020007000000XXXX",
  "refundAmount": { "currency": "USD", "value": "1000" }
}
```

```json
// Response
{
  "result": { "resultCode": "SUCCESS", "resultStatus": "S", "resultMessage": "Success" },
  "refundAmount": { "value": "1000", "currency": "USD" },
  "refundTime": "2020-10-10T12:01:01+08:30",
  "paymentId": "20181129190741010007000000XXXX",
  "refundRequestId": "20181129190741020007000000XXXX",
  "refundId": "40181129190741020007000000XXXX"
}
```

---

## 取消 — `cancel`

用途：取消尚未完成 / 授權中的支付（同步回應，**無**非同步通知）。

**端點**

```
POST /ams/api/v1/payments/cancel
```

**請求欄位**（`paymentId` / `paymentRequestId` 擇一）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `paymentId` | String | Antom 支付 ID，≤64 字 |
| `paymentRequestId` | String | 商戶請求 ID，≤64 字 |
| `merchantAccountId` | String | 選填，≤32 字 |

**回應欄位**：`result`（`S`/`F`/`U`）、`paymentId`、`paymentRequestId`、`cancelTime`（成功時）。

**注意**：以相同 `paymentRequestId` 重複呼叫可避免重複取消；`resultStatus = U` 時最多重試 3 次，仍無果請聯繫技術支援；**已退款的支付不可取消**。

---

## 對帳 — Reconcile

用途：交易完成後，依 Antom 提供的財務報表 / 帳單對帳。

- 透過 Antom Dashboard / 財務報表取得帳單（詳細下載方式、檔案格式與欄位定義請見對帳專頁：https://docs.antom.com/ac/reconcile_zh-cn/overview）。
- 報表與商戶記錄不一致時，以 **Antom 報表為準**。
- 無法取得報表時聯繫 Antom 技術支援。

> 註：`cashierpay_zh-cn/reconcile` 頁內容稀疏，未列具體檔案格式 / API；如需程式化拉取帳單，需另查對帳專區。

---

## 付款方式與地區

Cashier Payment 支援桌機網站、行動網站、App，涵蓋：

- **電子錢包**：ALIPAY_CN、WECHATPAY、KAKAOPAY、GCASH、DANA、TRUEMONEY、GrabPay、TNG 等（在地錢包，依地區而定）
- **銀行轉帳 / APM**：各地在地銀行轉帳
- **信用卡**：`CARD`（含 Apple Pay / Google Pay 於 Element 模式）

`paymentMethodType` 於 `pay` / `paymentMethod` 指定。實際可用清單與地區、費率依商戶合約與 Dashboard 開通狀態為準。

> 註：`cashierpay_zh-cn` 未提供完整方法 / 地區對照表，上列為文件與常見值歸納；正式清單以 Antom Dashboard「支付方式」與各方法子頁為準。

---

## 錯誤碼 / 狀態碼

**`result.resultStatus`**：`S` 成功 / `F` 失敗 / `U` 處理中（不確定）。

**`result.resultCode`（常見）**：`SUCCESS`、`PAYMENT_IN_PROCESS`（支付處理中，回傳跳轉 URL / paymentId）等；失敗時回對應錯誤碼與 `resultMessage`。

**`paymentStatus`（inquiryPayment / 通知）**

| 狀態 | 意義 |
| --- | --- |
| `PROCESSING` | `pay` 成功、支付完成前的初始狀態 |
| `SUCCESS` | 支付成功（部分方式如 Sofort 需 1–3 天、最長 7 天確認）；退款後仍維持 SUCCESS |
| `FAIL` | 逾時（`pay` 後約 14 分鐘）或確認失敗 |
| `CANCELLED` | 於 T 日至 T+1 00:15 前用 cancel 取消；已退款者不可取消 |
| `PENDING` | 少數方式（如 Sofort）完成、最終確認前 |

> 完整錯誤碼清單依各 API Reference 頁「Result / Error codes」段落及 Antom 錯誤碼專頁；`cashierpay_zh-cn` 無獨立錯誤碼頁。

---

## 最佳實踐（Best Practice）

- **冪等與重試**：訂單用固定 `referenceOrderId`，每次重試換新的 `paymentRequestId`；重試前先查是否已成功，避免重複扣款。不支援退款的方式，重試前先 `cancel` 前一筆。
- **逾時處理**：`pay` timeout 設 10 秒以上；逾時後重發原請求以取回結果，提升跳轉成功率。
- **查詢輪詢**：`inquiryPayment` 後依結果處置——成功顯示完成；失敗引導重試；處理中顯示 loading，等 3–5 秒再查，勿一律歸因網路問題。
- **結果判定**：**切勿只靠前端導回**判定成功。自動請款卡片支付建議等 4 秒以上（P95）再顯示終態；手動請款須等 capture 成功才顯示完成，不能只憑授權。
- **通知處理**：實作驗簽 + 冪等；正確回 success，避免不必要重送。
- **金額 / 幣別**：capture / refund 的幣別與金額須與原授權一致，refund 不得超過原額。

---

## FLESIM 串接備忘

於 Next.js 收銀台整合的最小步驟（建議 Payment Element 或 Hosted）：

1. **伺服器建單（API Route，勿在前端）**
   - `POST https://{gateway}/ams/api/v1/payments/createPaymentSession`
   - body：`productCode=CASHIER_PAYMENT`、唯一 `paymentRequestId`、`paymentAmount{currency,value}`、`paymentRedirectUrl`、`paymentNotifyUrl`、`settlementStrategy`、`order`。
   - Header：`Client-Id`、`Request-Time`（毫秒）、`Signature`（用商戶私鑰對 `POST <uri>\n<clientId>.<requestTime>.<body>` 做 SHA256withRSA → Base64 → URLEncode）。
   - 取回 `paymentSessionData`，存下 `paymentRequestId` ↔ 訂單對應。

2. **前端渲染 / 導轉**
   - Element：用 `paymentSessionData` 初始化 Antom 前端 SDK 內嵌收銀台。
   - Hosted / 純 API：改用 `pay`，取 `normalUrl` / `schemeUrl` 導轉。
   - 完成後使用者導回 `paymentRedirectUrl`（僅作 UI，不作為成功依據）。

3. **接收通知 Webhook（API Route）**
   - Antom `POST` 到 `paymentNotifyUrl`（`notifyPayment`）。
   - 以**原始 body** + Antom 公鑰**驗簽**；驗簽通過才處理。
   - 依 `notifyType=PAYMENT_RESULT` 與 `result.resultStatus` 更新訂單（冪等：同 `paymentId` 只處理一次）。
   - 回傳 `{"result":{"resultCode":"SUCCESS","resultStatus":"S","resultMessage":"success"}}`。

4. **主動查詢確認**
   - 對關鍵訂單再呼叫 `inquiryPayment`（帶 `paymentRequestId` 或 `paymentId`）確認 `paymentStatus=SUCCESS` 才出貨 / 開卡。

5. **後續**：需要時 `capture`（手動請款）、`refund`、`cancel`；定期對帳。

**商戶須取得的憑證 / 設定**

| 項目 | 來源 / 說明 |
| --- | --- |
| `Client-Id` | Antom Dashboard（sandbox 與 prod 各一，值不同） |
| 商戶 RSA 私鑰 | 商戶自產金鑰對，私鑰用於簽章（PKCS8 Base64） |
| 商戶 RSA 公鑰 | 上傳至 Antom Dashboard 供 Antom 驗簽 |
| Antom 公鑰 | 自 Dashboard 取得，用於驗 Antom 回應 / 通知 |
| 閘道 URL | 依區域選（如亞洲 `open-sea-global.alipay.com`）；sandbox / prod 分開 |
| `paymentNotifyUrl` | 可於請求帶入或 Dashboard 設定的 webhook 位址 |
| 開通的支付方式 | Dashboard「支付方式」開通清單（決定可用 `paymentMethodType`） |

**環境切換**：sandbox → prod 只需更換閘道 URL 與對應 `Client-Id` / 金鑰；建議以環境變數管理（如 `ANTOM_GATEWAY`、`ANTOM_CLIENT_ID`、`ANTOM_PRIVATE_KEY`、`ANTOM_ANTOM_PUBLIC_KEY`）。
