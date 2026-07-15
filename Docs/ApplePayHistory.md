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

## 七、關鍵教訓

1. **後端請求成功 ≠ 前端能渲染**：`createPaymentSession` 成功只代表 session 建立，Apple Pay 出不出來是**前端 SDK 階段**，兩者需分開診斷。
2. **把 SDK 事件顯示到畫面**（手機無 console）是定位前端卡點的關鍵手段。
3. **以官方 SDK model / 官方範例為準**，勿盲信客服文字（本案客服建議多次自相矛盾）。
4. Apple Pay 的必備前置（網域、結算幣別、clientIp、terminalType）**任一缺失都可能靜默失敗、無錯誤訊息**。
