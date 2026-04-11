# BillionConnect API 文件摘要

## 環境地址

| 環境 | URL |
|------|-----|
| 測試環境 | `https://api-flow-ts.billionconnect.com/Flow/saler/2.0/invoke` |
| 生產環境 | `https://apiint-flow.billionconnect.com/Flow/saler/2.0/invoke` |

---

## 通信協議

- 基於 RESTful，**所有請求為 HTTP POST**
- 請求/響應均為 **JSON 格式**，UTF-8 編碼
- 渠道系統與 BillionConnect 系統互為服務端/客戶端

---

## HTTP Header 格式

| Header | 說明 | 必填 |
|--------|------|------|
| `Content-Type` | `application/json;charset=UTF-8` | Y |
| `x-channel-id` | appKey（從【接口授權】頁面獲取） | Y |
| `x-sign-method` | `md5` | Y |
| `x-sign-value` | MD5 簽名值 | Y |

---

## 簽名生成規則

```
x-sign-value = md5(appSecret + 請求體JSON字串)
```

**範例：**
```
md5("65f4ee66c5a019b9d0f5545b575c33c6" + '{"params1":"value1","params2":"value2"}')
```

- `appKey` 和 `appSecret` 均從【接口授權】頁面獲取

---

## 請求報文格式

| 參數 | 類型 | 說明 | 必填 |
|------|------|------|------|
| `tradeType` | String | 接口類型代碼（如 F001） | Y |
| `tradeTime` | String | 時間戳，格式：`YYYY-MM-DD hh:mi:ss` | Y |
| `tradeData` | Object | 報文實體，依 tradeType 而異 | N |

**請求範例：**
```json
// Header
{
  "Content-Type": "application/json;charset=UTF-8",
  "x-channel-id": "<appKey>",
  "x-sign-method": "md5",
  "x-sign-value": "<md5簽名值>"
}

// Body
{
  "tradeType": "F001",
  "tradeTime": "2016-03-07 11:05:24",
  "tradeData": {}
}
```

---

## 通知接口機制（Webhook / Callback）

### 兩種交互方向

| 類型 | 方向 | 說明 |
|------|------|------|
| 普通接口 | 渠道 → BillionConnect | 渠道主動呼叫（查詢、創建訂單等） |
| 通知接口 | BillionConnect → 渠道 | BC 完成業務後主動推送（如 eSIM 二維碼） |

### 通知接口注意事項

- **回調地址**：需在【接口授權】頁面的「通知回調地址」欄位設定
- **接口安全**：收到通知時需驗證簽名（與發送規則相同）
- **幂等性處理**：同一通知可能重複發送，需用唯一標識（訂單號 + 事件類型）去重
- **及時響應**：收到通知後需盡快回應，超時會觸發重試

### 通知流程

```
渠道系統 → 實現通知接收接口 + 配置回調 URL
     ↕
BillionConnect → 業務事件觸發 → 推送通知 → 記錄結果
     ↕
渠道系統 → 接收通知 → 處理 → 響應
```

---

## 接口列表

### 主動呼叫接口（渠道 → BillionConnect）

| tradeType | 接口名稱 | 說明 |
|-----------|----------|------|
| [F001](#f001-獲取覆蓋國家列表) | 獲取覆蓋國家列表 | 獲取本渠道可售賣的國家清單 |
| [F002](#f002-獲取商品) | 獲取商品 | 獲取本渠道可售賣的商品列表 |
| [F003](#f003-獲取商品價格) | 獲取商品價格 | 獲取商品的價格與結算基準價 |
| [F004](#f004-獲取自提點資訊) | 獲取自提點資訊 | 獲取自提點地址、開放時間、GPS 等資訊 |
| [F005](#f005-獲取物流公司資訊) | 獲取物流公司資訊 | 獲取可用物流公司代碼與名稱 |
| [F006](#f006-創建卡訂單) | 創建卡訂單 | 建立 SIM 卡購買訂單（含郵寄/自提） |
| [F007](#f007-創建充值訂單) | 創建充值訂單 | 對已有 SIM/eSIM 卡進行流量充值 |
| [F008](#f008-取消訂單) | 取消訂單 | 取消已建立的訂單 |
| [F009](#f009-修改物流資訊) | 修改物流資訊 | 發貨前修改訂單的收件人與物流資訊 |
| [F010](#f010-查詢卡有效期) | 查詢卡有效期 | 查詢指定 ICCID 的有效期與狀態 |
| [F011](#f011-查詢訂單資訊) | 查詢訂單資訊 | 查詢卡訂單或充值訂單的詳細狀態 |
| [F012](#f012-查詢套餐使用資訊) | 查詢套餐使用資訊 | 查詢指定 ICCID 的流量使用狀況 |
| [F013](#f013-卡號充值驗證) | 卡號充值驗證 | 驗證 ICCID 是否可進行充值 |
| [F014](#f014-預存款查詢) | 預存款查詢 | 查詢渠道帳戶餘額 |
| [F015](#f015-查詢加速包商品) | 查詢加速包商品 | 查詢指定訂單/ICCID 可購買的加速包 |
| [F016](#f016-創建加速包訂單) | 創建加速包訂單 | 為已有卡建立加速包購買訂單 |
| [F017](#f017-售後申請) | 售後申請 | 提交訂單的售後（退款/退卡）申請 |
| [F018](#f018-取消售後申請) | 取消售後申請 | 取消尚未審核的售後單 |
| [F019](#f019-修改售後申請) | 修改售後申請 | 修改尚未審核的售後單內容 |
| [F020](#f020-查詢售後資訊) | 查詢售後資訊 | 查詢售後單的審核與退款狀態 |
| [F023](#f023-日流量查詢) | 日流量查詢 | 查詢卡片每日流量使用情況 |
| [F040](#f040-創建-esim-訂單) | 創建 eSIM 訂單 | 建立 eSIM 購買訂單 |
| [F041](#f041-重新發送-esim-郵件) | 重新發送 eSIM 郵件 | 重新寄送 eSIM 二維碼郵件 |
| [F042](#f042-查詢-esim-服務狀態) | 查詢 eSIM 服務狀態 | 查詢 eSIM 下載/安裝/啟用狀態歷程 |
| [F045](#f045-結束已激活套餐) | 結束已激活套餐 | 手動結束正在使用中的套餐 |
| [F046](#f046-查詢套餐使用資訊) | 查詢套餐使用資訊（v2） | 查詢訂單套餐使用量（含每日明細） |
| [F051](#f051-透過商品-id-獲取自提點資訊) | 透過商品 ID 獲取自提點資訊 | 依商品 ID 查詢對應自提點 |
| [F052](#f052-查詢-esim-充值商品) | 查詢 eSIM 充值商品 | 依 ICCID 查詢可充值的商品 ID 列表 |
| [F054](#f054-查詢實名認證狀態) | 查詢實名認證狀態 | 查詢 ICCID 的實名認證進度 |
| [F056](#f056-查詢所有加速包商品) | 查詢所有加速包商品 | 取得全部加速包商品列表 |

### 通知接口（BillionConnect → 渠道 Webhook）

> 以下接口需由**渠道系統實作**，並在【接口授權】頁面設定回調地址。
> 渠道收到通知後需回應 `{ "tradeCode": "1000", "tradeMsg": "成功" }`

| tradeType | 接口名稱 | 觸發時機 |
|-----------|----------|----------|
| [N001](#n001-訂單發貨通知) | 訂單發貨通知 | 含卡訂單已發貨/投遞 |
| [N002](#n002-流量開始使用通知) | 流量開始使用通知 | 套餐流量開始計時 |
| [N003](#n003-流量使用結束通知) | 流量使用結束通知 | 套餐流量使用完畢 |
| [N004](#n004-售後審核通知) | 售後審核通知 | 售後單審核完成（通過/駁回） |
| [N005](#n005-退款通知) | 退款通知 | 退款處理完成 |
| [N006](#n006-商品資訊修改通知) | 商品資訊修改通知 | BC 端商品內容有變更 |
| [N009](#n009-esim-二維碼通知) | eSIM 二維碼通知 | eSIM 訂單二維碼已生成 |
| [N010](#n010-esim-郵件發送通知) | eSIM 郵件發送通知 | eSIM 二維碼郵件已寄出 |
| [N012](#n012-esim-狀態變更通知) | eSIM 狀態變更通知 | eSIM Profile 狀態異動 |
| [N013](#n013-充值訂單結果通知) | 充值訂單結果通知 | 充值訂單處理完成 |

---

## F001 獲取覆蓋國家列表

> 渠道調用 → BillionConnect

### 入參

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F001` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData.salesMethod` | String | Y | 銷售方式：1-零售 2-OTA 3-批發 4-分傭 5-分銷 6-其他 |
| `tradeData.language` | String | N | 語言：1-中文 2-英語（預設中文） |

**請求範例：**
```json
{
  "tradeType": "F001",
  "tradeTime": "2017-02-10 11:11:11",
  "tradeData": {
    "salesMethod": "1"
  }
}
```

### 響應

| 字段 | 類型 | 說明 |
|------|------|------|
| `tradeCode` | String | `1000` = 成功，其他為失敗 |
| `tradeMsg` | String | 結果描述 |
| `tradeData[].continent` | String | 洲別 |
| `tradeData[].mcc` | String | 國家代碼（如 `CN`） |
| `tradeData[].name` | String | 國家名稱 |
| `tradeData[].url` | String | 國旗圖片地址（選填） |

**響應範例：**
```json
{
  "tradeCode": "1000",
  "tradeMsg": "成功",
  "tradeData": [
    {
      "continent": "亞洲",
      "mcc": "CN",
      "name": "中華人民共和國",
      "url": "http://p.flow.billionconnect.com/module/country/cn.png"
    }
  ]
}
```

---

## F002 獲取商品

> 渠道調用 → BillionConnect

### 入參

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F002` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData.salesMethod` | String | Y | 銷售方式：1-零售 2-OTA 3-批發 4-分傭 5-分銷 6-其他 |
| `tradeData.skuId` | String | N | 商品 ID |
| `tradeData.networkOperatorScope` | String | N | 網絡運營商範圍：1-1級 2-所有（預設1級） |
| `tradeData.language` | String | N | 語言：1-中文 2-英語（預設中文） |
| `tradeData.countryCode` | String | N | 國家代碼 |

**請求範例：**
```json
{
  "tradeType": "F002",
  "tradeTime": "2017-02-10 11:11:11",
  "tradeData": {
    "salesMethod": "1",
    "language": "1"
  }
}
```

### 商品類型（type）對照表

| 值 | 說明 |
|----|------|
| `110` | 自選套餐 |
| `111` | 固定套餐 |
| `210` | 單次卡 |
| `211` | 多次卡 |
| `212` | 硬卡 |
| `220` | 銷售 MIFI |
| `221` | 租賃 MIFI |
| `230` | eSIM |
| `250` | eSIM Air |
| `311` | 硬卡+流量 |
| `3101~3106` | 單次卡/多次卡/eSIM + 自選/固定套餐 |
| `3201~3212` | 銷售/租賃 MIFI + 自選/固定套餐 |

### 響應（tradeData 陣列）

**商品主體：**

| 字段 | 類型 | 說明 |
|------|------|------|
| `skuId` | String | 商品 ID |
| `name` | String | 商品名稱 |
| `type` | String | 商品類型（見上表） |
| `days` | String | 天數 |
| `capacity` | String | 流量包大小（KB） |
| `highFlowSize` | String | 高速流量大小（KB/天） |
| `limitFlowSpeed` | String | 限速後峰值（kbps） |
| `hotspotSupport` | String | 熱點分享：0-不支持 1-支持 |
| `planType` | String | 套餐類型：0-總量型 1-單日型 |
| `pointContactType` | String | 日切點類型：0-24小時制 1-日結制 |
| `timeZone` | String | 運營商時區 |
| `pointContactHours` | String | 日切點時間 |
| `usageCount` | String | 設備可用次數：1-單次 2-多次 |
| `accelerationSupport` | String | 加速支持：0-不支持 1-SIM 2-eSIM 3-全部 4-eSIM Air |
| `rechargeableProduct` | String | 復充商品：0-否 1-是 |
| `rechargeableProductSeriesId` | String | 復充商品系列 ID |
| `rechargeableProductSeriesName` | String | 復充商品系列名稱 |
| `applyToDevice` | String | 適用載體 |
| `estimatedUseTimeFlag` | String | 預計出行時間填寫標誌：1-必填 2-無需填寫 |
| `refundPolicy` | String | 退款政策 |
| `speedLimitRule` | String | 限速規則 |
| `carrierValidityPeroid` | String | 載體預設有效期 |
| `desc` | String | 商品描述 |

**country 陣列（國家資訊）：**

| 字段 | 類型 | 說明 |
|------|------|------|
| `mcc` | String | 國家代碼 |
| `name` | String | 國家名稱 |
| `apn` | String | APN 資訊 |
| `apnUsername` | String | APN 用戶名 |
| `apnPassword` | String | APN 密碼 |
| `apnType` | String | APN 設定類型：0-不需要 1-需要 |
| `authenticationType` | String | 身份驗證類型 |
| `apnTypeDesc` | String | APN 類型描述 |
| `highSpeedTime` | String | 高速刷新時間 |

**operatorInfo 陣列（運營商資訊）：**

| 字段 | 類型 | 說明 |
|------|------|------|
| `operator` | String | 網絡運營商 |
| `network` | String | 網絡制式（如 4G） |
| `priority` | String | 優先級 |
| `ProviderZone` | String | IMSI 歸屬地 |
| `ip1` / `ip2` / `ip3` | String | IP 地址 |
| `ipRemarks` | String | IP 描述 |

**響應範例：**
```json
{
  "tradeCode": "1000",
  "tradeMsg": "成功",
  "tradeData": [
    {
      "skuId": "1090",
      "name": "香港-4G-1天-200M",
      "type": "110",
      "days": "1",
      "highFlowSize": "20000",
      "limitFlowSpeed": "128",
      "hotspotSupport": "1",
      "country": [
        {
          "mcc": "HK",
          "name": "香港",
          "apn": "3gnet",
          "apnType": "0",
          "operatorInfo": [
            { "operator": "cuhk", "network": "4G", "priority": "1" }
          ]
        }
      ],
      "desc": "香港 1 天包，每天高速流量 200MB，降速 128kbps 後不限流量"
    }
  ]
}
```

---

## F003 獲取商品價格

> 渠道調用 → BillionConnect

### 入參

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F003` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData.salesMethod` | String | Y | 銷售方式：1-零售 2-OTA 3-批發 4-分傭 5-分銷 6-其他 |

**請求範例：**
```json
{
  "tradeType": "F003",
  "tradeTime": "2017-02-10 11:11:11",
  "tradeData": {
    "salesMethod": "1"
  }
}
```

### 響應

| 字段 | 類型 | 說明 |
|------|------|------|
| `tradeData[].skuId` | String | 商品 ID |
| `tradeData[].price[].copies` | String | 份數（購買數量） |
| `tradeData[].price[].retailPrice` | String | 建議零售價 |
| `tradeData[].price[].settlementPrice` | String | 結算基準價 |

> 注意：同一商品可能有多個價格階梯（按份數不同而異）

**響應範例：**
```json
{
  "tradeCode": "1000",
  "tradeMsg": "成功",
  "tradeData": [
    {
      "skuId": "1090",
      "price": [
        { "copies": "1", "retailPrice": "5", "settlementPrice": "4" },
        { "copies": "2", "retailPrice": "9", "settlementPrice": "7" }
      ]
    }
  ]
}
```

---

## F004 獲取自提點資訊

> 渠道調用 → BillionConnect

### 入參

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F004` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData` | Object | Y | 空物件即可 |

**請求範例：**
```json
{
  "tradeType": "F004",
  "tradeTime": "2017-02-10 11:11:11",
  "tradeData": {}
}
```

### 響應

| 字段 | 類型 | 說明 |
|------|------|------|
| `tradeData[].pointId` | String | 自提點 ID |
| `tradeData[].address` | String | 地址 |
| `tradeData[].openingHours` | String | 開放時間 |
| `tradeData[].gpsInfo` | String | GPS 座標（經度,緯度） |
| `tradeData[].contactWay` | String | 聯絡方式（選填） |

**響應範例：**
```json
{
  "tradeCode": "1000",
  "tradeMsg": "成功",
  "tradeData": [
    {
      "pointId": "101",
      "address": "廣州白雲機場國際出發層 B 區",
      "openingHours": "7*24 小時",
      "gpsInfo": "121.8035020000,31.1489150000",
      "contactWay": "電話:18623123020"
    }
  ]
}
```

---

## F005 獲取物流公司資訊

> 渠道調用 → BillionConnect

### 入參

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F005` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData` | Object | Y | 空物件即可 |

**請求範例：**
```json
{
  "tradeType": "F005",
  "tradeTime": "2017-02-10 11:11:11",
  "tradeData": {}
}
```

### 響應

| 字段 | 類型 | 說明 |
|------|------|------|
| `tradeData[].code` | String | 物流公司代碼 |
| `tradeData[].name` | String | 物流公司名稱 |

**響應範例：**
```json
{
  "tradeCode": "1000",
  "tradeMsg": "成功",
  "tradeData": [
    { "code": "STO", "name": "申通快遞" },
    { "code": "YTO", "name": "圓通速遞" },
    { "code": "YUNDA", "name": "韻達快遞" }
  ]
}
```

---

## F006 創建卡訂單

> 渠道調用 → BillionConnect

### 入參

**主體：**

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F006` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData.channelOrderId` | String | Y | 渠道主訂單號 |
| `tradeData.subOrderList` | Array | Y | 子訂單集合（見下表） |
| `tradeData.express` | Object | N | 郵寄資訊（見下表） |
| `tradeData.selfPickup` | Object | N | 自提資訊 |
| `tradeData.totalAmount` | String | N | 訂單總金額 |
| `tradeData.discountAmount` | String | N | 優惠金額 |
| `tradeData.estimatedUseTime` | String | N | 預計出行時間 |
| `tradeData.orderCreateTime` | String | N | 訂單創建時間 |
| `tradeData.comment` | String | N | 備註 |
| `tradeData.invoiceType` | String | N | 發票類型：0-個人 1-公司 |
| `tradeData.invoiceHead` | String | N | 發票抬頭 |
| `tradeData.invoiceContent` | String | N | 發票內容 |
| `tradeData.invoiceComment` | String | N | 發票備註 |
| `tradeData.userId` | String | N | 提交人 |

**express 郵寄資訊：**

| 參數 | 類型 | 說明 |
|------|------|------|
| `userName` | String | 收件人姓名 |
| `userPhone` | String | 收件人電話 |
| `logisticsCompany` | String | 物流公司代碼（如 `SF`） |
| `feeMethod` | String | 運費方式 |
| `province` | String | 省 |
| `city` | String | 市 |
| `district` | String | 區 |
| `address` | String | 詳細地址 |
| `expressFee` | String | 運費金額 |

**subOrderList 子訂單：**

| 參數 | 類型 | 說明 |
|------|------|------|
| `channelSubOrderId` | String | 渠道子訂單號 |
| `deviceSkuId` | String | 設備商品 ID |
| `planSkuId` | String | 套餐商品 ID |
| `planSkuCopies` | String | 套餐份數 |
| `number` | String | 數量 |

**請求範例：**
```json
{
  "tradeType": "F006",
  "tradeTime": "2017-12-12 12:12:12",
  "tradeData": {
    "channelOrderId": "138788765467",
    "express": {
      "userName": "張三",
      "userPhone": "15801182258",
      "logisticsCompany": "SF",
      "feeMethod": "2",
      "province": "北京市",
      "city": "北京市",
      "district": "海淀區",
      "address": "上地信息產業基地創業路6號",
      "expressFee": "10"
    },
    "totalAmount": "128",
    "discountAmount": "1",
    "estimatedUseTime": "2017-12-31",
    "orderCreateTime": "2017-12-12 12:12:12",
    "comment": "請發順豐",
    "subOrderList": [
      {
        "channelSubOrderId": "2873987483292",
        "deviceSkuId": "1535444366670209",
        "planSkuId": "",
        "planSkuCopies": "1",
        "number": "1"
      }
    ]
  }
}
```

### 響應

| 字段 | 類型 | 說明 |
|------|------|------|
| `tradeData.orderId` | String | 流量平台主訂單號 |
| `tradeData.channelOrderId` | String | 渠道主訂單號 |
| `tradeData.pickupCode` | String | 提貨碼（自提時使用） |
| `tradeData.subOrderList[].subOrderId` | String | 流量平台子訂單號 |
| `tradeData.subOrderList[].channelSubOrderId` | String | 渠道子訂單號 |

**響應範例：**
```json
{
  "tradeCode": "1000",
  "tradeMsg": "成功",
  "tradeData": {
    "orderId": "13131313131",
    "channelOrderId": "138788765467",
    "pickupCode": "",
    "subOrderList": [
      { "subOrderId": "13131313132", "channelSubOrderId": "2873987483291" },
      { "subOrderId": "13131313133", "channelSubOrderId": "2873987483292" }
    ]
  }
}
```

---

## F007 創建充值訂單

> 渠道調用 → BillionConnect（適用 SIM 卡 / eSIM）

### 入參

**主體：**

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F007` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData.channelOrderId` | String | Y | 渠道主訂單號 |
| `tradeData.subOrderList` | Array | Y | 子訂單集合（見下表） |
| `tradeData.totalAmount` | String | N | 訂單總金額 |
| `tradeData.discountAmount` | String | N | 優惠金額 |
| `tradeData.estimatedUseTime` | String | N | 預計出行時間 |
| `tradeData.orderCreateTime` | String | N | 訂單創建時間 |
| `tradeData.comment` | String | N | 備註 |
| `tradeData.invoiceType` | String | N | 發票類型：0-個人 1-公司 |
| `tradeData.invoiceHead` | String | N | 發票抬頭 |
| `tradeData.invoiceContent` | String | N | 發票內容 |
| `tradeData.invoiceComment` | String | N | 發票備註 |
| `tradeData.userId` | String | N | 提交人 |

**subOrderList 子訂單：**

| 參數 | 類型 | 說明 |
|------|------|------|
| `channelSubOrderId` | String | 渠道子訂單號 |
| `iccid` | Array\<String\> | 要充值的 ICCID 列表（可多張） |
| `skuId` | String | 充值套餐商品 ID |
| `copies` | String | 份數 |

> 注意：與 F006 的差異是以 `iccid` 指定已有卡，而非購買新卡。

**請求範例：**
```json
{
  "tradeType": "F007",
  "tradeTime": "2017-12-12 12:12:12",
  "tradeData": {
    "channelOrderId": "138788765467",
    "totalAmount": "128",
    "orderCreateTime": "2017-12-12 12:12:12",
    "comment": "",
    "subOrderList": [
      {
        "channelSubOrderId": "2873987483291",
        "iccid": ["89860012017300000001", "89860012017300000002"],
        "skuId": "1273",
        "copies": "5"
      },
      {
        "channelSubOrderId": "2873987483292",
        "iccid": ["89860012017300000003"],
        "skuId": "1108",
        "copies": "1"
      }
    ]
  }
}
```

### 響應

| 字段 | 類型 | 說明 |
|------|------|------|
| `tradeData.orderId` | String | 流量平台主訂單號 |
| `tradeData.channelOrderId` | String | 渠道主訂單號 |
| `tradeData.subOrderList[].subOrderId` | String | 流量平台子訂單號 |
| `tradeData.subOrderList[].channelSubOrderId` | String | 渠道子訂單號 |

**響應範例：**
```json
{
  "tradeCode": "1000",
  "tradeMsg": "成功",
  "tradeData": {
    "orderId": "13131313131",
    "channelOrderId": "138788765467",
    "subOrderList": [
      { "subOrderId": "13131313132", "channelSubOrderId": "2873987483291" },
      { "subOrderId": "13131313133", "channelSubOrderId": "2873987483292" }
    ]
  }
}
```

---

## F008 取消訂單

> 渠道調用 → BillionConnect

### 入參

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F008` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData.orderId` | String | Y | 流量平台主訂單號 |
| `tradeData.userId` | String | N | 提交人 |

**請求範例：**
```json
{
  "tradeType": "F008",
  "tradeTime": "2017-12-12 12:12:12",
  "tradeData": {
    "orderId": "13131313131"
  }
}
```

### 響應

| 字段 | 類型 | 說明 |
|------|------|------|
| `tradeCode` | String | `1000` = 成功 |
| `tradeMsg` | String | 結果描述 |

**響應範例：**
```json
{
  "tradeCode": "1000",
  "tradeMsg": "成功"
}
```

---

## F009 修改物流資訊

> 渠道調用 → BillionConnect（僅限發貨前）

### 入參

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F009` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData.orderId` | String | Y | 流量平台主訂單號 |
| `tradeData.userName` | String | Y | 收件人姓名 |
| `tradeData.userPhone` | String | Y | 收件人電話 |
| `tradeData.logisticsCompany` | String | Y | 物流公司代碼 |
| `tradeData.province` | String | Y | 省 |
| `tradeData.city` | String | Y | 市 |
| `tradeData.district` | String | Y | 區/縣 |
| `tradeData.address` | String | Y | 詳細地址 |
| `tradeData.feeMethod` | String | N | 付費方式：1-貨到付款 2-寄方付（預設2） |
| `tradeData.expressFee` | String | N | 快遞費 |
| `tradeData.comment` | String | N | 備註 |
| `tradeData.userId` | String | N | 提交人 |

**請求範例：**
```json
{
  "tradeType": "F009",
  "tradeTime": "2017-12-12 12:12:12",
  "tradeData": {
    "orderId": "13131313131",
    "userName": "張三",
    "userPhone": "15801182258",
    "logisticsCompany": "SF",
    "province": "北京市",
    "city": "北京市",
    "district": "海淀區",
    "address": "上地信息產業基地創業路6號",
    "feeMethod": "2",
    "expressFee": "10",
    "comment": "請盡快發貨",
    "userId": "user123"
  }
}
```

### 響應

| 字段 | 類型 | 說明 |
|------|------|------|
| `tradeCode` | String | `1000` = 成功 |
| `tradeMsg` | String | 結果描述 |

**響應範例：**
```json
{
  "tradeCode": "1000",
  "tradeMsg": "成功"
}
```

---

## F010 查詢卡有效期

> 渠道調用 → BillionConnect

### 入參

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F010` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData.iccid` | Array\<String\> | Y | 要查詢的 ICCID 陣列，不可重複，範圍 1-100 筆 |

**請求範例：**
```json
{
  "tradeType": "F010",
  "tradeTime": "2017-12-12 12:12:12",
  "tradeData": {
    "iccid": ["89860012017300000001", "89860012017300000002"]
  }
}
```

### 響應

| 字段 | 類型 | 說明 |
|------|------|------|
| `tradeData[].iccid` | String | 卡片 ICCID |
| `tradeData[].type` | String | 類型：0-單次卡 1-多次卡 2-硬卡 3-MIFI銷售 4-MIFI租賃 5-eSIM |
| `tradeData[].status` | String | 狀態：0-已開卡 1-使用中 2-已用盡 3-失效 4-續期 5-報廢 |
| `tradeData[].expirationDate` | String | 有效期截止日期 |
| `tradeData[].postponedMonth` | String | 累計已延期月數（1個月=30天） |
| `tradeData[].maxDelayMonth` | String | 最大可延期月數（`-1` = 不限制） |
| `tradeData[].usageCount` | String | 設備可用次數：1-單次 2-多次 |
| `tradeData[].rechargeableProductSeriesId` | String | 復充商品系列 ID（選填） |
| `tradeData[].rechargeableProductSeriesName` | String | 復充商品系列名稱（選填） |
| `tradeData[].supportUpgradeMultiCard` | String | 是否支持升級多次卡：0-不支持 1-支持（選填） |

**響應範例：**
```json
{
  "tradeCode": "1000",
  "tradeMsg": "成功",
  "tradeData": [
    {
      "iccid": "89860012017300000001",
      "type": "0",
      "status": "1",
      "expirationDate": "2017-12-31 12:12:12",
      "postponedMonth": "0",
      "maxDelayMonth": "3",
      "usageCount": "2"
    },
    {
      "iccid": "89860012017300000002",
      "type": "1",
      "status": "1",
      "expirationDate": "2017-12-31 12:12:12",
      "postponedMonth": "0",
      "maxDelayMonth": "-1",
      "usageCount": "2"
    }
  ]
}
```

---

## F011 查詢訂單資訊

> 渠道調用 → BillionConnect

### 入參

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F011` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData.channelOrderId` | String | Y | 渠道訂單 ID |

**請求範例：**
```json
{
  "tradeType": "F011",
  "tradeTime": "2017-12-12 12:12:12",
  "tradeData": {
    "channelOrderId": "2873987483291"
  }
}
```

### 響應（依訂單類型不同）

> 訂單狀態：`0`-已下單 `1`-已發貨/已投遞 `2`-已取消

#### 卡訂單（F006）響應

| 字段 | 類型 | 說明 |
|------|------|------|
| `orderId` | String | 流量平台主訂單號 |
| `channelOrderId` | String | 渠道訂單 ID |
| `orderStatus` | String | 訂單狀態 |
| `courierNumber` | String | 物流單號（選填） |
| `createTime` | String | 創建時間 |
| `express.userName` | String | 收件人姓名 |
| `express.userPhone` | String | 收件人電話 |
| `express.logisticsCompany` | String | 物流公司 |
| `express.province/city/district/address` | String | 地址 |
| `express.expressFee` | String | 快遞費（選填） |
| `selfPickup.userName` | String | 自提收貨人姓名 |
| `selfPickup.userPhone` | String | 自提收貨人電話 |
| `selfPickup.pickupPointId` | String | 自提點 ID |
| `totalAmount` | String | 訂單總金額 |
| `discountAmount` | String | 優惠金額 |
| `estimatedUseTime` | String | 預計出行時間 |
| `comment` | String | 備註 |
| `subOrderList[].subOrderId` | String | 子訂單 ID |
| `subOrderList[].channelSubOrderId` | String | 渠道子訂單號 |
| `subOrderList[].deviceSkuId` | String | 含卡商品 ID |
| `subOrderList[].planSkuId` | String | 套餐商品 ID |
| `subOrderList[].planSkuCopies` | String | 套餐份數 |
| `subOrderList[].number` | String | 數量 |
| `subOrderList[].iccid` | Array | 卡號列表 |

**響應範例（卡訂單）：**
```json
{
  "tradeCode": "1000",
  "tradeMsg": "成功",
  "tradeData": {
    "orderId": "13131313131",
    "channelOrderId": "138788765467",
    "orderStatus": "0",
    "courierNumber": "9558213214",
    "createTime": "2017-08-04 14:20:25",
    "express": {
      "userName": "張三",
      "userPhone": "18610081008",
      "logisticsCompany": "SF",
      "province": "北京市", "city": "北京市", "district": "海淀區",
      "address": "上地信息產業基地創業路6號",
      "expressFee": "10"
    },
    "totalAmount": "128",
    "subOrderList": [
      {
        "subOrderId": "13131313132",
        "channelSubOrderId": "2873987483291",
        "deviceSkuId": "2001",
        "planSkuId": "1012",
        "planSkuCopies": "2",
        "number": "2",
        "iccid": ["89860012017300000001", "89860012017300000002"]
      }
    ]
  }
}
```

#### 充值訂單（F007）響應

| 字段 | 類型 | 說明 |
|------|------|------|
| `subOrderList[].iccid` | Array | 卡號列表 |
| `subOrderList[].skuId` | String | 套餐 SKU ID |
| `subOrderList[].copies` | String | 套餐份數 |

**響應範例（充值訂單）：**
```json
{
  "tradeCode": "1000",
  "tradeMsg": "成功",
  "tradeData": {
    "orderId": "13131313131",
    "channelOrderId": "138788765467",
    "orderStatus": "2",
    "createTime": "2017-08-04 15:20:35",
    "totalAmount": "128",
    "subOrderList": [
      {
        "subOrderId": "13131313132",
        "channelSubOrderId": "2873987483291",
        "iccid": ["89860012017300000001", "89860012017300000002"],
        "skuId": "1273",
        "copies": "5"
      }
    ]
  }
}
```

---

## F012 查詢套餐使用資訊

> 渠道調用 → BillionConnect

### 入參

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F012` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData.iccid` | String | Y | 要查詢的卡號 |
| `tradeData.channelOrderId` | String | N | 渠道主訂單號（可篩選） |
| `tradeData.language` | String | N | 語言：1-中文 2-英語（預設中文） |
| `tradeData.planStatus` | Array | N | 流量使用狀態篩選：0-未使用 1-正在使用 2-使用結束 |

**請求範例：**
```json
{
  "tradeType": "F012",
  "tradeTime": "2017-02-10 11:11:11",
  "tradeData": {
    "iccid": "1234567890123456789",
    "language": "1"
  }
}
```

### 響應

**主體：**

| 字段 | 類型 | 說明 |
|------|------|------|
| `tradeData[].orderId` | String | 流量平台主訂單號 |
| `tradeData[].channelOrderId` | String | 渠道主訂單號 |

**subOrderList 子訂單：**

| 字段 | 類型 | 說明 |
|------|------|------|
| `subOrderId` | String | 流量平台子訂單號 |
| `channelSubOrderId` | String | 渠道子訂單號 |
| `skuId` | String | 商品 ID |
| `skuName` | String | 商品名稱 |
| `copies` | String | 購買份數 |
| `planStatus` | String | 使用狀態：0-未使用 1-正在使用 2-使用結束 3-已取消 |
| `planStartTime` | String | 流量開始使用時間 |
| `planEndTime` | String | 流量使用結束時間 |
| `totalDays` | String | 流量總天數 |
| `remainingDays` | String | 流量剩餘天數 |
| `totalTraffic` | String | 流量總容量（KB） |
| `remainingTraffic` | String | 流量剩餘容量（KB） |
| `highFlowSize` | String | 高速流量大小（KB/天） |
| `limitFlowSpeed` | String | 限速後峰值（kbps） |
| `apn` | String | APN |
| `pointContactType` | String | 日切點類型：0-24小時制 1-日結制 |
| `timeZone` | String | 運營商時區 |
| `pointContactHours` | String | 日切點時間 |

**country 陣列：**

| 字段 | 類型 | 說明 |
|------|------|------|
| `mcc` | String | 國家代碼 |
| `name` | String | 國家名稱 |
| `apn` | String | APN |
| `apnUsername` | String | APN 用戶名 |
| `apnPassword` | String | APN 密碼 |
| `apnType` | String | APN 類型：0-不需手動設置 1-需手動設置 |
| `authenticationType` | String | 身份驗證類型 |

**響應範例：**
```json
{
  "tradeCode": "1000",
  "tradeMsg": "成功",
  "tradeData": [
    {
      "orderId": "13131313131",
      "channelOrderId": "138788765467",
      "subOrderList": [
        {
          "subOrderId": "13131313132",
          "channelSubOrderId": "2873987483291",
          "skuId": "1273",
          "skuName": "澳大利亞-4G-自選-300MB",
          "copies": "5",
          "planStatus": "2",
          "planStartTime": "2018-03-04 09:20:35",
          "planEndTime": "2018-03-09 09:20:35",
          "totalDays": "5",
          "remainingDays": "0",
          "highFlowSize": "307200",
          "apn": "emov",
          "country": [
            { "mcc": "AU", "name": "澳大利亞", "apn": "emov", "apnType": "0" }
          ]
        }
      ]
    }
  ]
}
```

---

## F013 卡號充值驗證

> 渠道調用 → BillionConnect

### 入參

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F013` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData.iccid` | Array\<String\> | Y | 要驗證的 ICCID 陣列，不可重複，範圍 1-100 筆 |

**請求範例：**
```json
{
  "tradeType": "F013",
  "tradeTime": "2017-02-10 11:11:11",
  "tradeData": {
    "iccid": ["1234567890123456789", "1234567890123456790"]
  }
}
```

### 響應

| 字段 | 類型 | 說明 |
|------|------|------|
| `tradeData[].iccid` | String | 卡號 |
| `tradeData[].result` | String | 驗證結果：`成功` / `失敗` |

**響應範例：**
```json
{
  "tradeCode": "1000",
  "tradeMsg": "成功",
  "tradeData": [
    { "iccid": "89860012017300000001", "result": "成功" },
    { "iccid": "89860012017300000002", "result": "失敗" }
  ]
}
```

---

## F014 預存款查詢

> 渠道調用 → BillionConnect

### 入參

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F014` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData` | Object | Y | 空物件即可 |

**請求範例：**
```json
{
  "tradeType": "F014",
  "tradeTime": "2017-12-12 12:12:12",
  "tradeData": {}
}
```

### 響應

| 字段 | 類型 | 說明 |
|------|------|------|
| `tradeData.accountBalance` | String | 帳戶餘額 |
| `tradeData.currency` | String | 幣別（如 `USD`） |
| `tradeData.availableBalance` | String | 可用餘額 |
| `tradeData.frozenBalance` | String | 凍結金額 |
| `tradeData.creditLimit` | String | 信用額度 |

> 注意：文件定義欄位為 `saleBalance`，但實際響應範例包含更完整的欄位，以範例為準。

**響應範例：**
```json
{
  "tradeCode": "1000",
  "tradeMsg": "成功",
  "tradeData": {
    "accountBalance": "10000.00",
    "currency": "USD",
    "availableBalance": "8500.00",
    "frozenBalance": "1500.00",
    "creditLimit": "50000.00"
  }
}
```

---

## F015 查詢加速包商品

> 渠道調用 → BillionConnect

### 入參

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F015` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData[].orderId` | String | Y | 流量平台主訂單號 |
| `tradeData[].iccid` | String | Y | 卡號 |
| `tradeData[].dayType` | String | Y | 套餐類型：0-單日加速 1-套餐升級 2-總量升級 |
| `tradeData[].language` | String | N | 語言：1-中文 2-英語（預設中文） |

> 注意：`tradeData` 為**陣列**格式（可批量查詢多張卡）

**請求範例：**
```json
{
  "tradeType": "F015",
  "tradeTime": "2017-12-12 12:12:12",
  "tradeData": [
    {
      "orderId": "13131313131",
      "iccid": "89860012017300000001",
      "dayType": "0",
      "language": "1"
    }
  ]
}
```

### 響應

**主體：**

| 字段 | 類型 | 說明 |
|------|------|------|
| `tradeData[].orderId` | String | 流量平台主訂單號 |
| `tradeData[].iccid` | String | 卡號 |
| `tradeData[].skuId` | String | 當前使用中的商品 ID |
| `tradeData[].accelerationSku` | Array\<String\> | 可用加速包 SKU ID 列表 |
| `tradeData[].pointContactType` | String | 日切類型：1-24小時 2-自然日 |
| `tradeData[].serviceZone` | String | 運營商服務時區 |
| `tradeData[].pointOfContact` | String | 日切點時間 |

**accelerationSkuList 加速包商品：**

| 字段 | 類型 | 說明 |
|------|------|------|
| `skuId` | String | 商品 ID |
| `name` | String | 商品名稱 |
| `settlementPrice` | String | 結算價 |
| `days` | String | 天數 |
| `planType` | String | 套餐類型：0-總量型 1-單日型 |
| `capacity` | String | 流量包大小（KB） |
| `highFlowSize` | String | 高速流量大小（KB/天） |
| `limitFlowSpeed` | String | 限速後峰值（kbps） |
| `hotspotSupport` | String | 熱點：0-不支持 1-支持 |
| `desc` | String | 商品描述 |
| `pointContactType` | String | 日切類型 |
| `serviceZone` | String | 運營商服務時區 |
| `pointOfContact` | String | 日切點 |
| `country[].mcc` | String | 國家代碼 |
| `country[].name` | String | 國家名稱 |
| `country[].apn` | String | APN |
| `country[].apnType` | String | APN 設定類型：0-不需要 1-需要 |
| `country[].operatorInfo[].operator` | String | 網絡運營商 |
| `country[].operatorInfo[].network` | String | 網絡制式 |
| `country[].operatorInfo[].priority` | String | 優先級 |

**響應範例：**
```json
{
  "tradeCode": "1000",
  "tradeMsg": "成功",
  "tradeData": [
    {
      "orderId": "13131313131",
      "iccid": "89860012017300000001",
      "skuId": "1273",
      "accelerationSku": ["1274"],
      "accelerationSkuList": [
        {
          "skuId": "1274",
          "settlementPrice": "11",
          "name": "香港-4G-1天-200M",
          "pointContactType": "1",
          "serviceZone": "UTC+8",
          "pointOfContact": "2022-12-02 00:00:00",
          "days": "1",
          "highFlowSize": "20000",
          "limitFlowSpeed": "128",
          "hotspotSupport": "1",
          "country": [
            { "mcc": "HK", "name": "香港" }
          ]
        }
      ]
    }
  ]
}
```

---

## F016 創建加速包訂單

> 渠道調用 → BillionConnect

### 入參

**主體：**

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F016` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData.originalOrderId` | String | Y | 流量平台原主訂單號 |
| `tradeData.originalSaleGoodsId` | String | Y | 原商品 ID |
| `tradeData.channelOrderId` | String | Y | 渠道主訂單號 |
| `tradeData.dayType` | String | Y | 套餐類型：0-單日加速 1-套餐升級 2-總量加速 |
| `tradeData.subOrderList` | Array | Y | 子訂單集合（見下表） |
| `tradeData.totalAmount` | String | N | 訂單總金額 |
| `tradeData.discountAmount` | String | N | 優惠金額 |
| `tradeData.estimatedUseTime` | String | N | 預計出行時間 |
| `tradeData.comment` | String | N | 備註 |

**subOrderList 子訂單：**

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `channelSubOrderId` | String | Y | 渠道子訂單號 |
| `iccid` | String | Y | 充值卡號 |
| `skuId` | String | Y | 加速包商品 ID |
| `copies` | String | Y | 份數 |
| `settlementPrice` | String | Y | 結算價 |

**請求範例：**
```json
{
  "tradeType": "F016",
  "tradeTime": "2017-12-12 12:12:12",
  "tradeData": {
    "originalOrderId": "13131313131",
    "originalSaleGoodsId": "4334313123",
    "channelOrderId": "138788765467",
    "totalAmount": "128",
    "discountAmount": "0",
    "dayType": "0",
    "subOrderList": [
      {
        "channelSubOrderId": "2873987483291",
        "iccid": "89860012017300000001",
        "skuId": "1273",
        "copies": "5",
        "settlementPrice": "25.6"
      }
    ]
  }
}
```

### 響應

| 字段 | 類型 | 說明 |
|------|------|------|
| `tradeData.orderId` | String | 流量平台主訂單號 |
| `tradeData.channelOrderId` | String | 渠道主訂單號 |
| `tradeData.subOrderList[].subOrderId` | String | 流量平台子訂單號 |
| `tradeData.subOrderList[].channelSubOrderId` | String | 渠道子訂單號 |
| `tradeData.subOrderList[].isActivated` | String | 是否激活：0-未激活 1-已激活 |
| `tradeData.subOrderList[].startTime` | String | 開始使用時間 |
| `tradeData.subOrderList[].countryRegion` | String | 國家地區（選填） |
| `tradeData.subOrderList[].apn` | String | APN（選填） |
| `tradeData.subOrderList[].apnUsername` | String | APN 用戶名（選填） |
| `tradeData.subOrderList[].apnPassword` | String | APN 密碼（選填） |

**響應範例：**
```json
{
  "tradeCode": "1000",
  "tradeMsg": "成功",
  "tradeData": {
    "orderId": "13131313131",
    "channelOrderId": "138788765467",
    "subOrderList": [
      {
        "subOrderId": "13131313132",
        "channelSubOrderId": "2873987483291",
        "isActivated": "1",
        "startTime": "2018-08-07 12:12:12",
        "countryRegion": "HK",
        "apn": "emov",
        "apnUsername": "",
        "apnPassword": ""
      }
    ]
  }
}
```

---

## F017 售後申請

> 渠道調用 → BillionConnect

### 入參

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F017` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData.channelOrderId` | String | Y | 渠道主訂單號 |
| `tradeData.channelSubOrderId` | String | Y | 渠道子訂單號 |
| `tradeData.reason` | String | Y | 售後原因代碼（填售後 number） |
| `tradeData.iccid` | Array\<String\> | Y | 問題卡號列表 |
| `tradeData.refundType` | String | Y | 退款方式：0-自動退款 1-協定退款 |
| `tradeData.unSubscribeFlow` | String | N | 是否退訂流量：0-不退 1-退 |
| `tradeData.receivingState` | String | N | 收貨狀態：0-未收貨 1-已收貨 |
| `tradeData.returnCardOrNot` | String | N | 是否退卡（含卡訂單已收貨時）：0-無需退卡 1-需退卡 |
| `tradeData.logisticsNoPerson` | String | N | 運單填寫人：0-客戶 1-庫管 |
| `tradeData.logisticsId` | String | N | 物流單號 |
| `tradeData.refundAmount` | String | N | 退款金額 |
| `tradeData.comment` | String | N | 備註 |

**請求範例：**
```json
{
  "tradeType": "F017",
  "tradeTime": "2017-12-12 12:12:12",
  "tradeData": {
    "channelOrderId": "2873987483291",
    "channelSubOrderId": "3073987483291",
    "reason": "20",
    "iccid": ["123", "456"],
    "unSubscribeFlow": "0",
    "receivingState": "1",
    "returnCardOrNot": "1",
    "logisticsNoPerson": "1",
    "logisticsId": "1111111111111",
    "refundType": "1",
    "refundAmount": "48.00",
    "comment": ""
  }
}
```

### 響應

| 字段 | 類型 | 說明 |
|------|------|------|
| `tradeData.afterSaleId` | String | 售後單號 |

**響應範例：**
```json
{
  "tradeCode": "1000",
  "tradeMsg": "成功",
  "tradeData": {
    "afterSaleId": "1517370598118598"
  }
}
```

---

## F018 取消售後申請

> 渠道調用 → BillionConnect（僅限未審核的售後單）

### 入參

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F018` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData.afterSaleId` | String | Y | 售後單號 |

**請求範例：**
```json
{
  "tradeType": "F018",
  "tradeTime": "2017-12-12 12:12:12",
  "tradeData": { "afterSaleId": "1517370598118598" }
}
```

**響應範例：**
```json
{ "tradeCode": "1000", "tradeMsg": "成功" }
```

---

## F019 修改售後申請

> 渠道調用 → BillionConnect（僅限未審核的售後單）

### 入參

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F019` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData.afterSaleId` | String | Y | 售後單號 |
| `tradeData.refundType` | String | Y | 退款方式：0-自動退款 1-協定退款 |
| `tradeData.unSubscribeFlow` | String | N | 是否退訂流量：0-不退 1-退 |
| `tradeData.receivingState` | String | N | 收貨狀態：0-未收貨 1-已收貨 |
| `tradeData.returnCardOrNot` | String | N | 是否退卡：0-無需退卡 1-需退卡 |
| `tradeData.logisticsNoPerson` | String | N | 運單填寫人：0-客戶 1-庫管 |
| `tradeData.logisticsId` | String | N | 物流單號 |
| `tradeData.refundAmount` | String | N | 退款金額 |
| `tradeData.comment` | String | N | 備註 |

**請求範例：**
```json
{
  "tradeType": "F019",
  "tradeTime": "2017-12-12 12:12:12",
  "tradeData": {
    "afterSaleId": "2873987483291",
    "unSubscribeFlow": "1",
    "receivingState": "1",
    "returnCardOrNot": "1",
    "logisticsNoPerson": "1",
    "logisticsId": "1111111111111",
    "refundType": "1",
    "refundAmount": "48.00"
  }
}
```

**響應範例：**
```json
{ "tradeCode": "1000", "tradeMsg": "成功" }
```

---

## F020 查詢售後資訊

> 渠道調用 → BillionConnect

### 入參

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F020` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData.afterSaleId` | String | Y | 售後單號 |

**請求範例：**
```json
{
  "tradeType": "F020",
  "tradeTime": "2017-12-12 12:12:12",
  "tradeData": { "afterSaleId": "1517370598118598" }
}
```

### 響應

| 字段 | 類型 | 說明 |
|------|------|------|
| `channelOrderId` | String | 渠道主訂單號 |
| `channelSubOrderId` | String | 渠道子訂單號 |
| `afterSaleId` | String | 售後單號 |
| `iccid` | Array | 問題卡號 |
| `reason` | String | 售後原因代碼 |
| `refundType` | String | 退款方式：0-自動 1-協定 |
| `refundAmount` | String | 退款金額 |
| `unSubscribeFlow` | String | 是否退訂流量 |
| `returnDays` | String | 退訂天數 |
| `receivingState` | String | 收貨狀態 |
| `returnCard` | String | 是否退卡 |
| `logisticsNoPerson` | String | 運單填寫人 |
| `logisticsId` | String | 物流單號 |
| `auditStatus` | String | 審核狀態：0-未審核 1-已撤回 2-審核通過 3-已駁回 4-待修改 |
| `auditOpinion` | String | 審核意見 |
| `refundStatus` | String | 退款狀態：0-待退款 1-已退款 2-已駁回 |
| `refundOpinion` | String | 退款意見 |

**響應範例：**
```json
{
  "tradeCode": "1000",
  "tradeMsg": "成功",
  "tradeData": {
    "channelOrderId": "1517370598118598",
    "afterSaleId": "1517370598118598",
    "iccid": ["89860012011111111111"],
    "reason": "14",
    "refundType": "1",
    "refundAmount": "123.00",
    "auditStatus": "1",
    "auditOpinion": "審核意見內容",
    "refundStatus": "1",
    "refundOpinion": "退款意見內容"
  }
}
```

---

## F023 日流量查詢

> 渠道調用 → BillionConnect

### 入參

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F023` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData.iccid` | String | Y | 卡號 |
| `tradeData.beginDate` | String | Y | 開始日期（`yyyy-MM-dd`） |
| `tradeData.endDate` | String | Y | 結束日期（`yyyy-MM-dd`） |
| `tradeData.tzType` | String | N | 時區：0-運營商時區 1-東八區（預設1） |
| `tradeData.language` | String | N | 語言：1-中文 2-英語（預設中文） |

**請求範例：**
```json
{
  "tradeType": "F023",
  "tradeTime": "2018-09-10 12:12:12",
  "tradeData": {
    "iccid": "89860012017300000001",
    "beginDate": "2018-10-01",
    "endDate": "2018-10-01",
    "tzType": "1",
    "language": "1"
  }
}
```

### 響應

| 字段 | 類型 | 說明 |
|------|------|------|
| `tradeData[].usedDate` | String | 使用日期（`yyyyMMdd`） |
| `tradeData[].type` | String | 業務類型：0-Data 1-SMS 2-USSD 3-LU |
| `tradeData[].usedAmount` | String | 使用量（type=0 時單位 KB，其他單位條） |
| `tradeData[].country` | String | 國家名稱 |
| `tradeData[].countryRegionCode` | String | 國家代碼 |

**響應範例：**
```json
{
  "tradeCode": "1000",
  "tradeMsg": "成功",
  "tradeData": [
    {
      "usedDate": "20181001",
      "type": "0",
      "usedAmount": "250770",
      "country": "香港（中華人民共和國）",
      "countryRegionCode": "HK"
    }
  ]
}
```

---

## F040 創建 eSIM 訂單

> 渠道調用 → BillionConnect

### 入參

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F040` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData.channelOrderId` | String | Y | 渠道主訂單號 |
| `tradeData.subOrderList` | Array | Y | 子訂單集合（見下表） |
| `tradeData.email` | String | N | 接收 eSIM 二維碼的 Email |
| `tradeData.totalAmount` | String | N | 訂單總金額 |
| `tradeData.discountAmount` | String | N | 優惠金額 |
| `tradeData.estimatedUseTime` | String | N | 預計出行時間 |
| `tradeData.orderCreateTime` | String | N | 訂單創建時間 |
| `tradeData.comment` | String | N | 備註 |
| `tradeData.eid` | String | N | EID |
| `tradeData.imei` | String | N | IMEI 2 |
| `tradeData.invoiceType` | String | N | 發票類型：0-個人 1-公司 |

**subOrderList 子訂單：**

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `channelSubOrderId` | String | Y | 渠道子訂單號 |
| `deviceSkuId` | String | Y | eSIM 商品 ID |
| `planSkuCopies` | String | Y | 套餐份數 |
| `number` | String | Y | 購買數量（1-500） |
| `deviceSkuPrice` | String | N | 含卡商品價格 |
| `discountAmount` | String | N | 優惠金額 |
| `rechargeableESIM` | String | N | 復充 eSIM：0-否 1-是 |

**請求範例：**
```json
{
  "tradeType": "F040",
  "tradeTime": "2020-02-25 15:02:21",
  "tradeData": {
    "channelOrderId": "138788765467",
    "email": "abc@qq.com",
    "totalAmount": "128",
    "subOrderList": [
      {
        "channelSubOrderId": "2873987483292",
        "deviceSkuId": "1535444366670209",
        "planSkuCopies": "1",
        "number": "1"
      }
    ]
  }
}
```

### 響應

| 字段 | 類型 | 說明 |
|------|------|------|
| `tradeData.orderId` | String | 流量平台主訂單號 |
| `tradeData.channelOrderId` | String | 渠道主訂單號 |
| `tradeData.subOrderList[].subOrderId` | String | 流量平台子訂單號 |
| `tradeData.subOrderList[].channelSubOrderId` | String | 渠道子訂單號 |

---

## F041 重新發送 eSIM 郵件

> 渠道調用 → BillionConnect

### 入參

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F041` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData.orderId` | String | Y | 流量平台主訂單號 |
| `tradeData.email` | String | Y | 接收郵件的 Email |

**請求範例：**
```json
{
  "tradeType": "F041",
  "tradeTime": "2020-02-25 16:05:29",
  "tradeData": { "orderId": "15801188888", "email": "abc@qq.com" }
}
```

**響應範例：**
```json
{ "tradeCode": "1000", "tradeMsg": "成功" }
```

---

## F042 查詢 eSIM 服務狀態

> 渠道調用 → BillionConnect

### 入參

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F042` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData.iccid` | String | Y | 要查詢的卡號 |

### 響應（狀態歷程陣列）

| 字段 | 類型 | 說明 |
|------|------|------|
| `status` | String | 0-未下載 1-已下載 2-已安裝 3-已啟用 4-已禁用 5-已回收 |
| `iccid` | String | ICCID |
| `orderId` | String | 流量平台主訂單號 |
| `recordTime` | String | 狀態記錄時間 |
| `eid` | String | EID（已安裝後才有值） |

> 響應為**狀態歷程陣列**，依時間倒序排列，最新狀態在第一筆。

**響應範例：**
```json
{
  "tradeCode": "1000",
  "tradeMsg": "成功",
  "tradeData": [
    { "status": "5", "iccid": "89860012016820003006", "recordTime": "2022-11-24 10:32:47", "orderId": "3669195566166268", "eid": "89086030202200000020000002270960" },
    { "status": "3", "iccid": "89860012016820003006", "recordTime": "2022-11-23 17:28:45", "orderId": "3669195566166268", "eid": "89086030202200000020000002270960" },
    { "status": "0", "iccid": "89860012016820003006", "recordTime": "2022-11-23 17:26:31", "orderId": "3669195566166268", "eid": "" }
  ]
}
```

---

## F045 結束已激活套餐

> 渠道調用 → BillionConnect

### 入參

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F045` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData.orderId` | String | Y | 流量平台主訂單號 |
| `tradeData.subOrderId` | String | Y | 流量平台子訂單號 |
| `tradeData.iccid` | String | Y | 卡號 |

**請求範例：**
```json
{
  "tradeType": "F045",
  "tradeTime": "2023-05-05 09:47:39",
  "tradeData": {
    "orderId": "2683536856139402",
    "subOrderId": "1683536856470403",
    "iccid": "89860012018390075038"
  }
}
```

**響應範例：**
```json
{ "tradeCode": "1000", "tradeMsg": "成功" }
```

---

## F046 查詢套餐使用資訊（v2）

> 渠道調用 → BillionConnect（與 F012 類似，新增每日明細 `usageInfoList`）

### 入參

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F046` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData.iccid` | String | Y | 卡號 |
| `tradeData.orderId` | String | N* | 流量平台主訂單號（與 channelOrderId 至少傳一個） |
| `tradeData.channelOrderId` | String | N* | 渠道主訂單號（與 orderId 至少傳一個） |
| `tradeData.language` | String | N | 語言：1-中文 2-英語（預設中文） |

### 響應

**subOrderList 子訂單：**

| 字段 | 類型 | 說明 |
|------|------|------|
| `skuId` / `skuName` | String | 商品 ID / 名稱 |
| `copies` | String | 購買份數 |
| `planStatus` | String | 0-未使用 1-正在使用 2-使用結束 3-已取消 |
| `planStartTime` / `planEndTime` | String | 套餐使用起訖時間 |
| `totalDays` | String | 總天數 |
| `totalTraffic` | String | 總容量（KB），`-1` 表示不限量 |
| `highFlowSize` | String | 高速流量（KB/天或KB） |
| `planType` | String | 0-總量型 1-單日型 |
| `usageInfoList[].useDate` | String | 使用日期（`yyyyMMdd`） |
| `usageInfoList[].useageAmt` | String | 當日已用量（KB） |
| `country[]` | Array | 國家/APN 資訊（同 F012） |

**響應範例：**
```json
{
  "tradeCode": "1000",
  "tradeMsg": "成功",
  "tradeData": {
    "orderId": "2684910712887645",
    "channelOrderId": "71186072946800",
    "subOrderList": [
      {
        "skuId": "1683599122978282",
        "skuName": "日本-4G-300MB/天+通用載體",
        "copies": "2",
        "planStatus": "2",
        "planStartTime": "2023-05-24 14:59:36",
        "planEndTime": "2023-05-26 14:59:37",
        "totalDays": "2",
        "totalTraffic": "-1",
        "highFlowSize": "307200",
        "planType": "1",
        "country": [
          { "mcc": "JP", "name": "日本", "apn": "3gnet", "apnType": "1" }
        ],
        "usageInfoList": [
          { "useDate": "20230524", "useageAmt": "10240" },
          { "useDate": "20230525", "useageAmt": "20480" },
          { "useDate": "20230526", "useageAmt": "30760" }
        ]
      }
    ]
  }
}
```

---

## F052 查詢 eSIM 充值商品

> 渠道調用 → BillionConnect

### 入參

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F052` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData.iccid` | String | Y | 要查詢的 eSIM 卡號 |

**請求範例：**
```json
{
  "tradeType": "F052",
  "tradeTime": "2024-08-14 15:33:24",
  "tradeData": { "iccid": "89812003916820397415" }
}
```

### 響應

| 字段 | 類型 | 說明 |
|------|------|------|
| `tradeData.skuId` | Array\<String\> | 可充值的商品 ID 列表 |

> 取得商品 ID 後，可搭配 F002 查詢商品詳細資訊，搭配 F007 建立充值訂單。

**響應範例：**
```json
{
  "tradeCode": "1000",
  "tradeMsg": "成功",
  "tradeData": {
    "skuId": ["132342909036", "132346328450"]
  }
}
```

---

## F051 透過商品 ID 獲取自提點資訊

> 渠道調用 → BillionConnect（F004 的商品篩選版）

### 入參

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F051` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData.skuIds` | Array\<String\> | Y | 商品 ID 列表 |

**請求範例：**
```json
{
  "tradeType": "F051",
  "tradeTime": "2024-02-08 16:17:30",
  "tradeData": { "skuIds": ["132342909036", "132346328450"] }
}
```

### 響應

| 字段 | 類型 | 說明 |
|------|------|------|
| `tradeData[].pointId` | String | 自提點 ID |
| `tradeData[].address` | String | 地址 |
| `tradeData[].openingHours` | String | 開放時間 |
| `tradeData[].gpsInfo` | String | GPS 座標（經度,緯度） |
| `tradeData[].contactWay` | String | 聯絡方式 |
| `tradeData[].price` | BigDecimal | 自提點費用 |

---

## F054 查詢實名認證狀態

> 渠道調用 → BillionConnect

### 入參

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F054` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData.iccid` | String | Y | 要查詢的卡號 |

**請求範例：**
```json
{
  "tradeType": "F054",
  "tradeTime": "2024-11-11 12:01:54",
  "tradeData": { "iccid": "89812003916820397415" }
}
```

### 響應

| 字段 | 類型 | 說明 |
|------|------|------|
| `tradeData.status` | Integer | 1-待認證 2-認證中 3-認證通過 4-認證失敗 5-證件已過期 |
| `tradeData.expiryTime` | String | 認證過期時間（選填） |

**響應範例：**
```json
{
  "tradeCode": "1000",
  "tradeMsg": "成功",
  "tradeData": { "status": 1 }
}
```

---

## F056 查詢所有加速包商品

> 渠道調用 → BillionConnect（F015 的全量版，不需指定訂單/ICCID）

### 入參

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `tradeType` | String | Y | `F056` |
| `tradeTime` | String | Y | 時間戳 `YYYY-MM-DD hh:mi:ss` |
| `tradeData.skuId` | String | N | 商品 ID（精確查詢） |
| `tradeData.networkOperatorScope` | String | N | 運營商範圍：1-1級 2-所有（預設1級） |
| `tradeData.language` | String | N | 語言：1-中文 2-英語（預設中文） |
| `tradeData.countryCode` | String | N | 國家代碼 |

### 響應（tradeData 陣列）

| 字段 | 類型 | 說明 |
|------|------|------|
| `skuId` | String | 商品 ID |
| `name` | String | 商品名稱 |
| `days` | String | 天數 |
| `capacity` | String | 流量包大小（KB） |
| `highFlowSize` | String | 高速流量（KB/天） |
| `limitFlowSpeed` | String | 限速後峰值（kbps） |
| `hotspotSupport` | String | 熱點：0-不支持 1-支持 |
| `planType` | String | 0-總量型 1-單日型 |
| `accelerationSupport` | String | 加速支持：0-不支持 1-SIM 2-eSIM 3-全部 |
| `pointContactType` | String | 日切點類型：0-24小時 1-日結 |
| `timeZone` | String | 運營商時區 |
| `acceleratePrice` | String | 加速價格 |
| `country[].mcc` | String | 國家代碼 |
| `country[].apn` | String | APN |
| `country[].operatorInfo[].operator` | String | 運營商 |
| `country[].operatorInfo[].network` | String | 網絡制式 |

**響應範例：**
```json
{
  "tradeCode": "1000",
  "tradeMsg": "成功",
  "tradeData": [
    {
      "skuId": "1274",
      "name": "香港-4G-1天-200M",
      "days": "1",
      "highFlowSize": "20000",
      "limitFlowSpeed": "128",
      "pointContactType": "1",
      "serviceZone": "UTC+8",
      "country": [{ "mcc": "HK", "name": "香港" }]
    }
  ]
}
```

---

## N001 訂單發貨通知

> BillionConnect → 渠道（Webhook）

| 字段 | 類型 | 說明 |
|------|------|------|
| `orderId` | String | 流量平台主訂單號 |
| `channelOrderId` | String | 渠道主訂單號 |
| `courierNumber` | String | 物流單號 |
| `logisticsCompany` | String | 物流公司 |
| `pickupCode` | String | 取貨碼（自提） |
| `pointIdList` | Array | 自提點陣列 |
| `pickupPdfUrl` | String | 自提 PDF 地址 |
| `subOrderList[].subOrderId` | String | 子訂單號 |
| `subOrderList[].iccid` | Array | 卡號陣列 |

---

## N002 流量開始使用通知

> BillionConnect → 渠道（Webhook）
> `tradeData` 為**陣列**，可同時通知多張卡

| 字段 | 類型 | 說明 |
|------|------|------|
| `subOrderId` | String | 子訂單號 |
| `channelSubOrderId` | String | 渠道子訂單號 |
| `iccid` | String | 卡號 |
| `startTime` | String | 開始使用時間 |
| `endTime` | String | 預計結束時間 |
| `countryRegion` | String | 國家地區代碼 |
| `apn` / `apnUsername` / `apnPassword` | String | APN 資訊 |

---

## N003 流量使用結束通知

> BillionConnect → 渠道（Webhook）
> `tradeData` 為**陣列**

| 字段 | 類型 | 說明 |
|------|------|------|
| `subOrderId` | String | 子訂單號 |
| `channelOrderId` | String | 渠道子訂單號（注意：文件欄位名為 channelOrderId） |
| `iccid` | String | 卡號 |
| `endTime` | String | 使用結束時間 |

---

## N004 售後審核通知

> BillionConnect → 渠道（Webhook）

| 字段 | 類型 | 說明 |
|------|------|------|
| `afterSaleId` | String | 售後單號 |
| `auditStatus` | String | 審核結果：1-成功 2-失敗 |
| `auditOpinion` | String | 審核意見（選填） |

---

## N005 退款通知

> BillionConnect → 渠道（Webhook）

| 字段 | 類型 | 說明 |
|------|------|------|
| `afterSaleId` | String | 售後單號 |
| `refundState` | String | 退款狀態：1-成功 2-失敗 |
| `refundOpinion` | String | 退款意見（選填） |

---

## N006 商品資訊修改通知

> BillionConnect → 渠道（Webhook）
> `tradeData` 為**陣列**，結構與 F002 響應相同

| 字段 | 類型 | 說明 |
|------|------|------|
| `skuId` | String | 商品 ID |
| `name` | String | 商品名稱 |
| `type` | String | 商品類型（同 F002） |
| `days` / `capacity` / `highFlowSize` | String | 套餐規格 |
| `country[]` / `operatorInfo[]` | Array | 國家與運營商資訊 |
| `desc` | String | 商品描述 |

> 收到此通知後，建議更新本地商品快取。

---

## N009 eSIM 二維碼通知

> BillionConnect → 渠道（Webhook）
> **最重要的通知接口**，用於向用戶展示 eSIM 安裝資訊

| 字段 | 類型 | 說明 |
|------|------|------|
| `orderId` / `channelOrderId` | String | 訂單號 |
| `subOrderList[].iccid` | String | ICCID |
| `subOrderList[].uid` | String | UID |
| `subOrderList[].qrCodeContent` | String | eSIM 二維碼內容（`LPA:1$...`格式） |
| `subOrderList[].confirmationCode` | String | 確認碼 |
| `subOrderList[].apn` | String | APN |
| `subOrderList[].pin` / `puk` | String | PIN / PUK 碼 |
| `subOrderList[].msisdn` | String | 電話號碼 |
| `subOrderList[].validTime` | String | 二維碼有效期 |
| `subOrderList[].rechargeableESIM` | String | 是否為復充 eSIM：0-否 1-是 |

**請求範例：**
```json
{
  "tradeType": "N009",
  "tradeData": {
    "orderId": "13131313131",
    "channelOrderId": "13131",
    "subOrderList": [{
      "iccid": "89860012018500000085",
      "qrCodeContent": "LPA:1$SECSMSMINIAPP.EASTCOMPEACE.COM$2C13942911FF452AB45E9E99A5D444A1",
      "apn": "emov",
      "pin": "1234",
      "puk": "55026381",
      "validTime": "2023-09-23 17:58:07",
      "rechargeableESIM": "0"
    }]
  }
}
```

---

## N010 eSIM 郵件發送通知

> BillionConnect → 渠道（Webhook）

| 字段 | 類型 | 說明 |
|------|------|------|
| `orderId` | String | 流量平台主訂單號 |
| `channelOrderId` | String | 渠道主訂單號 |

> 通知渠道 eSIM 二維碼郵件已成功寄出，可更新訂單狀態為「郵件已發送」。

---

## N012 eSIM 狀態變更通知

> BillionConnect → 渠道（Webhook）

| 字段 | 類型 | 說明 |
|------|------|------|
| `orderId` / `channelOrderId` | String | 訂單號 |
| `subOrderList[].iccid` | String | ICCID |
| `subOrderList[].uid` | String | UID |
| `subOrderList[].profileStatus` | Integer | Profile 狀態（參考 F042 status 定義） |

---

## N013 充值訂單結果通知

> BillionConnect → 渠道（Webhook）

| 字段 | 類型 | 說明 |
|------|------|------|
| `orderId` | String | 流量平台主訂單號 |
| `channelOrderId` | String | 渠道主訂單號 |
| `status` | String | 充值結果：0-成功 1-失敗 |

---

## TypeScript 實作參考

```typescript
// 簽名生成
import crypto from 'crypto'

function generateSign(appSecret: string, body: object): string {
  const plaintext = appSecret + JSON.stringify(body)
  return crypto.createHash('md5').update(plaintext).digest('hex')
}

// API 呼叫
async function callBillionConnect(
  appKey: string,
  appSecret: string,
  tradeType: string,
  tradeData: object
) {
  const body = {
    tradeType,
    tradeTime: new Date().toISOString().replace('T', ' ').substring(0, 19),
    tradeData,
  }

  const sign = generateSign(appSecret, body)

  const res = await fetch(process.env.BILLIONCONNECT_URL!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=UTF-8',
      'x-channel-id': appKey,
      'x-sign-method': 'md5',
      'x-sign-value': sign,
    },
    body: JSON.stringify(body),
  })

  return res.json()
}
```
