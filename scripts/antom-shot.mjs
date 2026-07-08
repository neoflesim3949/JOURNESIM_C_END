// 沙盒跑 Antom 卡片付款流程並截圖
// node scripts/antom-shot.mjs
import { chromium } from 'playwright-core'
import fs from 'fs'

const BASE = 'http://localhost:3000'
const DIR = 'docs/payment-review/antom'
fs.mkdirSync(DIR, { recursive: true })

const CARD = { number: '4054695723100768', exp: '03/33', cvv: '321', name: 'TEST' }
const CART = [{ id: 'sg_esim_1', packageId: 'p-sg', packageName: '新加坡 eSIM', planId: 'pl-sg', bcSkuId: 'SG-ESIM-1GB', bcSkuName: '新加坡 eSIM 1GB/天', displayName: '1GB/天', copies: '1', days: 1, planCategory: 'daily', productType: 'esim', unitPrice: 105, quantity: 1, countryCode: 'SG', countryName: '新加坡' }]

const run = async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 1400 }, deviceScaleFactor: 2, locale: 'zh-TW' })
  await ctx.addInitScript((cart) => { try { localStorage.setItem('flesim_cart', JSON.stringify(cart)) } catch (e) {} }, CART)
  const page = await ctx.newPage()
  page.on('console', (m) => { const t = m.text(); if (/antom|error|fail/i.test(t)) console.log('PAGE>', t.slice(0, 160)) })

  await page.goto(`${BASE}/checkout`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await page.fill('input[type=email]', 'sandbox-test@flesim.com').catch(() => {})
  await page.screenshot({ path: `${DIR}/a1-checkout.png`, fullPage: true })
  console.log('shot a1-checkout')

  // 前往付款
  const btn = page.locator('button:has-text("前往付款")').first()
  if (!(await btn.count())) { console.log('❌ 沒有「前往付款」按鈕（provider 可能不是 antom）'); await page.screenshot({ path: `${DIR}/a0-nobutton.png`, fullPage: true }); await browser.close(); return }
  await btn.click()
  console.log('clicked 前往付款，等 SDK 渲染卡片表單…')
  await page.waitForTimeout(8000)

  // 列出所有 frame
  console.log('--- frames ---')
  for (const f of page.frames()) console.log('FRAME name=%o url=%o', f.name(), f.url().slice(0, 120))

  await page.screenshot({ path: `${DIR}/a2-cardform.png`, fullPage: true })
  console.log('shot a2-cardform')

  await browser.close()
  console.log('done, 檢視', DIR)
}
run().catch((e) => { console.error('❌', e.message); process.exit(1) })
