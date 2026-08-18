# 轉址機制（2026-08-18 實測可用）

FLESIM 有兩套轉址：**rsp 子網域（SM-DP+ 位址品牌化）** 與 **短網址 /r/{slug}**。兩套的定位、實作與維運方式不同，分開記錄。

## 結論

1. **eSIM 安裝碼可以掛自己的品牌網域**：安裝碼寫 `rsp.flesim.com`，手機安裝時的協定請求（`/gsma/*`）由我們 302 轉給 BC 的 `rsp.billionconnect.com` 實際出貨——實測 LPA 會跟隨 302，eSIM 正常下載安裝，不需要 BC 幫我們掛憑證。
   > `rsp.flesim.com/gsma/*` →（302）`rsp.billionconnect.com/gsma/*` —— eSIM 下載走的 SM-DP+ 協定路徑（`/gsma/rsp2/es9plus/...`）照常轉，安裝不受影響
2. **瀏覽器打 rsp.flesim.com 不會露出 BC**：非協定路徑一律導回 `www.flesim.com` 官網，一個子網域同時服務手機安裝與品牌形象。
   > `rsp.flesim.com` 其他任何路徑（含首頁）→（302）`www.flesim.com` —— 一般人用瀏覽器打開只會看到我們官網，不會露出 BC 的網域
3. **短網址 `/r/{短碼}` 供行銷使用**：目的地存資料庫、後台隨時可改（QR 印出去不用重印），自動統計點擊。
4. 兩套都用 **302 暫時轉址**：規則修改立即生效，不被瀏覽器永久快取。

---

## 一、rsp.flesim.com — SM-DP+ 位址品牌化轉址

### 目的

讓 eSIM 安裝碼（LPA 字串）可以寫我們自己的網域：

```
LPA:1$rsp.flesim.com$<activationCode>
```

手機端實際仍由 BC 的 RSP 伺服器（`rsp.billionconnect.com`）出貨 profile，但用戶看到的位址是 FLESIM 品牌。**已實測：eSIM 可正常下載安裝**。

### 兩條規則（寫在 `next.config.ts` 的 `redirects()`，順序不可對調）

| 順序 | 條件（Host = rsp.flesim.com） | 路徑 | 轉到 | 用途 |
|---|---|---|---|---|
| 1 | ✔ | `/gsma/*` | `https://rsp.billionconnect.com/gsma/*`（302，路徑與 query 原樣保留） | eSIM 下載：LPA 打的 SM-DP+ 協定端點都在 `/gsma/rsp2/es9plus/...` 底下 |
| 2 | ✔ | 其他任何路徑（含首頁） | `https://www.flesim.com`（302） | 一般人用瀏覽器打 rsp.flesim.com → 導回官網，不露出 BC 網域 |

規則 1 必須排在規則 2 前面：Next.js redirects 依序匹配，先命中先贏；對調的話 `/gsma/*` 會被通用規則吃掉、eSIM 下載就壞了。

### 整條鏈路

```
手機 LPA / 瀏覽器
  → DNS：CNAME rsp.flesim.com → cname.vercel-dns.com
  → Vercel：專案 Domains 含 rsp.flesim.com（Connect to Production；TLS 憑證由 Vercel 自動簽）
  → Next.js：依 Host 標頭匹配上面兩條 redirect 規則 → 回 302 + Location
  → 客戶端跟隨 302 到目的地
```

### 關鍵發現（推翻原本保守判斷）

- **LPA 會跟隨 HTTP 302**：原以為 SM-DP+（SGP.22 ES9+）不吃 HTTP 轉址、必須 BC 掛我們的憑證；實測 iOS 安裝成功，證明 LPA 對 ES9+ 請求會跟隨 302 到 `rsp.billionconnect.com` 後繼續完成流程。
- 用 **302 不用 301**：不被客戶端永久快取，之後要換 RSP 供應商或改目的地，改 `next.config.ts` 重新部署即可全量生效。

### 維運（2026-08-18 起改為動態管理）

- **RSP 管理頁**（參數管理 → RSP 管理）：`rsp` / `rsp1` / `rsp2`… 各子網域對應的目標 RSP 主機存在 `rsp_domains` 表（migration 079），後台即改即生效，不用重新部署。
- `/gsma/*` 的轉址改由 **middleware 查表**執行；查表失敗或子網域停用時**回退 `rsp.billionconnect.com`** 保命。所有收到的協定請求記錄在 `rsp_requests`（RSP 管理頁可看）。
- `next.config.ts` 只剩「瀏覽器路徑導回官網」的通用規則（host regex `^rsp\d*\.flesim\.com$`，排除 `/gsma`）。
- **新增子網域三步**：① RSP 管理頁建立對應 ② Vercel 專案 Domains 加 `{子網域}.flesim.com`（Connect to Production）③ DNS 加 CNAME `{子網域}` → `cname.vercel-dns.com`，完成後按頁上「檢測」（驗 CNAME＋實測 302）。
- 如果某天 eSIM 裝不起來：先按「檢測」看 CNAME／轉址哪段斷了，再看 `rsp_requests` 是否有請求進來、打的路徑是否在 `/gsma/` 之外。

---

## 二、/r/{slug} — 短網址／行銷轉址

### 目的

行銷連結、QR、卡片標籤用的短網址：`https://www.flesim.com/r/jp2026` → 任意目標網址，**目的地可隨時在後台改**（印出去的 QR 不用重印），並統計點擊。

### 邏輯

```
GET /r/{slug}                              （src/app/r/[slug]/route.ts，公開、無需登入）
  → 查 redirect_links（slug 唯一鍵）
  → 無效/停用/不存在 → 302 回首頁
  → 有效 → fire-and-forget 記統計（不拖慢跳轉）：
      • increment_redirect_clicks() 原子累加 clicks + last_clicked_at
      • redirect_clicks 插一筆（時間/referer/UA，不記 IP）
  → 302 到 target_url
```

- 資料表：`redirect_links`（slug、target_url、title、is_active、clicks、last_clicked_at）＋`redirect_clicks` 點擊明細 — migration `078-redirect-links.sql`
- 後台：行銷管理 → 轉址短網址（`/admin/marketing/redirects`）：建立（自訂短碼或自動 6 碼，排除易混淆字元）、行內編輯目標/備註、啟停用、複製完整短網址、看點擊數
- 也是 **302**：改目的地立即生效

### 與 rsp 轉址的差別

| | rsp 子網域 | /r/ 短網址 |
|---|---|---|
| 規則存放 | `next.config.ts`（寫死，部署生效） | 資料庫（後台即改即生效） |
| 匹配維度 | Host（整個子網域） | 路徑 slug（一條一條） |
| 統計 | 無 | 點擊數＋明細 |
| 適用 | SM-DP+ 位址、整域品牌化 | 行銷活動、QR、標籤 |
