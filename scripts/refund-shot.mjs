import { chromium } from 'playwright-core'
import fs from 'fs'
const ADMIN=process.env.ADMIN_PASSWORD
const BASE='http://localhost:3000'
const DIR='docs/payment-review/antom/refund'; fs.mkdirSync(DIR,{recursive:true})
const PARTIAL={id:'dadd8780-f1dd-470e-8fcc-7a4cf1d92b98',no:'FL260708V27MPC'}
const FULL={id:'7013c9e1-d8f9-434b-85c8-e2f650f223cd',no:'FL260708NNFCQP'}
async function shot(p,n){await p.screenshot({path:`${DIR}/${n}.png`,fullPage:true});console.log('📸',n)}
const b=await chromium.launch({channel:'chrome',headless:true})
const ctx=await b.newContext({viewport:{width:1200,height:1050},deviceScaleFactor:2,locale:'zh-TW'})
await ctx.addCookies([{name:'admin_token',value:ADMIN,domain:'localhost',path:'/'}])
// 關掉「近七天到期未使用」提醒彈窗（會擋點擊）
await ctx.addInitScript(()=>{try{const d=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());localStorage.setItem('expiring_unused_dismissed',d)}catch(e){}})
const page=await ctx.newPage()

// === 部分退款 ===
await page.goto(`${BASE}/admin/orders/${PARTIAL.id}`,{waitUntil:'networkidle'});await page.waitForTimeout(1500)
await shot(page,'r1-order-partial')
await page.locator('button:has-text("發起退款")').click()
await page.waitForTimeout(3000)
await shot(page,'r2-modal-partial')
await page.locator('button:has-text("部分退款")').click();await page.waitForTimeout(500)
const full=await page.locator('input[type=number]').inputValue().catch(()=>'0')
const half=(Number(full)/2).toFixed(2)
await page.fill('input[type=number]',half);console.log('原付款',full,'部分退',half)
await shot(page,'r3-partial-amount')
await page.locator('button:has-text("確認退款")').click()
await page.waitForTimeout(5000)
await shot(page,'r4-partial-success')

// === 全額退款 ===
await page.goto(`${BASE}/admin/orders/${FULL.id}`,{waitUntil:'networkidle'});await page.waitForTimeout(1500)
await page.locator('button:has-text("發起退款")').click()
await page.waitForTimeout(3000)
await shot(page,'r5-modal-full')
await page.locator('button:has-text("確認退款")').click()
await page.waitForTimeout(5000)
await shot(page,'r6-full-success')

await b.close();console.log('done')
