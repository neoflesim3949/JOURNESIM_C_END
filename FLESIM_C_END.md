# FLESIM C-END 系統邏輯說明文件

本文件記錄 FLESIM 前台系統的核心邏輯，包括 SEO 優化與廣告追蹤機制。

---

## 1. SEO 搜尋引擎優化

系統採用 Next.js 的 Metadata API 進行全站與動態 SEO 管理。

### 1.1 全域設定 (Global Metadata)
- **檔案位置**：`src/app/layout.tsx`
- **內容**：定義網站標題模板 (`%s | FLESIM`)、預設描述、關鍵字、OpenGraph (OG) 與 Twitter Card 設定。
- **標準化**：所有頁面共用統一的 `metadataBase`，確保社交分享連結正確。

### 1.2 動態產品 SEO (Dynamic Metadata)
- **檔案位置**：`src/app/shop/[countryCode]/[productId]/layout.tsx`
- **邏輯**：
    - 根據 `productId` 從資料庫抓取套餐名稱與描述。
    - 根據 `countryCode` 抓取國家/地區中文名稱。
    - **動態標題格式**：`[套餐名稱] — [國家名稱]`。
    - **動態描述**：優先使用套餐自定義描述，若無則自動生成格式化文案。
    - **OG/Twitter**：同步更新社交平台分享資訊與專屬 URL。

### 1.3 結構化資料 (JSON-LD)
- **檔案位置**：`src/app/shop/[countryCode]/[productId]/layout.tsx` (`ProductJsonLd` 元件)
- **類型**：`Schema.org/Product`
- **欄位**：包含名稱、描述、品牌 (FLESIM)、最低價格 (`Offer`)、幣別 (TWD) 及商品庫存狀態。這有助於 Google 在搜尋結果中直接顯示產品價格。

### 1.4 Sitemap & Robots
- **Sitemap** (`src/app/sitemap.ts`)：自動遍歷所有資料庫中的有效產品，生成動態網站地圖。
- **Robots** (`src/app/robots.ts`)：定義爬蟲規則，允許爬取商店分頁，限制爬取會員中心。

---

## 2. 廣告追蹤與數據分析

系統整合了多家主流廣告平台的追蹤腳本，並採用集中化管理。

### 2.1 核心追蹤元件 (AnalyticsScripts)
- **檔案位置**：`src/components/tracking/analytics.tsx`
- **機制**：
    - 自行政後台讀取 `site_config` 配置（GA4 ID, Google Ads ID, Meta Pixel ID, GTM ID）。
    - 採用 `next/script` 優化載入策略 (`afterInteractive`)，減少對頁面讀取速度的影響。
    - **自動頁面追蹤 (PageView)**：監聽 `usePathname` 變化，在每次跳轉頁面時自動向 GA4 與 Meta 發送 PageView 事件。

### 2.2 支援平台
1. **GA4 (Google Analytics 4)**：全站行為分析與電子商務事件。
2. **Google Ads**：轉換追蹤 (Conversion Tracking)。
3. **Meta Pixel (Facebook Pixel)**：社群廣告再行銷與轉換。
4. **GTM (Google Tag Manager)**：提供第三方標籤擴充性。

### 2.3 追蹤事件 (Ecommerce Events)
系統在關鍵節點手動觸發以下事件：

| 事件名稱 | 觸發位置 | 傳遞參數 |
| :--- | :--- | :--- |
| **AddToCart** | 產品詳情頁點擊「加入購物車」 | 商品名稱, 單價, 數量 |
| **BeginCheckout** | 進入結帳頁面 | 訂單總金額 |
| **Purchase** | 付款成功（含 TapPay 跳轉回來後的驗證成功） | 訂單編號, 總金額, 商品清單 |

### 2.4 進階轉化邏輯
在 `trackPurchase` 中，系統會自動比對 `document.querySelector` 找到已載入的 Google Ads 腳本 ID，自動拼接 `AW-XXXXX/purchase` 的轉換標籤，確保 Google Ads 轉換能與 GA4 同步記錄。

---

## 💡 開發注意事項
- 若要新增追蹤平台，應優先在 `src/components/tracking/analytics.tsx` 中擴充，而非直接修改 `layout.tsx`。
- 所有追蹤 ID 應統一由後台資料庫管理，避免將 ID 硬編碼在程式中。
