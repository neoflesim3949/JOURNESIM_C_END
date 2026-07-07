// 用系統 Chrome 自動登入 systest 並截「真實頁面」
// 執行：node scripts/shoot.mjs
import { chromium } from 'playwright-core'
import fs from 'fs'

const BASE = 'http://localhost:3000'
const EMAIL = 'systest@flesim.com'
const PW = 'test123'
const ORDER_ID = '330a94b9-fc92-4be3-b890-5abf08ab38e5'      // eSIM（虛擬）
const SIM_ORDER_ID = '34cecc8d-2b3f-437f-a836-4fd5384e02af'  // 實體 SIM
const DIR = 'docs/payment-review/shots'
fs.mkdirSync(DIR, { recursive: true })

// 注入購物車（真實購物車頁/結帳頁需有商品）：eSIM + 實體 SIM 各一
const CART = [
  { id: 'cn_esim_1', packageId: 'p-cn', packageName: '中國eSIM（多網）', planId: 'pl-cn', bcSkuId: 'CN-ESIM-1GB', bcSkuName: '中國 eSIM 多網 1GB/天', displayName: '1GB/天', copies: '1', days: 1, planCategory: 'daily', productType: 'esim', unitPrice: 105, quantity: 1, countryCode: 'CN', countryName: '中國' },
  { id: 'sg_sim_1', packageId: 'p-sg', packageName: '新加坡', planId: 'pl-sg', bcSkuId: 'SG-SIM-1GB', bcSkuName: '新加坡 SIM 1GB/天', displayName: '1GB/天', copies: '1', days: 1, planCategory: 'daily', productType: 'sim', unitPrice: 95, quantity: 1, countryCode: 'SG', countryName: '新加坡' },
]

const shots = []
async function shoot(page, name, caption) {
  const file = `${DIR}/${name}.png`
  await page.screenshot({ path: file, fullPage: true })
  shots.push({ file: `${name}.png`, caption })
  console.log('📸', name, '—', caption)
}

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2, locale: 'zh-TW' })
  await ctx.addInitScript((cart) => { try { localStorage.setItem('flesim_cart', JSON.stringify(cart)) } catch (e) {} }, CART)
  const page = await ctx.newPage()

  // 登入
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PW)
  await Promise.all([
    page.waitForLoadState('networkidle').catch(() => {}),
    page.click('button[type=submit]').catch(() => page.click('form button')),
  ])
  await page.waitForTimeout(2500)
  console.log('登入後網址：', page.url())

  const go = async (path) => { await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }).catch(() => {}); await page.waitForTimeout(1200) }

  // 1 選擇目的地
  await go('/shop')
  await shoot(page, '01-shop', '步驟 1 — 選擇目的地國家/地區')

  // 2 選套餐（點國家開啟套餐 modal）
  try {
    const jp = page.locator('button:has-text("日本")').first()
    if (await jp.count()) { await jp.click(); await page.waitForTimeout(2000); await shoot(page, '02-packages', '步驟 2 — 選擇 eSIM/實體 SIM 套餐（流量/天數）與價格幣種') }
  } catch (e) { console.log('packages skip', e.message) }

  // 3 加入購物車（modal 內）
  try {
    const buy = page.locator('button:has-text("加入購物車"), button:has-text("立即購買"), button:has-text("購買"), button:has-text("加入")').first()
    if (await buy.count()) { await buy.click(); await page.waitForTimeout(1500) }
  } catch (e) { console.log('addcart skip', e.message) }

  // 3b 購物車（價格/幣種）
  await go('/cart')
  await shoot(page, '03-cart', '步驟 3 — 購物車（價格及幣種展示）')

  // 4 結帳：email / 收件資料 + 信用卡支付（TapPay）
  await go('/checkout')
  await page.waitForTimeout(1500)
  await shoot(page, '04-checkout', '步驟 4/6 — 填寫 email/收件資料 + 信用卡支付（TapPay）')

  // 4b 支付成功（真頁框架）
  await go('/payment/result?status=0&rec_trade_id=DEMO-OK-3DS&order_number=FL20260706E10541')
  await page.waitForTimeout(2000)
  await shoot(page, '04b-pay-success', '步驟 — 支付成功（真站框架）')

  // 4c 支付失敗（真頁框架）
  await go('/payment/result?status=1')
  await page.waitForTimeout(1500)
  await shoot(page, '04c-pay-failed', '步驟 — 支付失敗（真站框架）')

  // 5 訂單查詢
  await go('/orders')
  await shoot(page, '05-orders', '步驟 — 訂單查詢入口')

  // 6 訂單詳情 A：虛擬 eSIM（真實 QR）
  await go(`/orders/${ORDER_ID}`)
  await page.waitForSelector('img[alt="eSIM QR Code"]', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(2500)
  await shoot(page, '06-order-esim', '步驟 — 虛擬 eSIM 交付：QR Code / 訂單詳情（真實資料）')

  // 7 訂單詳情 B：實體 SIM（配送/物流 + 退款入口）
  await go(`/orders/${SIM_ORDER_ID}`)
  await page.waitForTimeout(1500)
  await shoot(page, '07-order-sim', '步驟 — 實體 SIM 交付：配送/物流資訊 + 售後退款入口')

  // 8 售後 / 退款頁
  await go(`/after-sale?order=FL20260706S37283`)
  await page.waitForTimeout(1200)
  await shoot(page, '08-after-sale', '步驟 — 售後申請及退款入口')

  // 9 會員中心
  await go('/account')
  await shoot(page, '09-account', '步驟 — 會員中心 / 帳號')

  await browser.close()
  fs.writeFileSync(`${DIR}/manifest.json`, JSON.stringify(shots, null, 2))
  console.log('\n完成，共', shots.length, '張，輸出於', DIR)
}

run().catch(e => { console.error('❌', e); process.exit(1) })
