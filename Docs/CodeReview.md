# FLESIM C-END 程式碼審查報告

> 審查日期：2026-04-04
> 審查範圍：全部 API 路由、頁面、元件、工具函式

---

## 一、架構概覽

```
前台：bc_countries → country_packages → packages → package_plans → package_plan_prices
訂單：orders → sub_orders → order_skus
卡片：order_skus (ICCID) + member_iccids (手動新增)
```

### API 路由統計
- 管理端 API：31 個
- 前台/公開 API：19 個
- Auth 路由：4 個
- **合計：54 個路由**

### 頁面統計
- 管理端頁面：22 個
- 前台頁面：20 個

### 元件：12 個 | 工具函式：14 個

---

## 二、已修正的問題

### 2.1 已刪除的無用程式碼
- [x] `src/lib/countries.ts` — 靜態國家資料，全專案 0 引用
- [x] `src/app/api/admin/debug/route.ts` — 生產環境暴露付款原始資料
- [x] `src/types/index.ts` — 移除 Product, DailyPlan, FixedPlan, Member, AfterSale, Payment 等舊型別
- [x] `src/app/api/admin/dashboard/route.ts` — 移除 console.log 洩漏敏感資料

### 2.2 已刪除的舊架構檔案（前次清理）
- [x] `src/app/api/orders/route.ts` — 舊結帳 API（已被 /api/checkout 取代）
- [x] `src/app/api/products/route.ts` — 舊公開商品 API
- [x] `src/app/api/admin/products/route.ts` — 舊 products CRUD
- [x] `src/app/api/admin/products/[id]/` — 整個目錄（import-plans, bound-plans, plans, route）

### 2.3 已生成的清理 Migration
- `024-drop-legacy-tables.sql` — 刪除 products, product_packages, product_plans, product_plan_prices, product_bc_mapping, daily_plans, fixed_plans

---

## 三、待改進事項

### 3.1 安全性 (P1)

| 問題 | 位置 | 說明 | 建議 |
|------|------|------|------|
| Admin 認證用明文 Cookie | `api/admin/auth/route.ts` | 密碼直接存為 cookie 值比對 | 改用 JWT 或 session token |
| Auth 檢查不一致 | 多個 admin API | 約半數用 `checkAdminAuth()`，半數自行內聯 | 統一使用 `@/lib/admin.ts` |

### 3.2 向後相容遺留 (P2)

| 問題 | 位置 | 說明 | 建議 |
|------|------|------|------|
| order_items 仍在寫入 | `api/checkout/route.ts` L211 | 結帳時同時寫入 order_items（向後相容） | 遷移前台訂單頁到 order_skus 後移除 |
| esim_profiles 仍在寫入 | `api/webhooks/billionconnect/route.ts` L87 | Webhook 同時寫入 esim_profiles | 同上 |
| order_items 仍在讀取 | `app/orders/[orderId]/page.tsx` L24 | 前台訂單詳情讀取 order_items | 改為讀取 sub_orders + order_skus |
| esim_profiles 仍在讀取 | `app/orders/[orderId]/page.tsx` L34 | 前台訂單詳情讀取 esim_profiles | 改為讀取 order_skus |
| after-sale 用 order_items | `api/after-sale/route.ts` L37 | 售後 API 讀取 order_items 的 ICCID | 改為讀取 order_skus |

### 3.3 未使用的 BC API 函式 (P3)

| 函式 | 位置 | 說明 |
|------|------|------|
| `createSimOrder` (F006) | `billionconnect.ts` | SIM 卡郵寄訂單，目前 SIM 走 F007 充值流程 |
| `cancelOrder` (F008) | `billionconnect.ts` | 訂單取消，未接入任何 UI |
| `getPlanUsage` (F012) | `billionconnect.ts` | 套餐使用 v1，已被 `getPlanUsageV2` (F046) 取代 |
| `getAfterSaleInfo` (F020) | `billionconnect.ts` | 售後查詢，未接入 UI |

> 建議保留這些函式，未來售後和取消功能會用到。

### 3.4 TapPay 商戶 ID 不一致 (P2)

| 問題 | 位置 |
|------|------|
| `payByToken` 直接用 `process.env.TAPPAY_MERCHANT_ID` | `src/lib/tappay.ts` L158 |
| `payByPrime` 用 `getMerchantId()` 從資料庫讀取 | `src/lib/tappay.ts` L60 |

> Token 付款忽略了資料庫設定的商戶 ID，建議統一。

---

## 四、資料庫表使用狀況

### 正在使用的表（21 個）

| 表名 | 引用次數 | 用途 |
|------|---------|------|
| bc_products | 26 | BC 商品目錄（同步） |
| bc_countries | 21 | 國家/區域/全球分組 |
| sub_orders | 21 | L2 子訂單 |
| order_skus | 17 | L3 SKU 明細 |
| orders | 17 | L1 主訂單 |
| package_plans | 17 | 套餐 → BC 商品 |
| packages | 12 | 套餐定義 |
| country_packages | 12 | 國家 → 套餐 |
| members | 12 | 會員 |
| package_plan_prices | 9 | 價格 |
| member_cards | 6 | 已儲存付款卡 |
| order_items | 4 | **舊架構（向後相容）** |
| esim_profiles | 4 | **舊架構（向後相容）** |
| system_settings | 3 | 系統設定 |
| payments | 3 | 付款記錄 |
| member_iccids | 3 | 手動新增 ICCID |
| exchange_rates | 2 | 匯率 |
| webhook_logs | 2 | Webhook 冪等 |
| after_sales | 2 | 售後 |

### 待刪除的表（Migration 024）

| 表名 | 說明 |
|------|------|
| products | 舊方案載體，已被 bc_countries 取代 |
| product_packages | 舊關聯表，已被 country_packages 取代 |
| product_plans | 舊的 product → BC 商品綁定 |
| product_plan_prices | 舊的 product 級別定價 |
| product_bc_mapping | 完全未使用 |
| daily_plans | 舊的日費套餐 |
| fixed_plans | 舊的固定套餐 |

---

## 五、邏輯正確性檢查

### 5.1 結帳流程 ✅
```
前台選商品 → 加入購物車(localStorage)
→ 結帳頁(/checkout) → TapPay 付款
→ /api/checkout：
  1. 建立 L1 主訂單 (orders)
  2. 按 eSIM/SIM 拆分 L2 子訂單 (sub_orders)
  3. 建立 L3 SKU (order_skus)
  4. eSIM 自動呼叫 BC F040
  5. 記錄付款 (payments)
```
邏輯正確，訂單號規則一致。

### 5.2 SIM 配卡流程 ✅
```
管理員填 ICCID → 點「批次儲存」
→ /api/admin/orders/[id]/bc-order
→ 呼叫 BC F007 (createRechargeOrder)
→ 回傳 BC orderId 和 subOrderId
```
邏輯正確。

### 5.3 Webhook 處理 ✅
- N009 (eSIM QR)：更新 order_skus + esim_profiles（向後相容）
- N001 (SIM 發貨)：更新 sub_orders 物流
- N002/N003 (流量)：更新 esim_profiles
- N013 (充值)：更新 order_skus
- 冪等處理：webhook_logs 去重

### 5.4 前台商品顯示 ✅
```
bc_countries → country_packages → packages → package_plans → package_plan_prices
```
本地/區域/全球統一使用 `country_packages`。

### 5.5 已知潛在問題

| 問題 | 嚴重度 | 說明 |
|------|--------|------|
| Webhook 簽名用 rawBody 比對 | 低 | 如果 BC 改變 JSON 序列化方式可能驗證失敗 |
| 購物車用 localStorage | 低 | 清除瀏覽器資料會遺失購物車 |
| BC API 沒有重試機制 | 中 | F040 呼叫失敗時 eSIM 子訂單狀態設為 pending，需手動重試 |
| 匯率手動管理 | 低 | 沒有自動更新匯率的機制 |

---

## 六、結論

專案架構已從四層簡化為直連模式，邏輯清晰。主要待辦：
1. **P1**：統一 Admin 認證方式
2. **P2**：遷移前台訂單頁到 order_skus，移除 order_items/esim_profiles 向後相容
3. **P2**：統一 TapPay 商戶 ID 來源
4. **P3**：接入售後和訂單取消功能
