# Antom Apple Pay 集成模式對照

| 項目 | 內容 |
|---|---|
| 商戶 | Flesim.com HK Limited |
| 平台 | FLESIM（www.flesim.com）|
| 金流 | Antom（Ant International / Alipay+）Cashier Payment |
| 目的 | 記錄各集成模式對 **Apple Pay** 的實測可用性，避免重複試錯 |

> 原則：**代碼是唯一的真相**。Antom 客服文字建議前後多次不一致，本表以本專案**實測結果**為準。

---

## 三種集成模式 × Apple Pay

| 模式 | 後端 `createPaymentSession` | 前端 SDK | Apple Pay | 依據 |
|---|---|---|:---:|---|
| **① 嵌入式 Payment Element** | `productScene: ELEMENT_PAYMENT` | `AMSPaymentElement.mountComponent(opts, '#container')`（內嵌 div）| ❌ **不能用** | 卡在 `SDK_START_OF_LOADING`、無 `onError`。**Antom 官方確認：商戶未開通「Web 嵌入式白名單」權限**。另：卡片內嵌不自帶送出鍵，需自建按鈕呼叫 `submitPayment()`。對應文檔 `cashierpay_zh-cn/apay_element` |
| **② 全托管 Hosted** | `productScene: CHECKOUT_PAYMENT` → 回 `normalUrl` | 整頁 `window.location = normalUrl` 跳轉 checkout.antom.com | ✅ **確認可用** | 本專案實測托管頁能穩定喚起 Apple Pay。缺點：離開本站、整頁跳轉 |
| **③ 彈窗 Popup（極速支付）** | `CASHIER_PAYMENT`（**不設 productScene**）；Apple Pay 用 `availablePaymentMethod.paymentMethodTypeList=[APPLEPAY] + expressCheckout:true`（**不送 `paymentMethod.paymentMethodType: APPLEPAY`**）| `AMSCashierPayment.createComponent({sessionData})`（本站彈窗）| ❓ **待實測** | Antom 建議 + 官方 Java 範例做法。目前上線版。彈窗疊在本站、不跳轉、無需白名單 |

**一句話**：① 嵌入式＝確定不行（除非開白名單）｜ ② 托管＝確定可行（要跳轉）｜ ③ 彈窗＝目前主打、待實測。

---

## 不論哪個模式都必備的 Apple Pay 前置（皆已補上）

| 前置 | 說明 | 狀態 |
|---|---|:---:|
| 網域驗證檔 | `public/.well-known/apple-developer-merchantid-domain-association`（www.flesim.com 回 200 text/plain 不轉址）| ✅ |
| `settlementStrategy.settlementCurrency` | 多幣別合約需指定結算幣別 = **USD**；TWD 未簽約 → `SETTLE_CONTRACT_NOT_MATCH` / `PROCESS_FAIL` | ✅ |
| `env.terminalType: WEB` | 網頁整合必填 | ✅ |
| `env.clientIp` | 真實公網 IP，內網/回環或缺失 → **靜默失敗**（無錯誤） | ✅ |
| 測試端 | 真機 **Safari + Apple Wallet 已加卡** | 測試需具備 |

---

## 目前線上設定（2026-07）

- **卡片 / 街口 / Apple Pay 全走【彈窗 Popup】**（模式 ③），`createComponent`，留在本站不跳轉。
- **新卡 / 首次綁卡** 於 `paymentFactor.is3DSAuthentication: true` 強制 3DS（見 `RiskManagementPlan.md`）。
- 切換點：`src/app/api/payment/antom/session/route.ts`。若彈窗 Apple Pay 實測不通，退回模式 ②（托管）只需重新加 `productScene: CHECKOUT_PAYMENT` 並回傳 `normalUrl`（git history commit `1b0badc` 為托管版參考）。

---

## 待辦 / 依賴

- ⏳ **實測模式 ③ 彈窗 Apple Pay**（commit `4fdb372`）—— 決定是否維持彈窗或退回托管。
- ⏳（可選）請 Antom 開通 **Web 嵌入式白名單**，才能改用模式 ① 內嵌（最佳體驗）。
