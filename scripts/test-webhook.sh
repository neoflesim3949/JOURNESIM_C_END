#!/bin/bash
# 測試 BC webhook 接收（本地）
# 用法: ./scripts/test-webhook.sh [N001|N009|N013]

SECRET="e9b478fb58694d46831352fe191b0344"
URL="${2:-http://localhost:3000}/api/webhooks/billionconnect"
TYPE="${1:-N001}"

# 根據類型產生測試 payload
case $TYPE in
  N001)
    BODY='{
      "tradeType": "N001",
      "tradeTime": "2026-04-14 12:00:00",
      "tradeData": {
        "orderId": "TEST_ORDER_001",
        "channelOrderId": "FL260414TEST1S",
        "subOrderList": [{
          "subOrderId": "TEST_SUB_001",
          "channelSubOrderId": "FL260414TEST1S1",
          "trackingNumber": "TEST_TRACKING_001",
          "shippingStatus": "shipped"
        }]
      }
    }'
    echo "📦 測試 N001 SIM出貨通知"
    ;;
  N009)
    BODY='{
      "tradeType": "N009",
      "tradeTime": "2026-04-14 12:00:00",
      "tradeData": {
        "orderId": "TEST_ORDER_001",
        "channelOrderId": "FL260414TEST1E",
        "subOrderList": [{
          "subOrderId": "TEST_SUB_001",
          "channelSubOrderId": "FL260414TEST1E1",
          "iccid": "89860000000000000001",
          "qrCode": "LPA:1$test.example.com$TEST_CODE",
          "lpaCode": "TEST_LPA_CODE"
        }]
      }
    }'
    echo "📱 測試 N009 eSIM QR碼通知"
    ;;
  N013)
    BODY='{
      "tradeType": "N013",
      "tradeTime": "2026-04-14 12:00:00",
      "tradeData": {
        "orderId": "TEST_ORDER_001",
        "channelOrderId": "FL260414TEST1S",
        "subOrderList": [{
          "subOrderId": "TEST_SUB_001",
          "channelSubOrderId": "FL260414TEST1S1",
          "rechargeStatus": "1"
        }]
      }
    }'
    echo "🔋 測試 N013 充值結果通知"
    ;;
  *)
    echo "用法: $0 [N001|N009|N013] [URL]"
    exit 1
    ;;
esac

# 計算簽名: MD5(SECRET + BODY)
SIGN=$(echo -n "${SECRET}${BODY}" | md5)

echo "URL: $URL"
echo "Sign: $SIGN"
echo "---"

# 發送請求
curl -s -X POST "$URL" \
  -H "Content-Type: application/json;charset=UTF-8" \
  -H "x-sign-value: $SIGN" \
  -d "$BODY" | python3 -m json.tool 2>/dev/null || echo "(raw response above)"

echo ""
echo "✅ 完成，檢查 server log 和 bc_api_logs 表"
