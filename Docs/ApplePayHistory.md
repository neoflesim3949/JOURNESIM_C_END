# Antom Apple Pay 串接解決歷程

| 項目 | 內容 |
|---|---|
| 商戶 | Flesim.com HK Limited |
| 平台 | FLESIM（www.flesim.com）|
| 金流 | Antom（Ant International / Alipay+）Cashier Payment |
| 目的 | 完整記錄 Apple Pay 於 Web 端串接的所有嘗試、錯誤與結論，避免重複試錯 |
| 相關文件 | [[Antom_ApplePay_Modes]]（三模式對照）、`docs/RiskManagementPlan.md`（3DS）|

> **核心原則**：**「代碼是唯一的真相」**。Antom 客服的文字建議在此案中前後改口 5+ 次，最終皆以**官方範例 / 官方 SDK model / 實測事件序列**為準。

---

## 一、最終結論（TL;DR）

- **卡片 / 街口** → **嵌入式** `ELEMENT_PAYMENT`（v2 `AMSPaymentElement.mountComponent`）**實測可用**。
- **Apple Pay** → **全托管** `CHECKOUT_PAYMENT`（回 `normalUrl` 整頁跳轉）—— **本專案唯一實測可穩定喚起 Apple Pay 的模式**。
- **Apple Pay 嵌入式（不跳轉）在前端渲染層走不通**，兩支 SDK 都失敗（見下表），且**與後端 payload 無關**（payload 已由官方 Java SDK model 驗證正確）。推斷卡點在 **Antom 側 Apple Pay 商戶/網域資源設定**。

---

## 二、嘗試與結果總表

### 後端 `productScene` 模式

| 模式 | `productScene` | 前端 | Apple Pay 結果 |
|---|---|---|---|
| 全托管 Hosted | `CHECKOUT_PAYMENT` → `normalUrl` | 整頁跳轉 | ✅ **可喚起 Apple Pay**（最終採用）|
| 嵌入式 Payment Element | `ELEMENT_PAYMENT` | `mountComponent` 內嵌 | ❌ 前端渲染失敗（見下）|
| 彈窗 Popup | 不設 `productScene` | `createComponent` overlay | ❌ marmot SDK 資源載入失敗 |

### 前端 SDK × 方法（嵌入式/彈窗）

| SDK | 類別 / 方法 | 卡片 | Apple Pay |
|---|---|:---:|---|
| `js.antom.com/v2/ams-checkout.js` | `AMSPaymentElement.mountComponent` | ✅ 可渲染 | ❌ 卡 `SDK_START_OF_LOADING`（永不結束、無 `onError`）|
| `sdk.marmot-cloud.com/.../1.19.0/ams-checkout.min.js` | `AMSCashierPayment.mountComponent` | ❌ `Failed to create iframe` | ❌ `SDK_INTERNAL_ERROR: Failed to create iframe` → `SDK_CREATECOMPONENT_ERROR: Load resource timeout` |

**觀察到的前端事件序列（Apple Pay）**
```
v2    ：SDK_START_OF_LOADING → （靜默卡死，無後續、無 onError）
marmot：SDK_START_OF_LOADING → onError:SDK_INTERNAL_ERROR(Failed to create iframe)
                             → onError:SDK_CREATECOMPONENT_ERROR(Load resource timeout)
```

---

## 三、逐項排查與排除

| # | 假設 / 嘗試 | 動作 | 結果 |
|---|---|---|---|
| 1 | `applePayConfiguration` 放 `paymentMethodMetaData` 內 | 依早期 Antom 建議 | ❌ 仍卡 loading |
| 2 | `applePayConfiguration` 放 `paymentMethod` 頂層 | 依 Antom「改口」建議 | ❌ 仍卡 loading |
| 3 | 需開通「Web 嵌入式白名單」權限 | 請 Antom 開通 | ❌ **開通後仍卡 loading**（排除權限）|
| 4 | Apple Pay 該用 `availablePaymentMethod.paymentMethodTypeList` 指定 | 依官方文檔截圖修正 payload | ❌ 仍卡 loading（但**確認 payload 結構正確**）|
| 5 | 官方 Java SDK model 驗證 payload | clone `alipay/global-open-sdk-java` 對照 | ✅ 證實 `AvailablePaymentMethod.paymentMethodTypeList`、`PaymentMethod` **無** 頂層 `applePayConfiguration` 欄位 → payload 已正確、非 payload 問題 |
| 6 | 網域不符（`flesim.com` vs `www.flesim.com`）| 改用 www 測 | ❌ www 也卡 loading（排除網域）|
| 7 | SDK 類別錯（該用 `AMSCashierPayment`）| 換 marmot `AMSCashierPayment.mountComponent` | ❌ 改報 `Failed to create iframe` / `Load resource timeout`（marmot SDK 環境載不出資源）|

**結論**：payload、權限、網域、兩支 SDK 類別全數排除/試過，Apple Pay 嵌入式前端渲染仍失敗 → 問題不在我方可控範圍，指向 **Antom 側 Apple Pay 設定**。托管模式可用，故採之。

---

## 四、Apple Pay 必備前置（皆已完成，與模式無關）

| 前置 | 說明 | 狀態 |
|---|---|:---:|
| 網域驗證檔 | `public/.well-known/apple-developer-merchantid-domain-association`（www.flesim.com 回 200 text/plain 不轉址；`next.config.ts` 強制 Content-Type）| ✅ |
| `settlementStrategy.settlementCurrency` | 多幣別合約需指定結算幣別 = **USD**；TWD 未簽約 → `SETTLE_CONTRACT_NOT_MATCH` / `PROCESS_FAIL` | ✅ |
| `env.terminalType: WEB` | 網頁整合必填 | ✅ |
| `env.clientIp` | 真實公網 IP，內網/回環或缺失 → **靜默失敗** | ✅ |
| 裝置 | Safari + Apple Wallet 已加卡（`ApplePaySession` 自檢通過）| ✅ 測試端 |

---

## 五、最終線上設定（2026-07）

**後端** `src/app/api/payment/antom/session/route.ts`
```
productScene = isApplePay ? 'CHECKOUT_PAYMENT' : 'ELEMENT_PAYMENT'
Apple Pay：availablePaymentMethod.paymentMethodTypeList = [{ paymentMethodType: 'APPLEPAY' }]
           → 回應取 normalUrl，回傳 { redirect_url }
卡片/街口：paymentMethod（新卡帶 paymentMethodMetaData.is3DSAuthentication:true 強制 3DS；
           save_card 另帶 tokenizeMode 綁卡）→ 回傳 { paymentSessionData }
```

**前端** `src/app/checkout/page.tsx`
```
若回應有 redirect_url（Apple Pay）→ window.location = redirect_url（整頁跳轉托管頁）
否則（卡片/街口）→ loadAntomElement()（v2 AMSPaymentElement）.mountComponent('#antom-container')
                  → 自建「確認付款」鍵呼叫 inst.submitPayment()
畫面顯示 SDK 事件序列（antomEvents）便於手機診斷
```

---

## 六、待辦 / 對 Antom 的訴求

- ⏳ **請 Antom 檢查後台 Apple Pay 商戶/網域資源設定**（嵌入式渲染卡在 SDK 初始化 / 資源載入）。證據：
  - 後端 `createPaymentSession` 成功（貴方已確認），payload 經官方 Java SDK model 驗證正確。
  - 前端 v2 `AMSPaymentElement`：卡片正常，Apple Pay 卡 `SDK_START_OF_LOADING`、無 `onError`。
  - 前端 marmot `AMSCashierPayment`：`Failed to create iframe` → `Load resource timeout`。
  - 「Web 嵌入式白名單」已開通；www / apex 網域皆試；網域驗證檔、USD 結算、clientIp、terminalType 皆備。
- ⏳ 若 Antom 修復嵌入式 Apple Pay，前端可切回嵌入式（不跳轉）—— 切換點在 route.ts 的 `productScene` 與 checkout 的 SDK 載入。

---

## 六之一、彈窗模式最終結果（2026-07-15）

改用彈窗 `AMSCashierPayment.createComponent`（`CASHIER_PAYMENT`，不設 productScene）後：

- ✅ **彈窗成功開啟**（createComponent 有效，不再有 iframe / Load resource timeout）。
- ❌ **Apple Pay** 進入付款處理即報 `SDK_PAYMENT_ERROR`，Antom 彈窗顯示 *"Looks like there is an issue! Please return to checkout page and place the order again."*，加 `availablePaymentMethod.expressCheckout:true` 亦無效。
- 卡片 / 街口在同一 session/SDK 正常。

**跨模式一致結論**：Apple Pay 在**嵌入式（卡死）／彈窗（SDK_PAYMENT_ERROR）**皆於「商戶驗證 / 付款處理」階段失敗，而卡片全程正常 → 問題不在前端渲染或 payload，指向 **Antom 側未完成 www.flesim.com 的 Apple Pay 商戶/網域註冊綁定**（我方僅上傳 domain association 檔，Antom 端尚需於後台註冊）。

**現行處置**：卡片 / 街口以彈窗上線可用；Apple Pay 暫緩（或自後台 `antom_enabled_methods` 移除 APPLEPAY），待 Antom 修復後端註冊。

---

## 六之二、給 Antom 的工單（可直接複製）

```
【商戶】Flesim.com HK Limited｜正式環境｜網域 www.flesim.com
【問題】Web Cashier Payment：信用卡正常，惟 Apple Pay 於所有集成模式皆失敗。

【已確認正常】
- createPaymentSession 皆回 result S / SUCCESS（範例 paymentRequestId：FL260715NM8NDX）。
- 同一整合下，信用卡（paymentMethod=CARD）可正常渲染與付款。

【Apple Pay 失敗現象（依模式）】
1) 嵌入式 Payment Element（productScene=ELEMENT_PAYMENT，AMSPaymentElement.mountComponent）：
   前端事件停在 SDK_START_OF_LOADING，永不進展、無 onError。
2) 嵌入式（marmot 1.19.0 AMSCashierPayment.mountComponent）：
   onError SDK_INTERNAL_ERROR(Failed to create iframe) → SDK_CREATECOMPONENT_ERROR(Load resource timeout)。
3) 彈窗（CASHIER_PAYMENT 不設 productScene，AMSCashierPayment.createComponent）：
   彈窗可開，Apple Pay 進付款處理即 SDK_PAYMENT_ERROR，頁面顯示
   「Looks like there is an issue, please place the order again」。加 expressCheckout:true 無效。

【我方已備妥的前置】
- .well-known/apple-developer-merchantid-domain-association（www.flesim.com 回 200 text/plain 不轉址）。
- settlementStrategy.settlementCurrency=USD、env.terminalType=WEB、env.clientIp（真實公網 IP）。
- Apple Pay 以 availablePaymentMethod.paymentMethodTypeList=[{paymentMethodType:APPLEPAY}] 指定（經官方 Java SDK model 驗證結構正確）。
- 「Web 嵌入式白名單」已請貴方開通。裝置為 Safari + Apple Wallet 已加卡（ApplePaySession 自檢通過）。

【請協助確認】
貴方後台是否已完成 www.flesim.com 的 Apple Pay 商戶/網域註冊綁定？
Apple Pay 於各模式皆在「商戶驗證/付款處理」階段失敗、信用卡全程正常，研判為後端 Apple Pay 設定未完成。
```

---

## 六之三、確定根因（2026-07-15，查官方文檔後定案）

依 Antom 官方文檔 `ac/cashierpay/element` 與 `ac/antomop/applepay`：

- Apple Pay Web 需 **「Apple Pay domain name configuration（網域/憑證設定）」**——**Antom 為商戶自架結帳頁設定憑證，Apple 以此憑證於「發起 payment session 前」驗證交易**。
- `applePayConfiguration` 位於 `paymentMethod.paymentMethodMetaData`，須含 `requiredShippingContactFields` / `requiredBillingContactFields` / `buttonsBundled`（本專案已補齊，對齊官方 Payment Element 範例）。

**定案根因**：前端 `SDK_START_OF_LOADING` 卡死＝SDK 進行 Apple Pay **商戶驗證**時，因 **www.flesim.com 未於 Antom 後台完成 Apple Pay 網域/憑證設定** 而卡住。我方僅上傳 `.well-known` domain association 檔（Apple 端一半），**Antom 後台的網域註冊＋憑證配置（另一半）尚未完成**。

**我方 code 已正確**（Payment Element + productScene=ELEMENT_PAYMENT + paymentMethod.paymentMethodType=APPLEPAY + paymentMethodMetaData.applePayConfiguration 含 contact fields + paymentFactor.captureMode=AUTOMATIC）。

**解鎖行動（非程式，商戶於 Antom 端）**：
1. Antom Dashboard →「Apple Pay domain name configuration」→ 加入並驗證 `www.flesim.com`、完成憑證設定。
2. 或寄 **TechnicalService@antom.com** 請其完成 www.flesim.com 的 Apple Pay 網域註冊與憑證配置。
3. 完成前，建議自後台 `antom_enabled_methods` 暫時移除 APPLEPAY，避免顧客撞到 loading。

---

## 六之四、最終確定根因（2026-07-15，查 Antom 後台後定案）

Antom Dashboard → Apple Pay → 分頁狀態：
- **域名管理**：`www.flesim.com`、`journesim-c-end.vercel.app` 已註冊 ✅
- **支付证书（Payment Processing Certificate）**：**尚未配置** ❌——對話框仍停在第一步「下載 CSR 文件」，代表未完成與 Apple 的憑證交換。

**確定根因**：Apple Pay 於載入時需以**支付處理憑證**完成商戶驗證；此憑證未配置 → 驗證卡住 → 前端永遠停在 `SDK_START_OF_LOADING`。域名驗證僅證明網域擁有權，**支付憑證才是授權實際收款的關鍵**。

**解鎖步驟（Antom 後台 + Apple Developer，非程式）**：
1. 支付证书配置對話框 →「下載」取得 Antom 產生的 **CSR**。
2. Apple Developer（需會員 + Merchant ID）→ Certificates → 建立 **Apple Pay Payment Processing Certificate** → 上傳 CSR → 下載 Apple 產生之 `.cer`。
3. 回 Antom →「继续」上傳 `.cer` 完成配置。
4. 無 Apple Developer 帳號者，可洽 Antom「联系销售开通」詢問是否提供**代管憑證**方案。

配置完成後 Apple Pay 載入即通過；本專案前端 code 已正確（Payment Element + productScene=ELEMENT_PAYMENT + paymentMethod.paymentMethodMetaData.applePayConfiguration 含 contact fields + paymentFactor.captureMode=AUTOMATIC）。

---

## 六之五、嵌入式 + submitPayment 最終狀態（2026-07-15）

依 Antom 真人客服指示（「嵌入式不需支付憑證，前端須自建按鈕呼叫 `submitPayment()`」）完成整合：
- 後端 `productScene=ELEMENT_PAYMENT`；前端 `AMSPaymentElement.mountComponent` 內嵌 `#antom-container`。
- 卡片/街口：自建送出鍵 → `inst.submitPayment().then({status,error,userCanceled3D})`，依官方處理回傳。
- Apple Pay：`applePayConfiguration.buttonsBundled` 原生按鈕。

**實測結果**：
- ✅ **卡片 / 街口：完全正常**（內嵌表單 + 送出鍵 + 3DS，可完成付款）。
- ❌ **Apple Pay：仍停在 `SDK_START_OF_LOADING`**（無 `SDK_END_OF_LOADING`、無 `onError`、按鈕未渲染）。

**決定性結論**：`submitPayment()` 是「送出階段」，而 Apple Pay 卡在更前面的「載入階段」，按鈕從未渲染 → 根本到不了 submitPayment。**同一 session/SDK/mountComponent，卡片可載入、唯 Apple Pay 載入卡死** → 確認為 Antom 端 Apple Pay「商戶/憑證驗證」（官方文檔：憑證用於「發起 payment session 前」驗證）未就緒，非前端整合問題。客服「不需憑證」之說與證據不符。

**現行處置**：卡片/街口以嵌入式上線可用；Apple Pay 待 Antom 端修復（優先確認「支付证书」——目前停在「下載 CSR」未完成）。上線前建議自後台 `antom_enabled_methods` 移除 APPLEPAY，避免顧客撞 loading。

---

## 六之六、Apple Pay 表成功跳出（2026-07-15）— 前端全通，僅剩支付憑證

依官方「Accept payments with Apple Pay」文檔逐一修正後，**Apple Pay Wallet 付款表已成功跳出**。四塊拼圖：
1. **SDK 版本 ≥ 1.46.0**：升級 marmot 1.19.0 → **1.47.0**（舊版無 APPLEPAY 外掛 → plugin unregistered / Failed to create iframe）。
2. **API 用 `createComponent`**（= CARD_APPLE_PAY plugin）取得元件 → `element.mount({selector})` → `element.submitPayment()`；**`mountComponent` 是 PayPal 專用**（用它拿不到 submitPayment）。
3. **單一 `paymentMethod`（非 availablePaymentMethod）**：availablePaymentMethod 會使 category=ALL。
4. **不帶 `productScene=ELEMENT_PAYMENT`**：ELEMENT_PAYMENT 會令 `paymentMethodCategoryType=ALL`，而 CARD_APPLE_PAY plugin 僅支援 **category=CARD**（無 productScene + 單一 paymentMethod → category=CARD）。

**最終卡點**：Apple Pay 表跳出、按下付款後**在客戶端授權階段即 `SDK_PAYMENT_CANCEL`，伺服器端零紀錄**（無 pay/notify/inquiry）。→ Apple 於授權時向 Antom 要「商戶驗證（merchant session）」，**此步需「支付证书（Payment Processing Certificate）」**；憑證未配（後台仍停在「下載 CSR」）→ 商戶驗證失敗 → 表取消。

**結論**：**前端／後端 payload 已全部正確、Apple Pay 表已可跳出**；唯一待辦＝完成 Antom 後台「支付证书」（下載 CSR → Apple Developer 產生 .cer → 回傳 Antom）。客服「不需憑證」僅適用於「渲染」；「實際扣款的商戶驗證」必須此憑證。

---

## 七、關鍵教訓

1. **後端請求成功 ≠ 前端能渲染**：`createPaymentSession` 成功只代表 session 建立，Apple Pay 出不出來是**前端 SDK 階段**，兩者需分開診斷。
2. **把 SDK 事件顯示到畫面**（手機無 console）是定位前端卡點的關鍵手段。
3. **以官方 SDK model / 官方範例為準**，勿盲信客服文字（本案客服建議多次自相矛盾）。
4. Apple Pay 的必備前置（網域、結算幣別、clientIp、terminalType）**任一缺失都可能靜默失敗、無錯誤訊息**。
