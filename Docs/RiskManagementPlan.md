# 刷卡風險控管與防拒付計畫
# Card Payment Risk Management & Chargeback Mitigation Plan

| 項目 | 內容 |
|---|---|
| 商戶 | Flesim.com HK Limited（飛訊移動科技有限公司）|
| 服務 | FLESIM eSIM / SIM 電子商務平台（www.flesim.com）|
| 收單/金流 | Antom（Ant International / Alipay+）Cashier Payment |
| 文件版本 | v1.1 |
| 適用範圍 | 所有信用卡 / 金融卡（含 Apple Pay）之線上收單交易 |

> ✅ = 現行已實作　⏳ = 規劃補強（roadmap）

---

## 1. 目的與範圍

本計畫說明 FLESIM 針對**信用卡線上收單（Card-Not-Present, CNP）**之詐欺防範與**拒付（Chargeback / Dispute）**控管機制，目標：
1. 降低盜刷與詐欺交易造成的拒付。
2. 將拒付率控制在卡組織門檻以下（見 §8）。
3. 於發生爭議時能快速提供完整舉證（representment），提高勝訴率。

範圍涵蓋：交易前預防、交易中偵測、交易後回應（退款/爭議處理）、數位商品交付控管、資料保護。

---

## 2. 商業模式與風險輪廓

| 面向 | 說明 | 風險含義 |
|---|---|---|
| 商品 | **eSIM（數位、即時交付）** + 實體 SIM（寄送）| eSIM 即時交付、無實體物流 → CNP 盜刷/善意詐欺風險較高 |
| 客單價 | 中低（多為數百至數千 TWD）| 單筆損失有限，但需防批量盜刷 |
| 交付 | eSIM 以 QR/連結寄送至**已驗證 email**；狀態可查（F042）| 有交付軌跡可舉證 |
| 客群 | 跨境旅客（發卡國常非交易國）| 發卡國/交易地不一致屬正常，但也需納入風險評分 |
| 結算 | 顧客付 TWD，Antom 以 USD 結算 | — |

**主要風險類型**
- **盜刷（Stolen Card / CNP Fraud）**：以他人卡號購買 eSIM 即時轉售。
- **善意詐欺（Friendly Fraud）**：持卡人事後宣稱「未授權/未收到」。
- **帳號盜用（ATO）**：盜用會員帳號使用已綁定卡片。
- **服務爭議**：對效期/涵蓋範圍不滿而拒付。

---

## 3. 治理與權責

| 角色 | 職責 |
|---|---|
| 風控負責人 | 制定/更新規則、設定門檻、月度檢視拒付率 |
| 客服 | 第一線爭議溝通、主動退款判斷、蒐集舉證 |
| 工程 | 維護風控規則、log、交付與退款系統 |
| 對外窗口 | 與 Antom / 收單機構協調爭議與representment |

爭議處理時效：收到拒付通知後 **24 小時內**啟動舉證流程（見 §7）。

---

## 4. 控管框架：預防 / 偵測 / 回應

### 4.1 交易前預防（Pre-Authorization）

| 控制 | 狀態 | 說明 |
|---|---|---|
| **條件式 3D Secure（Adaptive 3DS）** | ✅/⏳ | ✅ 現行：卡片交易帶 `paymentFactor.isAuthorization` 送 3DS 授權 + Antom 自適應風控；challenge 成功之交易發生 liability shift（責任轉移至發卡行），回應含 `threeDSResult{eci, challenged, threeDSOffered}`。⏳ 規劃**條件式強制 3DS**：於（一）同一卡號短時間內第 2 次（含）以上交易、（二）曾被系統標記為異常之卡號時強制驗證，兼顧盜刷防護與正常交易流暢度。 |
| **Antom 風控引擎** | ✅ | 交易經 Antom 平台內建 risk evaluation（securityConfig / bizToken），高風險交易由 Antom 端攔阻。 |
| **卡片代碼化（Tokenization）** | ✅ | 卡號於 Antom PCI iframe 輸入，本站**不接觸/不儲存卡號**；綁卡以 `cardToken` 保存（見 §9 PCI）。 |
| **會員 email 驗證** | ✅ | 綁卡/快速結帳限已登入會員；magic-link 驗證 email 真實性。 |
| **重複訂單 / 重複扣款去重** | ✅/⏳ | ✅ 現行：`paymentRequestId`=訂單號唯一、`MerchantOrderNo` 不可重複、僅 `paymentStatus=SUCCESS` 才入帳（不重複入帳）。⏳ 規劃於下單環節主動識別重複訂單；**經核實之重複扣款一律全額退還**。 |
| **CVV / AVS 判讀** | ⏳ | Antom 回傳 `cvvResultRaw` / `avsResultRaw`，目前僅記錄於 log；**規劃**：CVV 不符（非 `M`）之高風險交易攔阻或轉人工。 |
| **異常高頻購買（Velocity）** | ⏳ | **規劃**：同一帳戶/email 於短時間內下單頻率設閾值，超過者觸發人工審核或暫停交易。 |
| **同卡 / 同設備 / 同 IP 多訂單** | ⏳ | **規劃**：監測同一卡號、裝置指紋或 IP 於短期內產生多筆訂單，異常者標記並人工複核。 |
| **黑名單（Blocklist）** | ⏳ | **規劃**：曾拒付/確認詐欺之卡 BIN、email、IP、裝置指紋列入封鎖。 |
| **異常國家 / 地區訂單** | ⏳ | **規劃**：比對**帳單地址、IP 歸屬地、收貨/使用地**之匹配度，對高風險或不匹配之跨境訂單加強審核（Antom 回傳 `issuingCountry` 可用）。 |
| **金額 / 頻率上限** | ⏳ | **規劃**：新註冊會員或高風險評分者，單筆/單日金額上限。 |
| **買方 IP / 裝置紀錄** | ⏳ | **規劃**：下單時記錄 IP、User-Agent、裝置指紋於訂單，供速度限制、地理比對與舉證使用。 |
| **防自動化試卡（Card Testing / CAPTCHA）** | ⏳ | **規劃**：結帳頁導入 CAPTCHA（reCAPTCHA / Cloudflare Turnstile）+ 同 IP/session 結帳嘗試次數上限，阻擋機器人**批量試卡（BIN 攻擊）**於呼叫收單前。 |
| **拒絕重試上限（Decline Retry Limit）** | ⏳ | **規劃**：同一卡/session 連續授權被拒達 N 次即封鎖後續嘗試，防止以被盜卡號連續試刷。 |
| **拋棄式 email 封鎖** | ⏳ | **規劃**：比對已知臨時/拋棄式信箱網域清單（如 tempmail / mailinator），於註冊/結帳阻擋（盜刷常用臨時信箱）。 |
| **數量 / 轉售上限** | ⏳ | **規劃**：單筆訂單及單一帳號於時間窗內之 eSIM 數量上限，防批量盜刷/轉售特徵。 |

### 4.2 交易中/後偵測（Detection & Monitoring）

| 控制 | 狀態 | 說明 |
|---|---|---|
| **完整交易 log** | ✅ | `antom_api_logs` 留存每筆 createPaymentSession / pay / inquiryPayment / refund / webhook 之請求與**完整回應**（含 avs/cvv/3ds/BIN/fingerprint/authorizationCode/networkTransactionId），後台 `/admin/antom-logs` 可查。→ 亦為爭議舉證來源。 |
| **付款狀態覆核** | ✅ | 以 `inquiryPayment` 覆核，只有 `paymentStatus=SUCCESS` 才標記已付款，避免假成功/重複入帳。 |
| **人工審核佇列** | ⏳ | **規劃**：系統標記之高風險訂單（CVV 不符 / 地理不符 / 高額 / 高頻 / 新帳號）進入佇列，由人工**二次審核**後決定**放行 / 加驗（強制 3DS）/ 拒絕**；審核前**暫緩 eSIM 發放**。 |
| **拒付率監控** | ⏳ | **規劃**：月度追蹤 dispute count / rate 對照卡組織門檻（§8），逼近門檻即收緊規則。 |

### 4.3 交易後回應（Response）

| 控制 | 狀態 | 說明 |
|---|---|---|
| **主動退款** | ✅ | 後台可對 Antom 交易**全額 / 部分退款**（自訂彈窗流程）。對確認之詐欺或客訴，**主動退款以避免拒付**（拒付對商戶信譽與費用衝擊大於退款）。 |
| **退款原路返還（防洗錢）** | ✅ | 退款一律**原路返還**至原付款卡號/管道（Antom refund 針對原 `paymentId`），避免退款流向與付款人不一致之第三方，防止退款政策遭濫用及洗錢風險。 |
| **退款濫用監測** | ⏳ | **規劃**：監測同一用戶/卡號之高頻退款、發碼後頻繁申請「未安裝退款」等異常模式，進行標記與限制。 |
| **爭議舉證（Representment）** | ⏳ SOP | 依 §7 蒐集訂單、交付、log、3DS/AVS/CVV、溝通紀錄，於期限內提交。 |
| **交付暫緩** | ⏳ | **規劃**：高風險訂單於審核前暫緩 eSIM 發放（見 §6）。 |

---

## 5. 客戶端防詐與政策（降低善意詐欺）

| 項目 | 狀態 | 說明 |
|---|---|---|
| 反詐騙宣導頁 | ✅ | `/anti-fraud` 教育使用者辨識詐騙、勿受第三方代付誘導。 |
| 明確退換貨/退款政策 | ✅ | `/policy` 清楚載明效期、適用範圍、退款條件 → 減少「與描述不符」爭議。 |
| 交易通知 | ✅ | 付款完成導向結果頁 + 訂單可於會員中心查詢；清楚商戶名稱（Flesim.com HK Limited）降低「不認得帳單」拒付。 |
| 客服聯絡管道 | ✅ | `/contact` 提供各地客服信箱，鼓勵**先聯繫客服而非直接拒付**。 |

---

## 6. 數位商品交付控管（eSIM）

eSIM 為即時交付、易被轉售，交付環節控管：
1. ✅ QR/連結僅寄至**已驗證 email**。
2. ✅ 交付與啟用狀態可查（`esim_profiles`、F042 服務狀態）→ 交付證據。
3. ⏳ **規劃**：高風險訂單於**付款確認 + 風控通過**後才發放（F040）；未通過者暫緩並轉人工。
4. ⏳ **規劃**：同一 email/裝置短時間大量兌換 eSIM 之異常偵測。

---

## 7. 拒付處理標準流程（SOP）與舉證清單

**流程**：收到拒付通知 → 24h 內判斷（詐欺 vs 善意詐欺 vs 服務爭議）→ 蒐集舉證 → 於 Antom/收單期限內提交 representment → 記錄結果、回饋規則。

**舉證資料包（本平台皆可提供）**
| 證據 | 來源 |
|---|---|
| 訂單與商品明細、金額、時間 | `orders` / `order_items` / `sub_orders` |
| 付款授權紀錄（authorizationCode、networkTransactionId）| `antom_api_logs`（inquiryPayment/pay 回應）|
| **3DS 結果（ECI、challenged）** | `antom_api_logs` → `paymentResultInfo.threeDSResult` |
| **AVS / CVV 比對結果** | `antom_api_logs` → `avsResultRaw` / `cvvResultRaw` |
| 卡片 BIN / 發卡國 / 指紋 | `antom_api_logs` → `cardBin` / `issuingCountry` / `fingerprint` |
| **交付證明**（eSIM 已發放/啟用）| `esim_profiles` / F042 狀態 / 寄送 email 紀錄 |
| 買方 email、帳號、（規劃中）IP/裝置 | `members` / `orders` |
| 客服溝通紀錄 | 客服系統 / email |
| 退款政策與同意紀錄 | `/policy`、結帳同意條款 |

> 3DS challenge 成功之交易，「未授權」類拒付原則上由發卡行承擔（liability shift）—— 這是本平台優先啟用 3DS 的主因。

---

## 8. 指標與門檻（KPI）

| 指標 | 目標 | 卡組織參考門檻 |
|---|---|---|
| 拒付率（Chargeback Rate, 件數/交易數）| < 0.5% | Visa VDMP 標準級 ≥ 0.9%（且 ≥100 件）；Mastercard ECM ≥ 1.5% |
| 詐欺率（Fraud-to-Sales）| < 0.3% | Visa VFMP 監控級 ≥ 0.9% |
| 爭議舉證回應時效 | 100% 於期限內 | 依收單規定 |
| 3DS 覆蓋率（卡片交易）| ≥ 95% | — |

> 逼近門檻（達目標值 80%）即觸發規則收緊：提高審核比例、降低金額上限、擴大黑名單。

---

## 9. 資料保護與 PCI DSS

- **不儲存卡號 / CVV**：卡片資料於 Antom PCI-DSS 合規環境（iframe / 託管收銀頁）處理，本平台僅保存 `cardToken`、前六後四、卡別、到期 → 符合 **PCI DSS SAQ-A** 適用情境。
- 傳輸全程 HTTPS（TLS）。
- 存取控制：管理後台需驗證；付款私鑰 / 憑證存於環境變數 / Secret（規劃 Secret Manager）。
- 個資最小化保存，依隱私權政策（`/policy`）處理。

---

## 10. 檢視與持續改善

| 週期 | 動作 |
|---|---|
| 每月 | 檢視拒付率/詐欺率、爭議勝率、規則命中率；更新黑名單 |
| 每季 | 檢討風控規則有效性、門檻校準、更新本計畫 |
| 事件觸發 | 單一詐欺樣態爆量時即時加規則（velocity/blocklist）|

---

## 11. 補強路線圖（Roadmap 摘要）

依風險/效益排序，建議優先實作：

1. **防自動化試卡：CAPTCHA + 結帳嘗試/拒絕重試上限**（於呼叫收單前擋批量試卡，拒付大宗）。
2. **買方 IP / User-Agent / 裝置指紋記錄**（舉證 + 速度限制基礎）。
3. **拋棄式 email 封鎖 + 數量/轉售上限**（低成本、阻批量盜刷）。
4. **CVV/AVS 判讀規則**（讀 Antom 回傳，CVV 不符攔阻/轉人工）。
5. **速度限制 + 黑名單**（頻率/同卡同IP、封鎖已知詐欺）。
6. **風險評分 + 人工審核佇列 + eSIM 發放暫緩**（高風險訂單交付前把關）。
7. **拒付率儀表板 + 月報**（對照卡組織門檻）。
8. **地理/BIN 不一致標記**。

> 說明：項目 1–3 為「授權前直接阻擋」之低成本高效益控制，建議優先；4–6 為主要防線；7–8 為監控與精進。

---

*本文件為 FLESIM 內部風控政策說明，供收單/金流合作方（Antom）審核之用；實際規則參數不對外揭露以維持防護有效性。*
