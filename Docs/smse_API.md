# 速買配（SmilePay / smse）電子發票 API

> 第三方電子發票服務，提供 B2C / B2B / B2G 電子發票開立、折讓、作廢與列印。
>
> 本文件包含：
> 1. [開立發票](#開立發票) — `SPEinvoice_Storage.asp`
> 2. [開立折讓單](#開立折讓單) — `SPEinvoice_Storage_Allowance.asp`
> 3. [發票/折讓單作廢註銷](#發票折讓單-作廢註銷) — `SPEinvoice_Storage_Modify.asp`
> 4. [列印發票](#列印發票) — `InvoiceDetails.php` / `Invoice_Print_EPSON.php`

---

## 開立發票

---

## 端點

| 環境 | URL |
|------|-----|
| 正式 | `https://ssl.smse.com.tw/api/SPEinvoice_Storage.asp` |
| 測試 | `https://ssl.smse.com.tw/api_test/SPEinvoice_Storage.asp` |

- 編碼：**UTF-8**
- 方法：**POST 或 GET**（兩者皆可）
- 欄位名稱**區分大小寫**

---

## 欄位填寫規範

- **Ｏ：必填**
- **▲：選填**
- **Ｘ：不可填**

API 由四大區塊組成：
1. [使用者參數](#1-使用者參數)
2. [發票資訊](#2-發票資訊)
3. [商品明細](#3-商品明細)
4. [買受人資訊](#4-買受人資訊)

---

### 1. 使用者參數

| 參數 | 名稱 | B2C | B2B | 格式 / 說明 |
|------|------|-----|-----|-------------|
| `Grvc` | 電子發票帳號 | Ｏ | Ｏ | 由速買配提供（如 `SEI1000383`） |
| `Verify_key` | 驗證碼 | Ｏ | Ｏ | 由速買配提供（如 `CA448DE3B5C58417599FD5215CA7E9BC`） |

---

### 2. 發票資訊

| 參數 | 名稱 | B2C | B2B | 格式 / 說明 |
|------|------|-----|-----|-------------|
| `InvoiceNumber` | 發票號碼 | ▲ | ▲ | `英文(2)+數字(8)` 共 10 碼，無符號。營業人自管字軌時用 |
| `RandomNumber` | 隨機碼 | ▲ | ▲ | 4 位數字 |
| `InvoiceDate` | 開立日期 | Ｏ | Ｏ | `YYYY/MM/DD`。B2C 限 48hr 內、B2B 限 168hr 內 |
| `InvoiceTime` | 開立時間 | Ｏ | Ｏ | `HH:MM:SS` |
| `TrackSystemID` | 自訂字軌系統代號 | ▲ | ▲ | 在【字軌管理】設定後可指定使用 |
| `Intype` | 發票稅率類型 | Ｏ | Ｏ | `07`：一般稅額（TaxType 允許 1/2/3/9）<br>`08`：特種稅額（TaxType 允許 2/3/4/9） |
| `TaxType` | 課稅別 | Ｏ | Ｏ | `1`：應稅、`2`：零稅率、`3`：免稅、`4`：應稅(特種)、`9`：混合 |
| `TaxRate` | 稅率 | ▲ | ▲ | 0.00~1.00 小數。僅在 `Intype=08` 且 `TaxType=4/9` 有效。<br>常見：`0.25` 特種飲食、`0.15` 特種飲食、`0.01` 查定課徵、`0.001` 農產品 |
| `BuyerRemark` | 買受人註記 | ▲ | ▲ | `1` 得抵扣進貨費用、`2` 得抵扣固定資產、`3` 不得抵扣進貨費用、`4` 不得抵扣固定資產 |
| `CustomsClearanceMark` | 通關方式註記 | ▲ | ▲ | `1` 非經海關、`2` 經海關。**零稅率發票必填** |
| `GroupMark` | 彙開註記 | ▲ | ▲ | `Y` 表示彙開發票 |
| `BondedAreaConfirm` | 買受人簽署適用零稅率註記 | Ｘ | ▲ | `1` 保稅區、`2` 遠洋漁業、`3` 自由貿易港區、`4` 其他 |
| `ZeroTaxRateReason` | 零稅率原因 | ▲ | ▲ | `71`~`79` 對應營業稅法第 7 條各款。**零稅率發票必填** |
| `MainRemark` | 總備註 | ▲ | ▲ | 200 字內，呈現於 A4/A5 |
| `RelateNumber` | 相關號碼 | ▲ | ▲ | 20 字內 |
| `DonateMark` | 捐贈 | Ｏ | Ｏ | `1` 捐贈、`0` 不捐贈。**有 Buyer_id 時必須為 0** |
| `LoveKey` | 愛心碼 | ▲ | Ｘ | `DonateMark=1` 時必填 |
| `Visa_Last4` | 信用卡末四碼 | ▲ | ▲ | 4 字元 |
| `data_id` | 自訂發票編號 | ▲ | ▲ | 50 字內。同期別不可重複（除非作廢） |
| `orderid` | 自訂號碼 | ▲ | ▲ | 30 字內 |
| `PosSystemID` | 營業人自定義系統代號 | ▲ | ▲ | 20 字內（英數）。用以區分不同開立來源 |
| `Certificate_Remark` | 發票證明聯備註 | ▲ | ▲ | 34 字內，呈現於熱感紙 / A4 / A5 |

---

### 3. 商品明細

> 除 `AllAmount` / `UnitTAX` 外，皆以 **`|`（半形）** 分隔，每個欄位的項目數必須一致。

| 參數 | 名稱 | B2C | B2B | 格式 / 說明 |
|------|------|-----|-----|-------------|
| `Description` | 商品明細 | Ｏ | Ｏ | `商品1|商品2`，每項 ≤ 256 字、不可有符號 |
| `Quantity` | 數量明細 | Ｏ | Ｏ | 純數字，必須 > 0 |
| `UnitPrice` | 單價明細 | Ｏ | Ｏ | 純數字，可 < 0。透過 `UnitTAX` 指定含稅或未稅 |
| `Unit` | 單位明細 | ▲ | ▲ | 每項 ≤ 6 字、不可有符號 |
| `ProductTaxType` | 商品稅率明細 | ▲ | ▲ | `TaxType=9`（混合）時必填。`1` 應稅、`3` 免稅 |
| `Remark` | 商品備註 | ▲ | ▲ | 每項 ≤ 40 字、不可有符號 |
| `Amount` | 各明細總額 | Ｏ | Ｏ | `數量 × 單價`，可 < 0 |
| `AllAmount` | 總金額（含稅） | Ｏ | Ｏ | 整數 ≥ 0，由各 `Amount` 合計，**必須含稅** |
| `SalesAmount` | 應稅銷售額 | ▲ | ▲ | `TaxType=9` B2C/B2B 必填含稅銷售額；`TaxType=1` B2B 填未稅銷售額 |
| `FreeTaxSalesAmount` | 免稅銷售額 | ▲ | Ｘ | `TaxType=9` 時必填 |
| `ZeroTaxSalesAmount` | 零稅率銷售額 | ▲ | Ｘ | `TaxType=9` 時必填 |
| `UnitTAX` | 單價含稅 | Ｘ | ▲ | `Y` 含稅（預設）、`N` 未稅 |
| `TaxAmount` | 稅金 | Ｘ | ▲ | 整數 ≥ 0。僅 B2B 生效，自行計算 |

---

### 4. 買受人資訊

| 參數 | 名稱 | B2C | B2B | 格式 / 說明 |
|------|------|-----|-----|-------------|
| `Buyer_id` | 買受人統編 | Ｘ | Ｏ | 有值開 B2B、空值開 B2C |
| `CompanyName` | 公司名稱 | Ｘ | ▲ | 30 字、無符號 |
| `Name` | 姓名 | ▲ | Ｘ | 30 字、無符號 |
| `Phone` | 電話 | ▲ | ▲ | 純數字，如 `0900123456` |
| `Facsimile` | 傳真 | Ｘ | ▲ | 純數字 |
| `Email` | 信箱 | ▲ | ▲ | 80 字內，多組以 `;` 分隔 |
| `Address` | 地址 | ▲ | ▲ | 100 字內 |
| `CarrierType` | 載具類型 | ▲ | Ｘ | 速買配載具 `EJ0113`、手機條碼 `3J0002`、自然人憑證 `CQ0001` |
| `CarrierID` | 載具 ID 明碼 | ▲ | Ｘ | `CarrierType` 有值時必填（`EJ0113` 可用 Email/Phone 註冊則可空） |
| `CarrierID2` | 載具 ID 暗碼 | ▲ | Ｘ | 同上 |

---

## 開立規則速查

| 買受人 | 個人（捐贈） | 個人（載具） | 公司（統編） |
|--------|--------------|--------------|--------------|
| `DonateMark` | `1` | `0` | `0` |
| `LoveKey` | Ｏ | Ｘ | Ｘ |
| `CarrierType` | Ｘ | Ｏ | Ｘ |
| `CarrierID` | Ｘ | Ｏ | Ｘ |
| `Buyer_id` | Ｘ | Ｘ | Ｏ |

---

## 範例（測試環境）

### B2C 個人發票

```
https://ssl.smse.com.tw/api_test/SPEinvoice_Storage.asp?
  Grvc=SEI1000383&Verify_key=CA448DE3B5C58417599FD5215CA7E9BC
  &Name=速買配&Phone=0900000000&Email=Test@testmailserver.net
  &Intype=07&TaxType=1&LoveKey=&DonateMark=0
  &Description=商品1|商品2&Quantity=5|8&UnitPrice=10|15
  &Unit=顆|條&Amount=50|120&ALLAmount=170
  &InvoiceDate=2026/5/11&InvoiceTime=15:33:33
```

### B2B 公司發票

```
https://ssl.smse.com.tw/api_test/SPEinvoice_Storage.asp?
  Grvc=SEI1000383&Verify_key=CA448DE3B5C58417599FD5215CA7E9BC
  &CompanyName=速買配&Phone=0900000000&Email=Test@testmailserver.net
  &Intype=07&TaxType=1&LoveKey=&DonateMark=0
  &Description=商品1|商品2&Quantity=5|8&UnitPrice=10|15
  &Unit=顆|條&Amount=50|120&ALLAmount=170
  &InvoiceDate=2026/5/11&InvoiceTime=15:33:33
  &Buyer_id=80129529
```

### B2G 政府發票
> 統編必填、商品金額必須含稅（`UnitTAX=Y`）、發票類型帶 `Einvoice_Type=B2B`

```
https://ssl.smse.com.tw/api_test/SPEinvoice_Storage.asp?
  Grvc=SEI1000383&Verify_key=CA448DE3B5C58417599FD5215CA7E9BC
  &CompanyName=速買配&Phone=0900000000&Email=Test@testmailserver.net
  &Intype=07&TaxType=1&LoveKey=&DonateMark=0
  &Description=商品&Quantity=1&UnitPrice=100&Unit=顆&Amount=100&ALLAmount=100
  &InvoiceDate=2026/5/11&InvoiceTime=15:33:33
  &Buyer_id=80129529&UnitTAX=Y&Einvoice_Type=B2B
```

---

## 回應

回應為 XML 格式：

```xml
<SmilePayEinvoice>
  <Status>0</Status>
  <Desc></Desc>
  <Grvc>SEI1000002</Grvc>
  <orderno>order20171231</orderno>
  <data_id>inid00001</data_id>
  <InvoiceNumber>YY00000000</InvoiceNumber>
  <RandomNumber>1234</RandomNumber>
  <InvoiceDate>2017/12/31</InvoiceDate>
  <InvoiceTime>23:59:59</InvoiceTime>
  <InvoiceType>B2C</InvoiceType>
  <CarrierID></CarrierID>
</SmilePayEinvoice>
```

### XML 欄位說明

| Tag | 名稱 | 說明 |
|-----|------|------|
| `Status` | 狀態碼 | 見下表 |
| `Desc` | 詳細原因 | 見下表 |
| `orderno` | 自訂號碼 | |
| `data_id` | 自訂發票編號 | |
| `InvoiceNumber` | 發票號碼 | 實際開立號碼 |
| `RandomNumber` | 隨機碼 | |
| `InvoiceDate` | 開立日期 | |
| `InvoiceTime` | 開立時間 | |
| `InvoiceType` | 發票類型 | `B2C` 無統編、`B2C2B` 有統編可作廢、`B2B` 有統編無法註銷（`BondedAreaConfirm` 有值時為此） |
| `CarrierID` | 載具 ID | 申請速買配載具則回傳 |

---

## 回應代號

### 成功
| 代號 | 說明 |
|------|------|
| `0` | 開立成功 |

### 商家帳號錯誤
| 代號 | 說明 |
|------|------|
| `-1001` | 商家帳號缺少參數 |
| `-10011` | 查無商家帳號 |
| `-10012` | 尚未開放 B2B 功能 |
| `-10013` | 尚未開放 B2C 功能 |

### 統編錯誤
| 代號 | 說明 |
|------|------|
| `-10021` | `Buyer_id` 格式錯誤 |
| `-10022` | 統編不可捐贈（`DonateMark` 必須為 0） |
| `-10023` | `Buyer_id` 內容錯誤 |
| `-10024` | `Buyer_id` 不可使用其他載具（`CarrierType`） |
| `-10025` | 缺少 `CompanyName` |

### 日期錯誤
| 代號 | 說明 |
|------|------|
| `-10031` | 缺少 `InvoiceDate` / `InvoiceTime` |
| `-10032` | 日期格式錯誤 |
| `-10033` | B2C 開立需在 48hr 內 |
| `-10034` | B2B 開立需在 168hr 內 |

### 發票欄位錯誤
| 代號 | 說明 |
|------|------|
| `-10041` | `Intype` 錯誤 |
| `-10042` | `BuyerRemark` 錯誤 |
| `-10043` | `CustomsClearanceMark` 錯誤 |
| `-10044` | `DonateMark` 錯誤 |
| `-10045` | `LoveKey` 空白 |
| `-10046` | 愛心碼伺服器異常 |
| `-10047` | 查無此 `LoveKey` |
| `-10048` | `TaxType` 錯誤 |
| `-10049` | `BondedAreaConfirm` 錯誤 |
| `-100410` | `MainRemark` 錯誤 |
| `-100411` | `RelateNumber` 錯誤 |
| `-100412` | `ZeroTaxRateReason` 錯誤 |

### 載具錯誤
| 代號 | 說明 |
|------|------|
| `-10051` | `Phone` 格式錯誤 |
| `-10052` | `CarrierID` 錯誤 |
| `-10053` | 查無 `CarrierID` |
| `-10054` | 缺少建立載具參數（Email / Phone） |
| `-10055` | 建立載具失敗 |
| `-10056` | 查無手機條碼 `CarrierID` |
| `-10057` | 自然人憑證 `CarrierID` 格式錯誤 |
| `-10058` | `CarrierType` 非允許使用 |

### 商品錯誤
| 代號 | 說明 |
|------|------|
| `-10061` | 商品各項目數量不符 |
| `-10062` | 內容長度不正確（`Description` 256 字、`Unit` 6 字、`Remark` 40 字） |
| `-10063` | `Quantity` 內容錯誤 |
| `-10064` | `UnitPrice` / `Amount` 內容錯誤 |
| `-10065` | `UnitPrice × Quantity` 與 `Amount` 驗算錯誤 |
| `-10066` | `AllAmount` 驗算錯誤 |
| `-10067` | 商品與 `AllAmount` 不符規定 |
| `-10068` | 混合稅率銷售額明細錯誤 |
| `-10069` | `TaxAmount` 與 `SalesAmount` 驗算錯誤 |
| `-100610` | `TaxRate` 內容錯誤 |
| `-100611` | `ProductTaxType` 內容錯誤 |

### 字軌 / 自訂編號
| 代號 | 說明 |
|------|------|
| `-10071` | 無可用字軌 |
| `-10072` | `data_id` 重複 |
| `-10073` | `PosSystemID` 格式錯誤 |

### 其他欄位
| 代號 | 說明 |
|------|------|
| `-10081` | `Visa_Last4` 格式錯誤 |
| `-10082` | `Certificate_Remark` 格式錯誤 |
| `-10083` | `data_id` 格式錯誤 |
| `-10084` | `orderid` 格式錯誤 |

### 發票號碼
| 代號 | 說明 |
|------|------|
| `-2001` | `InvoiceNumber` 格式錯誤 |
| `-2002` | `RandomNumber` 格式錯誤 |
| `-2003` | `InvoiceNumber` 不可重複 |

---

## 開立折讓單

### 端點

| 環境 | URL |
|------|-----|
| 正式 | `https://ssl.smse.com.tw/api/SPEinvoice_Storage_Allowance.asp` |
| 測試 | `https://ssl.smse.com.tw/api_test/SPEinvoice_Storage_Allowance.asp` |

- 編碼：**UTF-8**
- 欄位**區分大小寫**

### 參數

#### 使用者參數

| 參數 | 名稱 | 必填 | 說明 |
|------|------|------|------|
| `Grvc` | 電子發票帳號 | Ｏ | 由速買配提供 |
| `Verify_key` | 驗證碼 | Ｏ | 由速買配提供 |

#### 折讓單資訊

| 參數 | 名稱 | 必填 | 格式 / 說明 |
|------|------|------|-------------|
| `InvoiceNumber` | 發票號碼 | Ｏ | 需折讓的發票號碼 |
| `InvoiceDate` | 發票日期 | Ｏ | 對應的發票日期 |
| `AllowanceNumber` | 折讓單號碼 | ▲ | 15 字元（英數混合）、無符號。可空白，速買配會自動產生 |
| `AllowanceDate` | 折讓日期 | ▲ | `YYYY-MM-DD`，可空白 |
| `AllowanceType` | 折讓類型 | ▲ | `1` 買方開立、`2` 賣方開立（預設） |

#### 折讓明細
> 各欄位以 `|`（半形）分隔，每欄項目數必須一致

| 參數 | 名稱 | 必填 | 格式 / 說明 |
|------|------|------|-------------|
| `Description` | 商品明細 | Ｏ | `商品1|商品2`，無符號 |
| `Quantity` | 數量明細 | Ｏ | 純數字 > 0 |
| `UnitPrice` | 單價明細（**未稅**） | Ｏ | 純數字，可 < 0 |
| `Unit` | 單位明細 | ▲ | 無符號，可空白 |
| `Amount` | 各明細總額（**未稅**） | Ｏ | `數量 × 未稅單價`，可 < 0 |
| `Tax` | 稅金 | Ｏ | 純數字，營業人自行計算 |
| `TaxType` | 課稅別 | Ｏ | `1` 應稅、`2` 零稅率、`3` 免稅、`4` 應稅(特種) |

### 回應

```xml
<SmilePayEinvoice>
  <Status>0</Status>
  <Desc></Desc>
  <Grvc>SEI1000002</Grvc>
  <InvoiceNumber>YY00000000</InvoiceNumber>
  <AllowanceNumber>YY00000000</AllowanceNumber>
</SmilePayEinvoice>
```

| Tag | 說明 |
|-----|------|
| `Status` | 狀態碼（見下表） |
| `Desc` | 詳細原因 |
| `Grvc` | 商家代號 |
| `InvoiceNumber` | 發票號碼 |
| `AllowanceNumber` | 折讓單號碼 |

### 回應代號

| 代號 | 說明 |
|------|------|
| `0` | 開立成功 |
| `-1001` | 商家帳號缺少參數 |
| `-10011` | 查無商家帳號 |
| `-1002` | `InvoiceNumber` 錯誤 |
| `-10021` | 商品不可空白 |
| `-10022` | 商品各項目數量不符 |
| `-10023` | `Description` 異常 |
| `-10024` | `Quantity` 異常 |
| `-10025` | `UnitPrice` 金額異常 |
| `-10026` | `TaxType` 異常 |
| `-10027` | `Tax` 異常 |
| `-10028` | `AllowanceDate` 異常 |
| `-1003` | 查無此筆發票 |
| `-10031` | 超過可折讓金額 |
| `-10032` | `AllowanceNumber` 不可重複 |

---

## 發票/折讓單 作廢/註銷

### 端點

| 環境 | URL |
|------|-----|
| 正式 | `https://ssl.smse.com.tw/api/SPEinvoice_Storage_Modify.asp` |
| 測試 | `https://ssl.smse.com.tw/api_test/SPEinvoice_Storage_Modify.asp` |

- 編碼：**UTF-8**
- 欄位**區分大小寫**

### 參數

#### 使用者參數

| 參數 | 名稱 | 說明 |
|------|------|------|
| `Grvc` | 商家代號 | 由速買配提供 |
| `Verify_key` | 驗證碼 | 由速買配提供 |

#### 相關欄位

| 參數 | 名稱 | 格式 / 說明 |
|------|------|-------------|
| `InvoiceNumber` | 發票號碼 | 需處理的發票號碼 |
| `InvoiceDate` | 發票日期 | 該筆發票日期 |
| `AllowanceNumber` | 折讓單號碼 | 需處理的折讓單號碼 |
| `AllowanceDate` | 折讓單日期 | 該筆折讓單日期 |
| `types` | 服務類型 | `Cancel` 作廢發票、`Void` 註銷發票、`CancelAllowance` 作廢折讓單、`StopProcessing` 取消執行（僅發票，大平台已接收則無法執行） |
| `CancelReason` | 作廢原因 | 20 字內，作廢發票/折讓單的實際原因 |
| `ReturnTaxDocumentNumber` | 專案作廢核准文號 | 60 字內，可空白 |
| `VoidReason` | 註銷原因 | 20 字內，註銷發票實際原因 |
| `Remark` | 備註 | 200 字內 |

### 各操作必要欄位

| 欄位 | 作廢發票 | 註銷發票 | 作廢折讓單 | 取消執行 |
|------|----------|----------|------------|----------|
| `InvoiceNumber` | Ｏ | Ｏ | Ｘ | Ｏ |
| `InvoiceDate` | Ｏ | Ｏ | Ｘ | Ｏ |
| `AllowanceNumber` | Ｘ | Ｘ | Ｏ | Ｘ |
| `AllowanceDate` | Ｘ | Ｘ | Ｏ | Ｘ |
| `CancelReason` | Ｏ | Ｘ | Ｏ | Ｘ |
| `ReturnTaxDocumentNumber` | ▲ | Ｘ | Ｘ | Ｘ |
| `VoidReason` | Ｘ | Ｏ | Ｘ | Ｘ |
| `Remark` | ▲ | ▲ | ▲ | Ｘ |

### 回應

```xml
<SmilePayEinvoice>
  <Status>0</Status>
  <Desc></Desc>
  <Types></Types>
  <Grvc>SEI1000002</Grvc>
  <InvoiceNumber>YY00000000</InvoiceNumber>
  <AllowanceNumber>SMEE000000000000</AllowanceNumber>
  <CancelDate>2017/12/31</CancelDate>
  <CancelTime>23:59:59</CancelTime>
  <VoidDate>2017/12/31</VoidDate>
  <VoidTime>23:59:59</VoidTime>
  <RejectDate>2017/12/31</RejectDate>
  <RejectTime>23:59:59</RejectTime>
</SmilePayEinvoice>
```

| Tag | 說明 |
|-----|------|
| `Status` | 狀態碼 |
| `Desc` | 詳細原因 |
| `Nowstatus` | 物流狀態（僅 `-2008` 時提供） |
| `Types` | 服務類型 |
| `Grvc` | 商家代號 |
| `InvoiceNumber` | 發票號碼 |
| `AllowanceNumber` | 折讓單號碼 |
| `CancelDate` / `CancelTime` | 作廢日期/時間（僅 `Cancel` / `CancelAllowance`） |
| `VoidDate` / `VoidTime` | 註銷日期/時間（僅 `Void`） |

### 回應代號

| 代號 | 說明 |
|------|------|
| `0` | 處理成功 |
| `-1000` | 商家帳號缺少參數 |
| `-1001` | 查無商家帳號 |
| `-1002` | 服務類型錯誤 |
| `-2001` | 缺少 `InvoiceNumber` 或 `CancelReason` |
| `-2002` | `CancelReason` 超過字數 |
| `-2003` | `ReturnTaxDocumentNumber` 超過字數 |
| `-2004` | `Remark` 超過字數 |
| `-2005` | 缺少 `InvoiceNumber` 或 `VoidReason` |
| `-2006` | `VoidReason` 超過字數 |
| `-2007` | 缺少 `AllowanceNumber` 或 `CancelReason` |
| `-2008` | 發票目前狀態不允許執行該動作 |
| `-2009` | 發票有折讓紀錄不允許執行該動作 |
| `-2010` | 查無該筆發票/折讓單 |

---

## 列印發票

### 端點

> 用 GET 或 POST 帶參數開啟發票列印頁面。

| 模式 | 環境 | URL |
|------|------|-----|
| **網頁列印**（瀏覽器列印對話框，A4/A5/證明聯版型） | 正式 | `https://einvoice.smilepay.net/einvoice/SmilePayCarrier/InvoiceDetails.php` |
| | 測試 | `https://einvoice.smilepay.net/einvoice_test/SmilePayCarrier/InvoiceDetails.php` |
| **EPSON IP 列印**（證明聯版型） | 正式 | `https://einvoice.smilepay.net/einvoice/Invoice_Print/Invoice_Print_EPSON.php` |
| | 測試 | `https://einvoice.smilepay.net/einvoice_test/Invoice_Print/Invoice_Print_EPSON.php` |

### 參數

| 參數 | 名稱 | 格式 / 說明 |
|------|------|-------------|
| `Grvc` | 電子發票帳號 | 由速買配提供（如 `SEI1000383`） |
| `Verify_key` | 驗證碼 | 由速買配提供 |
| `InNumber` | 發票號碼 | `英文(2)+數字(8)` 共 10 碼 |
| `InvoiceDate` | 發票日期 | `YYYY/MM/DD` |
| `RaNumber` | 發票認證碼 | B2C：隨機碼<br>B2B：買受人統編 |
| `DetailPrint` | 呈現交易明細聯 | `Y` / 不帶入 |
| `AutoPrint` | 自動列印 | `Y` / 不帶入。開啟網頁後自動執行列印 |
| `Printer_ip` | 指定印表機 IP | 如 `192.168.10.10`。**僅 EPSON IP 列印使用** |

### 範例（測試環境）

#### B2C
```
https://einvoice.smilepay.net/einvoice_test/SmilePayCarrier/InvoiceDetails.php?
  Grvc=SEI1000383&Verify_key=CA448DE3B5C58417599FD5215CA7E9BC
  &InNumber=HG00631928&InvoiceDate=2024/11/06&RaNumber=7572
```

#### B2B
```
https://einvoice.smilepay.net/einvoice_test/SmilePayCarrier/InvoiceDetails.php?
  Grvc=SEI1000383&Verify_key=CA448DE3B5C58417599FD5215CA7E9BC
  &InNumber=HG00631929&InvoiceDate=2024/11/06&RaNumber=80129529
```
