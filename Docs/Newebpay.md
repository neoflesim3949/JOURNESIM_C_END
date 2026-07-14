# 藍新金流 NewebPay — 線上交易・幕前支付 串接參考

> 整理自官方《線上交易－幕前支付技術串接手冊》標準版 NDNF-1.2.2（2026/04/21）
> 幕前 = 藍新以 RWD 付款頁（MPG）提供交易流程；商店以 HTML Form Post 導入。
> 涵蓋：MPG 交易、單筆查詢、取消授權、請/退款、電子錢包退款。

---

## 0. 憑證與環境

| 項目 | 說明 |
|---|---|
| **MerchantID** | 商店代號（String 15），如 `MS127874575` |
| **HashKey** | API 串接金鑰（32 碼），AES 加密用 |
| **HashIV** | API 串接金鑰（16 碼），AES 加密用 |
| 會員專區 | https://www.newebpay.com/ （設定 NotifyURL/ReturnURL、模擬觸發） |

**PHP 範例常數**
```php
$key = "Fs5cX1TGqYM2PpdbE14a9H83YQSQF5jn"; // HashKey
$iv  = "C6AcmfqJILwgnhIP";                 // HashIV
$mid = "MS127874575";                      // MerchantID
```

### API 端點總覽

| 功能 | 編號 | 測試 URL | 正式 URL | 方法 |
|---|---|---|---|---|
| MPG 交易 | NPA-F01 | `https://ccore.newebpay.com/MPG/mpg_gateway` | `https://core.newebpay.com/MPG/mpg_gateway` | Form Post（前景）|
| 單筆查詢 | NPA-B02 | `https://ccore.newebpay.com/API/QueryTradeInfo` | `https://core.newebpay.com/API/QueryTradeInfo` | Post |
| 取消授權 | NPA-B01 | `https://ccore.newebpay.com/API/CreditCard/Cancel` | `https://core.newebpay.com/API/CreditCard/Cancel` | Post |
| 請/退款・信用卡 | NPA-B031~34 | `https://ccore.newebpay.com/API/CreditCard/Close` | `https://core.newebpay.com/API/CreditCard/Close` | Post |
| 電子錢包退款 | NPA-B06 | `https://ccore.newebpay.com/API/EWallet/refund` | `https://core.newebpay.com/API/EWallet/refund` | Post |
| BNPL 取消/退款 | NPA-B07 | `https://ccore.newebpay.com/API/Bnpl/refund` | `https://core.newebpay.com/API/Bnpl/refund` | Post |
| BNPL 請款 | NPA-B62 | `https://ccore.newebpay.com/API/Bnpl/settle` | `https://core.newebpay.com/API/Bnpl/settle` | Post |

---

## 1. 加解密方式

發動 API 前的資料處理順序：`參數 → AES 加密 → SHA256 檢查碼 → Form Post`。

### 1.1 AES256 加密（TradeInfo）
- 演算法：**AES-256-CBC**，PKCS7 填充，結果轉十六進制。
- EncryptType=1 時改用 **AES/GCM**（MPG 參數）；預設 0 = CBC/PKCS7。

```php
// Step1: 組請求字串（http_build_query，URL encode）
$data = http_build_query([
  'MerchantID' => $mid, 'RespondType' => 'JSON', 'TimeStamp' => time(),
  'Version' => '2.3', 'MerchantOrderNo' => 'ec_'.time(),
  'Amt' => 30, 'ItemDesc' => 'test', 'NotifyURL' => 'https://...',
]);
// Step2: AES 加密
$tradeInfo = bin2hex(openssl_encrypt($data, "AES-256-CBC", $key, OPENSSL_RAW_DATA, $iv));
```

### 1.2 SHA256 檢查碼（TradeSha）
- 於 AES 密文前後包 HashKey/HashIV，SHA256 後轉大寫。

```php
$tradeSha = strtoupper(hash("sha256", "HashKey=".$key."&".$tradeInfo."&HashIV=".$iv));
```

### 1.3 Form Post（前景送出）
```html
<form method="post" action="https://ccore.newebpay.com/MPG/mpg_gateway">
  <input name="MerchantID" value="{$mid}">
  <input name="Version" value="2.3">
  <input name="TradeInfo" value="{$tradeInfo}">
  <input name="TradeSha" value="{$tradeSha}">
  <input type="submit">
</form>
```
> ⚠️ 禁用 iframe / proxy / 幕後 Http Post 進入 MPG 頁（否則 MPG02005 來源不合法），必須前景 Form Post。

### 1.4 AES256 解密（收到 Notify 後）
```php
// 先去除 PKCS7 padding 再解
$plain = openssl_decrypt(hex2bin($tradeInfo), "AES-256-CBC", $key,
                         OPENSSL_RAW_DATA|OPENSSL_ZERO_PADDING, $iv);
// 手動 strip padding（見手冊 4.1.4）
```

### 1.5 CheckCode（驗證回傳結果）
- 取 `Amt、MerchantID、MerchantOrderNo、TradeNo` 四欄，依 A~Z 排序 `&` 串接。
- 前加 `HashIV=`，後加 `HashKey=`，SHA256 → 大寫。
```php
ksort($check);                              // Amt, MerchantID, MerchantOrderNo, TradeNo
$str = http_build_query($check);
$CheckCode = strtoupper(hash("sha256", "HashIV=".$iv."&".$str."&HashKey=".$key));
```

### 1.6 CheckValue（單筆查詢用）
- 取 `Amt、MerchantID、MerchantOrderNo` 三欄，A~Z 排序 `&` 串接。
- 前加 `IV=`，後加 `Key=`，SHA256 → 大寫。
```php
$CheckValue = strtoupper(hash("sha256", "IV=".$iv."&".$data."&Key=".$key));
```

---

## 2. 交易流程

**即時支付**（信用卡/Apple Pay/Google Pay/Samsung Pay、電子錢包 TWQR/玉山/台灣Pay/LINE Pay/BitoPay、BNPL AFTEE、WebATM）：
1. 商店發動 MPG API（Form Post）→ 2. 藍新顯示 MPG 頁 → 3. 消費者付款/3DS/掃碼 → 4. 收單機構扣款 → 5. 藍新以 **NotifyURL 幕後通知** → 6. 導回 **ReturnURL**。

**非即時支付**（超商代碼/條碼/取貨付款、ATM）：MPG 取號 → 導回 **CustomerURL** → 消費者臨櫃/ATM 付款 → 藍新 NotifyURL 通知。

> ReturnURL 與 NotifyURL **不可設同一網址**（會收到兩次，影響出貨/帳務）。
> 玉山 Wallet、台灣 Pay 不支援導頁（ReturnURL）。

---

## 3. MPG 交易 [NPA-F01]

### 3.1 外層 Post 參數
| 參數 | 必填 | 型態 | 說明 |
|---|---|---|---|
| MerchantID | V | String(15) | 商店代號 |
| TradeInfo | V | — | 交易資料 AES 加密（下方 3.2 欄位）|
| TradeSha | V | — | TradeInfo 的 SHA256 |
| Version | V | String(5) | `2.3` |
| EncryptType | | Int(1) | 1=AES/GCM；0 或省略=AES/CBC/PKCS7 |

### 3.2 TradeInfo 內含參數（加密前）
**必填核心**
| 參數 | 必填 | 型態 | 說明 |
|---|---|---|---|
| MerchantID | V | String(15) | 商店代號 |
| RespondType | V | String(6) | `JSON` 或 `String` |
| TimeStamp | V | String(50) | Unix 秒數（誤差 ±120 秒）|
| Version | V | String(5) | `2.3` |
| MerchantOrderNo | V | String(30) | 商店訂單編號，限英數底線，不可重複 |
| Amt | V | int(10) | 訂單金額（純數字，新台幣）|
| ItemDesc | V | String(50) | 商品資訊（UTF-8，勿用特殊符號）|

**常用選填**
| 參數 | 型態 | 說明 |
|---|---|---|
| ReturnURL | String(200) | 付款完成 Form Post 導回商店（限 80/443）|
| NotifyURL | String(200) | 幕後付款結果通知（限 80/443）|
| CustomerURL | String(200) | 取號完成導回（非即時支付）|
| ClientBackURL | String(200) | 付款頁「返回商店」鈕網址 |
| Email | String(50) | 付款人 email |
| EmailModify | Int(1) | 1=可改 0=不可改 email |
| LangType | String(5) | `zh-tw`(預設)/`en`/`jp` |
| TradeLimit | Int(3) | 交易有效秒數 60~900；0/省略=不限 |
| ExpireDate | String(10) | 繳費期限 `Ymd`（非即時支付，預設 7 天，最多 180）|
| P3D | Varchar(5) | 1=強制 3D/Passkey；省略=依商店設定 |
| OrderComment | String(300) | MPG 頁顯示商店備註 |
| TokenTerm | String(20) | 記憶卡號綁定（會員編號/Email 對應卡號）|
| TokenTermDemand | Int(1) | 快速結帳必填欄位 1=到期+CVV 2=到期 3=CVV 4=皆非必填 |

**付款方式開關**（1=啟用；全部未帶則以商店後台設定為準）
| 參數 | 方式 | 金額限制備註 |
|---|---|---|
| CREDIT | 信用卡一次付清 | |
| APPLEPAY | Apple Pay | |
| ANDROIDPAY | Google Pay | |
| SAMSUNGPAY | Samsung Pay | |
| InstFlag | 信用卡分期 | `1`=全開；或 `3,6,12`… 期別逗號分隔（8 限閘道商店）|
| CreditRed | 信用卡紅利 | |
| UNIONPAY | 銀聯卡 | |
| CREDITAE | 美國運通卡 | |
| WEBATM | WebATM | >49,999 或手機裝置不顯示；僅開此項無法點選 |
| VACC | ATM 轉帳 | >49,999 不顯示 |
| CVS | 超商代碼 | <30 或 >20,000 不顯示 |
| BARCODE | 超商條碼 | <20 或 >40,000 不顯示 |
| CVSCOM | 物流（超商取貨）| 1=取貨不付款 2=取貨付款 3=兩者；>20,000 不可用 |
| LINEPAY | LINE Pay | 需搭配 ImageUrl（產品圖 84×84）|
| ESUNWALLET | 玉山 Wallet | |
| TAIWANPAY | 台灣 Pay | >49,999 不顯示 |
| TWQR | TWQR/簡單付 | 搭配 TWQR_LifeTime（QR 秒數，預設 300）|
| EZPWECHAT / EZPALIPAY | 簡單付 微信/支付寶 | |
| BITOPAY | BitoPay（加密貨幣）| <100 或 >49,999 不顯示 |
| AFTEE | BNPL 先享後付 | 1=一般 2=一般+分期；>49,999 不顯示；需帶 OrderDetail |

**BankType**（WEBATM/ATM 指定銀行，逗號分隔）：`BOT`台銀、`HNCB`華南、`KGI`凱基(僅 ATM)。
**LgsType**（物流型態）：`B2C`大宗寄倉(7-11)、`C2C`店到店(7-11/全家/萊爾富/OK)。

**OrderDetail**（訂單細項，AFTEE 必填；JSON 陣列，須升版 2.2+）
| 欄位 | 必填 | 說明 |
|---|---|---|
| ItemName | V | 品名 String(20) |
| ItemAmt | V | 品項金額（正/負整數，加總需等於 Amt）|
| ItemType | V | 1一般 2票券 3儲值金 4折扣 |
| ItemOrderNo | V | 品項編號（同訂單不可重複）|

### 3.3 回應參數（支付完成）— 由 NotifyURL/ReturnURL 幕後回傳
外層：`Status`（成功=`SUCCESS`，失敗=錯誤代碼）、`MerchantID`、`TradeInfo`(AES)、`TradeSha`、`Version`、`EncryptType`。

**TradeInfo 解密後（共同）**
| 參數 | 說明 |
|---|---|
| Status / Message | 狀態 / 文字訊息 |
| Result | JSON 回傳時參數放此陣列下 |
| MerchantID / Amt | 商店代號 / 交易金額 |
| TradeNo | 藍新交易序號 String(20) |
| MerchantOrderNo | 商店訂單編號 |
| PaymentType | 該筆支付方式 |
| PayTime | 支付完成時間 |
| IP | 交易 IP |
| EscrowBank | 款項保管銀行（如 HNCB）|

**信用卡專屬**：`AuthBank`(收單行)、`RespondCode`、`Auth`(授權碼)、`Card6No`/`Card4No`、`Inst`/`InstFirst`/`InstEach`(分期)、`ECI`、`TokenUseStatus`(0非/1首次/2使用/9取消)、`RedAmt`(紅利折抵後金額)、`PaymentMethod`(`CREDIT`/`FOREIGN`/`UNIONPAY`/`APPLEPAY`/`GOOGLEPAY`/`SAMSUNGPAY`/`DCC`)。

**其他方式**：
- WebATM/ATM：`PayBankCode`、`PayerAccount5Code`。
- 超商代碼：`CodeNo`、`StoreType`(1 7-11 / 2 全家 / 3 OK / 4 萊爾富)、`StoreID`。
- 超商條碼：`Barcode_1~3`、`RepayTimes`、`PayStore`。
- 超商物流：`StoreCode/Name/Type/Addr`、`TradeType`(1付款/3不付款)、`CVSCOMName/Phone`、`LgsNo`、`LgsType`。
- 跨境（支付寶/微信）：`ChannelID`、`ChannelNo`。
- 玉山/台灣Pay/BitoPay：`PayAmt`（實付金額）；BitoPay 另有 `CryptoCurrency/Amount/Rate`。

### 3.4 回應參數（取號完成）— 非即時支付
`Status`、`TradeNo`、`MerchantOrderNo`、`Amt`、`PaymentType`、`ExpireDate`、`ExpireTime`；
ATM：`BankCode`+`CodeNo`；超商代碼：`CodeNo`；超商條碼：`Barcode_1~3`。

### 3.5 記憶卡號（快速結帳）
- 首次：帶 `TokenTerm`，消費者於 MPG 勾「記住結帳資訊」。
- 再次：帶同一 `TokenTerm` → MPG 自動帶入前六後四碼，只需填到期+CVV。
- 同會員各商店 TokenTerm 不可重複；僅保留最近一次成功卡號。銀聯/AE 僅支援 TokenTermDemand 1 或 3。

---

## 4. 單筆交易查詢 [NPA-B02]

**Post 參數**：MerchantID、Version=`1.3`、RespondType、**CheckValue**(見 1.6)、TimeStamp、MerchantOrderNo、Amt、Gateway(複合式商店 MS5 開頭填 `Composite`)。

**回應 Result**（JSON）：
| 參數 | 說明 |
|---|---|
| TradeStatus | 0未付款 1成功 2失敗 3取消 6退款 |
| PaymentType | CREDIT/VACC/WEBATM/BARCODE/CVS/LINEPAY/ESUNWALLET/TAIWANPAY/CVSCOM/AFTEE |
| CloseStatus | 請款：0未 1等待提送 2處理中 3完成 |
| BackStatus | 退款：0未 1等待提送 2處理中 3完成 |
| BackBalance | 可退款餘額 |
| CreateTime / PayTime / FundTime | 建立/付款/預計撥款 |
| CheckCode | 檢核碼（見 1.5）|
| OrderStatus | 0未付 1已付 2失敗 3取消 6退款 9付款中待確認（v1.3+）|

信用卡另回：RespondCode、Auth、ECI、CloseAmt、Inst、Card6No/Card4No、AuthBank、PaymentMethod。
超商/ATM 另回 `PayInfo`（代碼/條碼/轉帳帳號）、ExpireDate。

**回應範例**
```json
{"Status":"SUCCESS","Result":{"TradeStatus":"1","PaymentType":"CREDIT",
 "Amt":30,"TradeNo":"23092714215835071","CloseStatus":"0","BackStatus":"0",
 "BackBalance":"30","Card6No":"400022","Card4No":"1111","AuthBank":"KGI"}}
```

---

## 5. 信用卡交易狀態機（圖 5）

```
發動交易[NPA-F01]
  ├ 非3D → 直接授權   ├ 3D → 未付款(TradeStatus=0) → 消費者完成 → 授權
  ↓
授權成功(TradeStatus=1) ── 取消授權[NPA-B01] → 已取消授權(=3)
  │  交易失敗 → 授權失敗(TradeStatus=2)
  未請款(CloseStatus=0)
    ├ 請款[NPA-B031] → 請款申請中(1) → (每晚9點報送) → 請款處理中(2) → 請款完成(3)
    ├ 取消請款[NPA-B033] → 回未請款
    └ 退款[NPA-B032] → 退款申請中(BackStatus=1) → 退款處理中(2) → 退款完成(3)
        └ 取消退款[NPA-B034]
```

---

## 6. 取消授權 [NPA-B01]

**Post**：`MerchantID_`、`PostData_`(AES 加密)。
**PostData_ 內含**：RespondType、Version=`1.0`、Amt(需=授權金額)、MerchantOrderNo / TradeNo(二擇一)、**IndexType**(1商店單號 / 2藍新單號)、TimeStamp。
**回應**：Status(成功`SUCCESS`；需批次處理回 `TRA20001`)、Result{MerchantID, TradeNo, Amt, MerchantOrderNo, CheckCode}。

---

## 7. 信用卡 請/退款・取消 [NPA-B031~34]

**Post**：`MerchantID_`、`PostData_`(AES)。
**PostData_ 內含**：
| 參數 | 說明 |
|---|---|
| RespondType | String/JSON |
| Version | `1.1` |
| Amt | 請退款金額（一次付清可部分；分期/紅利僅整筆；銀聯僅整筆請款、可部分退）|
| MerchantOrderNo | 商店訂單編號 |
| TimeStamp | ±120 秒 |
| IndexType | 1商店單號 / 2藍新單號 |
| TradeNo | 藍新交易序號 |
| **CloseType** | 1=請款(B031)/取消請款(B033)；2=退款(B032)/取消退款(B034) |
| **Cancel** | 取消請款/退款時填 1（一般請退款不帶）|

**回應** Result：MerchantID、Amt、TradeNo、MerchantOrderNo。
> 請款每晚 9 點自動報送銀行；退款須先請款。

---

## 8. 電子錢包退款 [NPA-B06]

> **注意：此 API 用 JSON Encode 產生請求字串**（與其他 API 的 http_build_query 不同）。

**Post**：`UID_`(商店代號)、`Version_`=`1.0`、`EncryptData_`(AES)、`RespondType_`=`JSON`、`HashData_`(SHA256)。
**EncryptData_ 內含**：MerchantOrderNo、Amount(退款金額)、TimeStamp、**PaymentType**：
`ESUNWALLET`玉山、`LINEPAY`、`TAIWANPAY`(須全額)、`TWQR`、`EZPALIPAY`支付寶、`EZPWECHAT`微信。

**退款規則**：玉山 89 天/多次部分；台灣Pay 29 天/僅全額；LINE Pay 60 天/多次部分；ezPay/Alipay/WeChat 89 天/多次部分；TWQR 89 天/不限次數/≤交易金額。退款一經發動立即執行、無法取消。

**回應**：Status（成功=`1000`）、EncryptData(解密後含 TradeNo、MerchantOrderNo、RefundAmount、RefundDate、BankCode/Message)、HashData、UID、Version。

---

## 9. BNPL 先享後付 AFTEE [NPA-B07 取消/退款、NPA-B62 請款]

- 加密同電子錢包（AES + HashData），**http_build_query** 產生字串。
- 取消/退款 [B07]：EncryptData 含 MerchantOrderNo、Amt、TimeStamp、PaymentType=`AFTEE`、Reason；成立後 1 年內可取消/退款；回 RefundType(`cancel`/`refund`)。
- 請款 [B62]：Amt 需=訂單金額；成立後 89 天內；回 CloseDate。

---

## 10. 常用錯誤代碼

| 代碼 | 原因 |
|---|---|
| MPG01002 | TimeStamp 空白（升版 2.0；檢查參數大小寫/正式測試網址）|
| MPG01009/01012/01015/01017 | MerchantID / MerchantOrderNo / Amt / ItemDesc 空白或錯 |
| MPG01028/01029/01030 | OrderDetail 格式錯 / 總額不符 / 品項編號重複（AFTEE 必填）|
| MPG02001 | CheckValue 錯誤 |
| MPG02004 | 頁面逾時（Timestamp 後 120 秒內發動；EncryptType 值）|
| MPG02005 | 來源不合法（禁 iframe/proxy/幕後 Post，須前景 Form Post）|
| MPG02010 | 版本不支援，請升級 v2.3 |
| MPG03008 / TRA20004 | 商店訂單編號重複 |
| MPG03009 | 交易失敗（SHA 不符/解密失敗/EncryptType 錯/銀行授權失敗）|
| MPG05002/05003 | 卡別不支援此付款/一次付清/分期/紅利 |
| MPG05005 | 警示交易 |
| TRA10026~10039 | 請退款狀態/金額/單號類型錯誤（見狀態圖時機）|
| TRA10071 | 1 小時內查錯訂單號過多 → 鎖查詢 4 小時 |
| TRA10702 / TRA11002 | 請退款/失敗次數過多 → 鎖 1/4 小時 |
| TRA20001 | 取消授權需金融機構批次處理 |
| TRA20028 / 1105 / 1116 | 可退款金額不足 |
| 1000（錢包） | 退款成功 |
| 4101~4106 | EncryptData_/HashData_/TimeStamp/UID_ 空白或不符 |

---

## 11. 測試區腳本要點

| 代碼 | 測試方式 |
|---|---|
| CREDIT | 測試卡：`4000-2211-1111-1111`(一次付清+分期)、`4003-5511-1111-1111`(紅利)、`3760-000000-00006`(AE)。到期日/CVV 任填；不實際送收單。銀聯不開放測試 |
| WEBATM | 直接模擬完成；僅華南銀行 |
| VACC/CVS/BARCODE | 取號後至〔會員專區/銷售紀錄〕〔模擬觸發〕發 Notify |
| APPLEPAY/ANDROIDPAY/SAMSUNGPAY | 用真實卡號、至對應裝置綁定支付 |
| LINEPAY | 導至 LINE Pay 頁掃碼；不支援模擬觸發 |
| ESUNWALLET/TAIWANPAY/BITOPAY | 產 QR，網頁點〔模擬成功/失敗〕；失敗回 MPG03009 |
| AFTEE | 不導 APP，直接模擬成功 |
| TWQR/EZPWECHAT/EZPALIPAY | 導 ezPay 頁產 QR，靜置 30 秒自動完成 |

---

## 12. 與本專案（FLESIM）整合備忘

- 現有金流：TapPay（`src/lib/tappay.ts`）、Antom（`src/lib/antom.ts`）。若要接 NewebPay，建議：
  - 新增 `src/lib/newebpay.ts`：AES256-CBC 加解密 + SHA256（Node `crypto`），組 TradeInfo/TradeSha。
  - `HashKey`/`HashIV`/`MerchantID` 放後台 `system_settings`（比照 antom_* / tappay_*）。
  - 結帳：後端組加密參數 → 前端 auto-submit Form 到 mpg_gateway（前景，勿 fetch/iframe）。
  - Notify webhook：`/api/webhooks/newebpay` 解密 TradeInfo、驗 TradeSha/CheckCode、更新訂單。
  - Notify 須回 **HTTP 200**（否則藍新 Retry 3 次後判失敗）。
- 金額幣別固定 **新台幣、純整數**；MerchantOrderNo 對應我方 order_number（限英數底線 30 字）。
