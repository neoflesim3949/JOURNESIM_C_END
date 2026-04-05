# 平台銷售 — 蝦皮購物模組

> 解析第三方電商平台（蝦皮）的訂單 Excel，匯入系統後自動對應商品、回填卡號、下單給億點。

---

## 一、功能概覽

```
蝦皮後台匯出 Excel
    │
    ▼
後台「平台銷售 → 蝦皮購物」
    ├── 1. 匯入 Excel → 解析訂單明細
    ├── 2. 商品名稱對應（蝦皮商品編碼 ↔ 系統 SKU）
    ├── 3. 產生明細標籤 / 商品標籤（網頁列印）
    ├── 4. 回填 ICCID
    └── 5. 自動向億點 API 下訂單（F007/F040）
```

---

## 二、側邊欄結構

```
平台銷售
  └── 蝦皮購物
        ├── 訂單匯入（上傳 Excel）
        ├── 訂單明細（列表 + 搜尋 + 狀態管理）
        ├── 商品對應（蝦皮商品編碼 ↔ 系統套餐/SKU）
        └── 標籤列印（明細標籤 + 商品標籤）
```

---

## 三、Excel 匯入欄位定義

### 3.1 Excel 原始表頭（全部記錄到 raw_data）

```
訂單編號|訂單狀態|熱門商品|退貨/退款狀態|買家帳號|訂單成立日期|商品總價|
買家支付運費|蝦皮補助運費|退貨運費|買家總支付金額|蝦皮補貼金額|蝦幣折抵|
銀行信用卡活動折抵|優惠代碼|賣家負擔優惠券|賣家負擔蝦幣回饋券|蝦皮負擔優惠券|
成交手續費|其他服務費|金流與系統處理費|分期付款期數|金流與系統處理費率|
成交手續費規則|名稱|商品名稱|商品ID|商品選項名稱|規格ID|
蝦皮商品編碼(商品ID_規格ID)|商品原價|商品活動價格|主商品貨號|商品選項貨號|
數量|退貨數量|促銷組合指標|蝦皮促銷組合折扣:促銷組合標籤|收件地址|
收件者電話|蝦皮專線和包裹查詢碼|取件門市店號|城市|行政區|郵遞區號|
收件者姓名|寄送方式|出貨方式|備貨時間|付款方式|最晚出貨日期|
包裹查詢號碼|買家付款時間|實際出貨時間|訂單完成時間|買家備註|備註
```

### 3.2 資料結構說明

一筆蝦皮訂單可能有多列 Excel 行（同一訂單購買多個不同商品）。

**判斷邏輯：**
- 訂單編號相同 → 同一筆訂單
- 第一列包含完整的訂單資訊、金流資訊、收件資訊
- 第二列以上的「基本訂單資訊」和「金流資訊」是重複的，以第一列為準
- 每一列的「商品資訊」都不同（不同商品）

**重複上傳邏輯：**
- 訂單編號已存在 → 更新可變欄位（訂單狀態、退貨/退款狀態、退貨數量）
- 訂單編號不存在 → 新增

---

## 四、顯示欄位分類

### 4.1 基本訂單資訊（訂單級別，同一訂單編號只存一次）

| Excel 欄位 | DB 欄位 | 說明 | 可更新 |
|-----------|---------|------|--------|
| 訂單編號 | `shopee_order_number` | 蝦皮訂單唯一識別碼 | — |
| 訂單狀態 | `order_status` | 目前狀態 | ✅ |
| 退貨/退款狀態 | `return_status` | 退貨退款進度 | ✅ |
| 買家帳號 | `buyer_account` | 蝦皮帳號 | — |
| 訂單成立日期 | `order_date` | 下單時間 | — |

### 4.2 金流資訊（訂單級別，同一訂單編號只存一次）

| Excel 欄位 | DB 欄位 | 說明 | 可更新 |
|-----------|---------|------|--------|
| 商品總價 | `product_total` | 商品金額合計 | ✅ |
| 買家支付運費 | `buyer_shipping_fee` | 買家付的運費 | ✅ |
| 蝦皮補助運費 | `shopee_shipping_subsidy` | 蝦皮補貼運費 | ✅ |
| 退貨運費 | `return_shipping_fee` | 退貨產生的運費 | ✅ |
| 買家總支付金額 | `buyer_total_payment` | 買家實際付款 | ✅ |
| 賣家負擔優惠券 | `seller_coupon` | 賣家折讓 | ✅ |
| 成交手續費 | `transaction_fee` | 蝦皮抽成 | ✅ |
| 其他服務費 | `other_service_fee` | 其他費用 | ✅ |
| 金流與系統處理費 | `payment_processing_fee` | 金流手續費 | ✅ |
| 金流與系統處理費率 | `payment_processing_rate` | 費率（%） | ✅ |

### 4.3 商品資訊（明細級別，每個商品一列）

| Excel 欄位 | DB 欄位 | 說明 | 對應用途 |
|-----------|---------|------|---------|
| 商品名稱 | `shopee_product_name` | 蝦皮顯示名稱（會變動） | 顯示 |
| 商品ID | `shopee_product_id` | 蝦皮商品 ID（穩定） | 對應綁定 |
| 商品選項名稱 | `shopee_variation_name` | 規格名稱（會變動） | 顯示 |
| 規格ID | `shopee_variation_id` | 規格 ID（穩定） | 對應綁定 |
| 蝦皮商品編碼 | `shopee_sku_code` | `商品ID_規格ID`（唯一鍵） | **核心對應鍵** |
| 商品原價 | `original_price` | 原價 | — |
| 商品活動價格 | `sale_price` | 活動價 | — |
| 數量 | `quantity` | 購買數量 | — |
| 退貨數量 | `return_quantity` | 退貨數量 | ✅ |

**重點：`shopee_sku_code`（商品ID_規格ID）是對應我們系統商品的唯一鍵。**
- 蝦皮商品名稱和選項名稱會定期修改
- 但 商品ID 和 規格ID 不會變
- 通過 `shopee_sku_code` 記錄對應關係，包含對應到哪個系統套餐和 copies

### 4.4 收件資訊（訂單級別）

| Excel 欄位 | DB 欄位 | 說明 |
|-----------|---------|------|
| 收件地址 | `shipping_address` | 完整地址 |
| 收件者電話 | `recipient_phone` | 電話 |
| 蝦皮專線和包裹查詢碼 | `shopee_tracking_code` | 物流查詢碼 |
| 取件門市店號 | `pickup_store_id` | 超商取件店號 |
| 城市 | `city` | 城市 |
| 行政區 | `district` | 行政區 |
| 郵遞區號 | `zip_code` | 郵遞區號 |
| 收件者姓名 | `recipient_name` | 收件人 |
| 寄送方式 | `shipping_method` | 寄送方式 |
| 出貨方式 | `fulfillment_method` | 出貨方式 |
| 付款方式 | `payment_method` | 付款方式 |
| 買家備註 | `buyer_note` | 買家留言 |
| 備註 | `seller_note` | 賣家備註 |

---

## 五、資料庫結構

### 5.1 蝦皮訂單表 `shopee_orders`

```sql
CREATE TABLE shopee_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- 基本訂單資訊
  shopee_order_number TEXT UNIQUE NOT NULL,
  order_status TEXT,
  return_status TEXT,
  buyer_account TEXT,
  order_date TIMESTAMPTZ,
  -- 金流資訊
  product_total NUMERIC,
  buyer_shipping_fee NUMERIC,
  shopee_shipping_subsidy NUMERIC,
  return_shipping_fee NUMERIC,
  buyer_total_payment NUMERIC,
  seller_coupon NUMERIC,
  transaction_fee NUMERIC,
  other_service_fee NUMERIC,
  payment_processing_fee NUMERIC,
  payment_processing_rate TEXT,
  -- 收件資訊
  recipient_name TEXT,
  recipient_phone TEXT,
  shipping_address TEXT,
  shopee_tracking_code TEXT,
  pickup_store_id TEXT,
  city TEXT,
  district TEXT,
  zip_code TEXT,
  shipping_method TEXT,
  fulfillment_method TEXT,
  payment_method TEXT,
  buyer_note TEXT,
  seller_note TEXT,
  -- 系統欄位
  internal_status TEXT DEFAULT 'pending',
  -- pending → processing → completed
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 5.2 蝦皮訂單明細 `shopee_order_items`

```sql
CREATE TABLE shopee_order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shopee_order_id UUID NOT NULL REFERENCES shopee_orders(id) ON DELETE CASCADE,
  -- 蝦皮商品資訊
  shopee_product_name TEXT,
  shopee_product_id TEXT,
  shopee_variation_name TEXT,
  shopee_variation_id TEXT,
  shopee_sku_code TEXT,         -- 商品ID_規格ID（核心對應鍵）
  original_price NUMERIC,
  sale_price NUMERIC,
  quantity INTEGER DEFAULT 1,
  return_quantity INTEGER DEFAULT 0,
  -- 系統對應
  matched_package_id UUID,      -- 對應 packages.id
  matched_plan_id UUID,         -- 對應 package_plans.id
  matched_copies TEXT,           -- 對應 copies
  bc_sku_id TEXT,                -- 對應 BC SKU ID
  -- 下單資訊
  iccid JSONB,                   -- 回填的卡號（陣列）
  bc_order_id TEXT,              -- 億點訂單號
  bc_sub_order_id TEXT,          -- 億點子訂單號
  status TEXT DEFAULT 'pending',
  -- pending → matched → iccid_filled → bc_ordered → completed
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 5.3 商品對應記錄 `shopee_product_mappings`

```sql
CREATE TABLE shopee_product_mappings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- 蝦皮側（用 ID 綁定，不用名稱）
  shopee_sku_code TEXT UNIQUE NOT NULL,  -- 商品ID_規格ID
  shopee_product_id TEXT,
  shopee_variation_id TEXT,
  shopee_product_name TEXT,              -- 最後一次匯入的名稱（僅供顯示）
  shopee_variation_name TEXT,            -- 最後一次匯入的選項名稱（僅供顯示）
  -- 系統側
  package_id UUID REFERENCES packages(id),
  package_plan_id UUID REFERENCES package_plans(id),
  copies TEXT,
  bc_sku_id TEXT,
  -- 時間
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 六、標籤列印規格

### 6.1 明細標籤（每筆訂單一張）

**尺寸：橫 100mm × 直 150mm**

```
┌────────────────────────────────────────────┐
│                                            │
│  蝦皮訂單：2304050123456789                 │
│  訂單日期：2026/04/05                       │
│                                            │
│  ─────────────────────────────────────────  │
│  收件人：王小明                              │
│  電話：0912-345-678                         │
│  地址：330 桃園市桃園區中正路 100 號          │
│  寄送方式：超商取貨                          │
│  門市店號：123456                            │
│  ─────────────────────────────────────────  │
│                                            │
│  商品明細：                                  │
│  ┌──────────────────────────────────────┐  │
│  │ 1. 日本 eSIM 7天 1GB/天   × 2       │  │
│  │    ICCID: 89812003919125316974       │  │
│  │    ICCID: 89812003919125317380       │  │
│  ├──────────────────────────────────────┤  │
│  │ 2. 泰國 SIM 5天 3GB       × 1       │  │
│  │    ICCID: 22107424500                │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  買家備註：請放管理室                        │
│  金額：NT$ 520                              │
│                                            │
└────────────────────────────────────────────┘
```

### 6.2 商品標籤（每張卡一個標籤）

**尺寸：橫 30mm × 直 15mm**

```
┌────────────────────────┐
│ 日本 eSIM · 1GB/天·7天  │
│ 89812003919125316974   │
└────────────────────────┘
```

### 6.3 列印實作

- 使用 `@media print` CSS 控制列印樣式
- 支援批次列印（勾選多筆）
- 明細標籤：100mm × 150mm（熱感應標籤紙）
- 商品標籤：30mm × 15mm（小型標籤紙）
- `window.print()` 觸發瀏覽器列印

---

## 七、流程

### 7.1 完整作業流程

```
1. 蝦皮後台匯出 Excel
2. 後台「蝦皮購物 → 訂單匯入」上傳
3. 系統自動解析：
   a. 按訂單編號分組（同一訂單可能多行）
   b. 訂單資訊/金流/收件 → shopee_orders（去重/更新）
   c. 每行商品 → shopee_order_items
   d. 查 shopee_product_mappings 自動對應
      ├── shopee_sku_code 已有對應 → 自動匹配，狀態設為 matched
      └── shopee_sku_code 首次出現 → 狀態設為 pending
4. 管理員處理「待對應」項目
   └── 搜尋系統套餐 → 選擇方案 + copies → 記錄到 shopee_product_mappings
       （下次匯入相同 shopee_sku_code 自動對應）
5. 全部對應完成後
   ├── SIM 卡：回填 ICCID → 批次下單給億點（F007）
   └── eSIM：直接批次下單給億點（F040，BC 回傳 ICCID）
6. 列印標籤
   ├── 明細標籤（貼在包裹上）100mm × 150mm
   └── 商品標籤（貼在卡片上）30mm × 15mm
7. 出貨
```

### 7.2 BC API 對接

| 商品類型 | BC API | 說明 |
|---------|--------|------|
| eSIM | F040 | 自動下單，BC 回傳 ICCID + QR Code |
| SIM（充值） | F007 | 帶 ICCID 下單 |
| SIM（郵寄） | F006 | 帶 ICCID + 物流資訊下單 |

**訂單號規則：**
- channelOrderId = `SP` + YYMMDD + 6碼亂數 + `E`/`S`
- channelSubOrderId = channelOrderId + 序號（1~9）
- 避免與主站訂單號（`FL` 開頭）衝突

---

## 八、未來擴展

- 支援其他平台（momo、PChome、Yahoo 拍賣）
- 每個平台一個子模組，共用「商品對應」和「標籤列印」邏輯
- 側邊欄結構預留：

```
平台銷售
  ├── 蝦皮購物
  ├── momo 購物（未來）
  ├── PChome（未來）
  └── Yahoo 拍賣（未來）
```

---

## 九、API 路由規劃

| 路由 | 方法 | 說明 |
|------|------|------|
| `/api/admin/shopee/import` | POST | 匯入 Excel 訂單 |
| `/api/admin/shopee/orders` | GET | 訂單列表（分頁+篩選） |
| `/api/admin/shopee/orders/[id]` | GET, PATCH | 訂單詳情、更新狀態/ICCID |
| `/api/admin/shopee/orders/[id]/bc-order` | POST | 送出 BC 訂單 |
| `/api/admin/shopee/mappings` | GET, POST, PATCH, DELETE | 商品對應 CRUD |
| `/api/admin/shopee/labels/detail` | POST | 生成明細標籤資料 |
| `/api/admin/shopee/labels/product` | POST | 生成商品標籤資料 |
