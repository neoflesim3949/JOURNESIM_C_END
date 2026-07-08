// 沙盒完整跑 Antom 卡片付款並逐步截圖
// node scripts/antom-pay.mjs
import { chromium } from 'playwright-core'
import fs from 'fs'

const BASE = 'http://localhost:3000'
const DIR = 'docs/payment-review/antom'
fs.mkdirSync(DIR, { recursive: true })
const CARD = { number: '4054695723100768', exp: '0333', cvv: '123', name: 'TEST' }
const CART = [{ id: 'sg_esim_1', packageId: 'p-sg', packageName: '新加坡 eSIM', planId: 'pl-sg', bcSkuId: 'SG-ESIM-1GB', bcSkuName: '新加坡 eSIM 1GB/天', displayName: '1GB/天', copies: '1', days: 1, planCategory: 'daily', productType: 'esim', unitPrice: 105, quantity: 1, countryCode: 'SG', countryName: '新加坡' }]

async function shot(page, name) { await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true }); console.log('📸', name) }

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 2, locale: 'zh-TW' })
  await ctx.addInitScript((cart) => { try { localStorage.setItem('flesim_cart', JSON.stringify(cart)) } catch (e) {} }, CART)
  const page = await ctx.newPage()

  await page.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await page.fill('input[type=email]', 'sandbox-test@flesim.com').catch(() => {})
  await shot(page, 'p1-checkout')

  await page.locator('button:has-text("前往付款")').first().click()
  await page.waitForTimeout(8000)
  await shot(page, 'p2-cardform')

  const f = page.frameLocator('iframe[src*="CASHIER_PAYMENT_CARD"]')
  async function type(sels, value) {
    for (const sel of sels) {
      const loc = f.locator(sel)
      if (await loc.count().catch(() => 0)) { await loc.first().click().catch(() => {}); await loc.first().pressSequentially(value, { delay: 45 }).catch(async () => { await page.keyboard.type(value, { delay: 45 }) }); return true }
    }
    return false
  }
  async function clickPay() {
    const b = f.locator('button:has-text("Go to Pay"), button:has-text("Pay"), button[type=submit]')
    if (await b.count().catch(() => 0)) { await b.first().click().catch(() => {}); return true }
    await page.locator('button:has-text("Go to Pay")').first().click().catch(() => {})
    return false
  }

  // 1) 卡號
  await type(['input[placeholder*="card number" i]', 'input'], CARD.number)
  await page.waitForTimeout(1200)
  await shot(page, 'p3-card-number')

  // 2) 點 Go to Pay 展開其餘欄位
  await clickPay()
  await page.waitForTimeout(2500)
  await shot(page, 'p4-expanded')

  // 3) 填到期/CVV/姓名（展開後依序 input：0卡號 1到期 2CVV 3姓名）
  async function typeNth(n, value) {
    const loc = f.locator('input').nth(n)
    if (await loc.count().catch(() => 0)) { await loc.click().catch(() => {}); await loc.pressSequentially(value, { delay: 50 }).catch(() => {}) }
  }
  console.log('inputs after expand:', await f.locator('input').count().catch(() => -1))
  await typeNth(1, CARD.exp)
  await typeNth(2, CARD.cvv)
  await typeNth(3, CARD.name)
  await page.waitForTimeout(1000)
  await shot(page, 'p5-filled')

  // 4) 再按 Go to Pay 送出
  await clickPay()
  console.log('送出，等 3DS / 導回結果…')
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(4000)
    const url = page.url()
    console.log('url:', url.slice(0, 100))
    if (/payment\/result/.test(url)) break
    if (i === 2) await shot(page, 'p6-processing')
  }
  await page.waitForTimeout(3000)
  await shot(page, 'p7-result')

  await browser.close()
  console.log('done')
}
run().catch((e) => { console.error('❌', e.message); process.exit(1) })
