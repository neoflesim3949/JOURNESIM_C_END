import { chromium } from 'playwright-core'
import fs from 'fs'
const DIR = 'docs/payment-review/antom'; fs.mkdirSync(DIR, { recursive: true })
const CART = [{ id: 'hk_esim_1', packageId: 'p-hk', packageName: '香港 eSIM', planId: 'pl-hk', bcSkuId: 'HK-ESIM-1GB', bcSkuName: '香港 eSIM 1GB/天', displayName: '1GB/天', copies: '1', days: 1, planCategory: 'daily', productType: 'esim', unitPrice: 105, quantity: 1, countryCode: 'HK', countryName: '香港' }]
async function shot(p, n) { await p.screenshot({ path: `${DIR}/${n}.png`, fullPage: true }); console.log('📸', n) }
const b = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await b.newContext({ viewport: { width: 1100, height: 1300 }, deviceScaleFactor: 2, locale: 'zh-TW' })
await ctx.addInitScript((c) => { try { localStorage.setItem('flesim_cart', JSON.stringify(c)) } catch (e) {} }, CART)
const page = await ctx.newPage()
await page.goto('http://localhost:3000/checkout', { waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
await page.fill('input[type=email]', 'sandbox-test@flesim.com').catch(() => {})
await shot(page, 'hk0-checkout')
await page.locator('button:has-text("前往付款")').first().click()
await page.waitForURL(/alipayplus\.com/, { timeout: 20000 }).catch(() => {})
await page.waitForTimeout(4000)
await shot(page, 'hk1-alipay')
let qr = null
for (const sel of ['img[src*="qr" i]', 'canvas', 'img']) { const loc = page.locator(sel); if (await loc.count().catch(() => 0)) { qr = loc.first(); break } }
if (qr) for (let i = 0; i < 5; i++) { await qr.click({ timeout: 3000, force: true }).catch(() => {}); await page.waitForTimeout(800) }
console.log('點完 5 下，攔截 Alipay+ 成功頁…')
let gotAliSuccess = false
for (let i = 0; i < 14; i++) {
  await page.waitForTimeout(1000)
  const u = page.url()
  if (!gotAliSuccess && /result\.html/.test(u)) { await page.waitForTimeout(600); await shot(page, 'hk1b-alipay-success'); gotAliSuccess = true }
  if (/localhost.*payment\/result/.test(u)) { console.log('✅ 導回商戶結果頁'); break }
}
await page.waitForTimeout(4000)
await shot(page, 'hk2-result')
await b.close()
