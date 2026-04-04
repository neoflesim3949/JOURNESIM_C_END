# FLESIM C-END — B2C 消費者端專案架構

> 本文件為 FLESIM C-END 獨立專案的完整架構說明。
> 此專案從原本 JOURNESIM（B2B2C）中拆出，專注做 **B2C 消費者購買 eSIM / SIM 卡** 的前台網站。

---

## 專案定位

```
億點（BillionConnect）
    │
    │  API（上游供應商）
    ▼
FLESIM C-END（本專案）
    ├── 後台管理（/admin）— 商品管理、套餐定價、訂單管理
    ├── 前台商城（/shop）— 消費者瀏覽購買
    │
    ▼
終端消費者
```

- **B2C 模式**：消費者在網站上瀏覽商品、下單付款、取得 eSIM
- BC 同步的原始商品存入資料庫後，由後台**自由組合成自有商品**再上架銷售
- 利潤 = 售價（TWD） - BC 成本價（CNY）

---

## 技術棧

| 項目 | 選型 |
|------|------|
| 前端框架 | Next.js 16（App Router） |
| React | React 19 |
| 語言 | TypeScript 5 |
| CSS | Tailwind CSS 4 |
| 資料庫 | Supabase（PostgreSQL） |
| 部署 | Vercel |
| 上游 API | BillionConnect |
| 金流 | TapPay |
| 圖示 | lucide-react |
| 工具 | clsx + tailwind-merge |
| 語系 | 繁體中文（單語系） |

---

## 商品資料架構

### 層級關係

```
bc_countries（BC 同步的國家，mcc = ISO alpha-2 如 "JP"）
    │
    ├── bc_products（BC 同步的原始商品，3600+ 筆）
    │   └── 每筆有 country_data[] 陣列，記錄覆蓋哪些國家
    │   └── 每筆有 prices[] 陣列，記錄不同 copies 的結算價
    │
    ▼
products（FLESIM 自組商品 / 方案）
    │   例：「中國 eSIM」、「日本 SIM 卡」
    │   由後台在國家下建立，指定 product_type（esim / sim）
    │
    ├── product_plans（綁定的 BC 套餐）
    │   │   每筆對應一個 bc_products.sku_id
    │   │   plan_category 自動判定：plan_type='1' → daily，否則 → fixed
    │   │
    │   └── product_plan_prices（每個 copies 的獨立售價）
    │       │   copies = "1", "2", "3"...（天數倍數）
    │       │   cost_price = BC 結算價（CNY）
    │       │   sell_price = 我們的售價（TWD），由後台設定
    │       │
    │       └── 實際天數 = bc_products.days × copies
```

### BC 商品 Type 碼分類

| 類別 | Type 碼 | 說明 |
|------|---------|------|
| eSIM | 110, 111, 3105, 3106 | eSIM 自選/固定/Air |
| SIM 卡 | 110, 111, 210~212, 220~221, 311, 3101~3104, 3201~3212 | 實體 SIM 卡 |
| 加速包 | 其他（不在 eSIM/SIM 列表中的） | 加速包商品 |

### BC 商品計費方式

| plan_type | 計費方式 | 說明 |
|-----------|---------|------|
| `"1"` | **單日型**（daily） | 每日有高速流量額度，用完降速，隔日重置 |
| `"0"` | **總量型**（fixed） | 固定總流量，用完即止 |

### 天數與 Copies 的關係

```
BC 商品的 days = 基礎天數（如 1 天）
BC 商品的 prices[] = 價格階梯，每個 tier 有 copies 值

實際天數 = days × copies

例：days=1, prices=[{copies:"1"}, {copies:"2"}, ..., {copies:"30"}]
    → 代表 1天、2天、3天...30天 共 30 種規格
    → 每種規格有獨立的結算價（settlementPrice）
```

### 流量顯示邏輯

```
優先使用 high_flow_size，fallback 使用 capacity
單位為 KB，轉換：KB → MB（÷1024）→ GB（÷1024²）

plan_type === '1'（單日型）→ 加 "/天" 後綴
null / "" / "-1"           → 顯示 "不限量" 或 "無限/天"

範例：
  high_flow_size = "1048576" + plan_type = "1"  → "1GB/天"
  high_flow_size = "524288"  + plan_type = "1"  → "512MB/天"
  capacity = "5242880"       + plan_type = "0"  → "5GB"
```

---

## 後台管理系統

### 入口與認證

- URL：`/admin-login`（密碼認證，存 cookie）
- 密碼：`.env.local` 的 `ADMIN_PASSWORD`

### 後台功能模組

```
/admin                       → 總覽（商品數、訂單數、會員數）
/admin/products              → 商品管理（國家列表，顯示每國已建幾個方案）
  └── /admin/products/[mcc]       → 該國家的方案列表（CRUD）
      └── /admin/products/[mcc]/[id]  → 方案詳情（綁定 BC 套餐 + 定價）
/admin/plans/esim            → eSIM 套餐列表（BC 同步資料）
/admin/plans/sim             → SIM 套餐列表
/admin/plans/acceleration    → 加速包套餐列表
/admin/orders                → 訂單管理
/admin/members               → 會員管理
/admin/sync                  → BC 同步（國家 + 商品）
/admin/params/countries      → 國家 MCC 管理
/admin/accounts              → 帳號管理
```

### 商品管理完整流程

```
1. BC 同步
   ├── 同步國家（F001）→ bc_countries 表
   └── 同步商品（F002 + F003 + F056）→ bc_products 表
       ├── 呼叫 5 個 BC API：
       │   ① F002（簡中）② F003（價格）③ F056（加速包簡中）
       │   ④ F002（英文）⑤ F056（加速包英文）
       ├── 合併去重，建立價格 map
       ├── 分批 upsert（每批 30 筆，避免 Nano 超載）
       └── 不存 raw_data（節省空間）

2. 建立方案
   ├── 進入「商品管理」→ 選擇國家（如 CN 中國）
   ├── 點「新增方案」→ 輸入名稱、選擇類型（eSIM / SIM）
   └── 建立後存入 products 表

3. 綁定 BC 套餐（進入方案詳情）
   ├── 「自動匯入」：
   │   ├── 從 bc_products 查詢 country_data 包含該國家的商品
   │   ├── 根據方案 product_type 過濾 BC type 碼
   │   │   eSIM → type IN (110, 111, 3105, 3106)
   │   │   SIM  → type IN (110, 111, 210~3212)
   │   ├── 排除加速包（名稱含「加速」的）
   │   ├── 寫入 product_plans 表
   │   └── 展開 prices[] 的每個 copies → 寫入 product_plan_prices 表
   │
   ├── 「手動新增」：
   │   └── 彈窗搜尋 BC 商品 → 選擇匯入
   │
   └── 「批量操作」：
       ├── 勾選多個套餐 → 批量刪除
       ├── 勾選多個套餐 → 批量定價（固定價格 或 成本加成）
       └── 修改價格後 → 點「儲存」按鈕批量更新

4. 前台顯示
   └── 只顯示 sell_price > 0 的套餐（未定價的不顯示）
```

### 後台套餐列表（eSIM / SIM / 加速包）

```
- 從 bc_products 表讀取（不是即時呼叫 BC API）
- 根據 type 碼過濾分類
- 每個商品可展開顯示所有 copies（天數 × 結算價）
- 實際天數 = days × copies
- 支援天數篩選、流量篩選、搜尋
- 支援上架/下架切換（is_active）
```

---

## 前台商城系統

### 頁面架構

```
/                           → 首頁（Hero + 熱門目的地 + 特色介紹）
/shop                       → 國家列表（從 bc_countries 讀取，按洲別分組）
/shop/[countryCode]         → 該國家的方案列表（日費/固定套餐卡片）
/shop/[countryCode]/[id]    → 商品詳情頁（選速度 → 選天數 → 數量 → 購買）
/checkout                   → 結帳頁
/auth/login                 → 登入
/auth/register              → 註冊
/orders                     → 訂單列表
/orders/[id]                → 訂單詳情（含 eSIM QR Code）
/account                    → 會員中心
/account/simcards           → 我的卡片 (數位卡包)
/guide                      → eSIM 安裝教學
/after-sale                 → 售後服務
```

### 前台商品詳情頁交互邏輯

參考 BillionConnect 官網的交互模式：

#### 日費套餐（plan_type = "1"）

```
┌─────────────────────────────────────────┐
│ [日費套餐]  固定套餐                      │ ← Tab 切換
├─────────────────────────────────────────┤
│ 選擇手機套餐                              │
│ [500MB/天] [1GB/天] [2GB/天] [3GB/天]    │ ← 按 high_flow_size 分組
├─────────────────────────────────────────┤
│ 選擇天數                                  │
│ [1] [2] [3] [5] [7] [10] [14] [30]     │ ← 從 product_plan_prices.copies 展開
├─────────────────────────────────────────┤  │   實際天數 = days × copies
│ 數量    [- 1 +]                          │
├─────────────────────────────────────────┤
│ 總計    NT$ 299      [立即購買]           │ ← 價格 = sell_price × quantity
└─────────────────────────────────────────┘

邏輯：
1. 將日費套餐按 formatCapacity(high_flow_size) 分組為「速度選項」
2. 選擇速度後，合併該速度下所有套餐的 copy_prices
3. 每個 copies 計算實際天數（days × copies）作為「天數選項」
4. 價格直接取 product_plan_prices.sell_price（已含天數計算）
```

#### 固定套餐（plan_type = "0"）

```
┌─────────────────────────────────────────┐
│  日費套餐  [固定套餐]                      │ ← Tab 切換
├─────────────────────────────────────────┤
│ 選擇手機套餐                              │
│ ┌──────────────┐  ┌──────────────┐      │
│ │ ● 1GB        │  │   3GB        │      │ ← 每個 copies 展開為獨立卡片
│ │   7天  NT$149│  │   5天  NT$279│      │
│ └──────────────┘  └──────────────┘      │
│ ┌──────────────┐  ┌──────────────┐      │
│ │   5GB        │  │   10GB       │      │
│ │   7天  NT$429│  │   15天 NT$749│      │
│ └──────────────┘  └──────────────┘      │
├─────────────────────────────────────────┤
│ 數量    [- 1 +]                          │
├─────────────────────────────────────────┤
│ 總計    NT$ 149      [立即購買]           │
└─────────────────────────────────────────┘

邏輯：
1. 將固定套餐的每個 copies 展開為獨立選項卡片
2. 顯示容量（formatCapacity）、天數（days × copies）、售價
3. 價格直接取 product_plan_prices.sell_price
```

---

## 資料庫設計

### 核心資料表

| 資料表 | 說明 |
|--------|------|
| `bc_countries` | BC 同步的國家（mcc=ISO alpha-2, name, continent, flag_url） |
| `bc_products` | BC 同步的原始商品（3600+ 筆，含完整欄位 + prices JSONB） |
| `products` | FLESIM 自組方案（name, country_code, product_type, is_active） |
| `product_plans` | 方案綁定的 BC 套餐（product_id → bc_sku_id, plan_category） |
| `product_plan_prices` | 每個 copies 的獨立售價（copies, cost_price, sell_price） |
| `members` | 會員帳號（Supabase Auth uid） |
| `orders` | 訂單主檔（member_id, email, status, total_amount, bc_order_id） |
| `order_items` | 訂單明細（product_id, bc_sku_id, iccid, plan_status） |
| `esim_profiles` | eSIM QR Code（iccid, qr_code_url, sm_dp_address, status） |
| `after_sales` | 售後申請 |
| `payments` | TapPay 付款記錄 |
| `exchange_rates` | 交易匯率（TWD 為基準） |
| `webhook_logs` | BC Webhook 日誌（冪等處理） |

### 資料表關係圖

```
bc_countries (mcc)
    ↓ mcc = country_code
products (id, country_code, product_type)
    ↓ product_id
product_plans (id, product_id, bc_sku_id, plan_category)
    ↓ product_plan_id                    ↓ bc_sku_id
product_plan_prices (copies, sell_price)   bc_products (sku_id, prices, country_data)
```

---

## BC 同步邏輯

### 同步國家（POST /api/sync/countries）

```
呼叫 BC F001（salesMethod='5'）
→ 分批 30 筆 upsert 到 bc_countries（onConflict: mcc）
```

### 同步商品（POST /api/sync/products）

```
並行呼叫 5 個 BC API：
  ① F002（簡中, salesMethod='5'）
  ② F003（價格, salesMethod='5'）
  ③ F056（加速包簡中）
  ④ F002（英文, salesMethod='5'）
  ⑤ F056（加速包英文）

→ 合併 ① + ③ 去重（簡中名稱）
→ 建立價格 map（② skuId → prices[]）
→ 建立英文 map（④ + ⑤ skuId → {name, desc}）
→ 精簡 country_data 只保留 {mcc, name}
→ 不存 raw_data（節省 Nano 方案空間）
→ 分批 30 筆 upsert 到 bc_products（onConflict: sku_id）
```

---

## 訂單資料流

```
消費者 → 選擇套餐 → 填寫 Email → 選擇支付方式
    ▼
TapPay SDK 取得 Prime Token（前端）
    ▼
POST /api/orders → TapPay 扣款 → 建立訂單
    ▼
呼叫 BC API（F040 eSIM / F006 SIM）
    ▼
BC 推送 Webhook → POST /api/webhooks/billionconnect
    ├── N009: eSIM QR Code → 寫入 esim_profiles → 訂單完成
    └── N001: SIM 發貨通知 → 更新訂單狀態
    ▼
消費者 → 頁面顯示 QR Code / Email 通知
```

---

## 環境變數

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# BillionConnect
BILLIONCONNECT_URL=https://apiint-flow.billionconnect.com/Flow/saler/2.0/invoke
BILLIONCONNECT_APP_KEY=FLESIM
BILLIONCONNECT_APP_SECRET=

# Admin
ADMIN_PASSWORD=

# TapPay
NEXT_PUBLIC_TAPPAY_APP_ID=
NEXT_PUBLIC_TAPPAY_APP_KEY=
NEXT_PUBLIC_TAPPAY_ENV=sandbox
TAPPAY_PARTNER_KEY=
TAPPAY_MERCHANT_ID=
```

---

## 與 JOURNESIM 的差異

| 項目 | JOURNESIM（B2B2C） | FLESIM C-END（B2C） |
|------|---------------------|----------------------|
| 模式 | 多角色（Admin + Agent + C端） | 純消費者端 + 簡易後台 |
| 子網域路由 | 4 個子網域，Middleware 分流 | 單一網站，`/admin` 路徑 |
| 語系 | 5 語（zh-TW, zh-CN, en, ja, ko） | 繁體中文（單語系） |
| 代理商模組 | 有（API Key、預存款、批發價） | 無 |
| 商品定價 | 直接用 BC 同步商品 | BC 商品 → 自組方案 → 逐 copies 獨立定價 |
| 認證 | Supabase Auth + API Key | Supabase Auth（會員）+ 密碼（後台） |
