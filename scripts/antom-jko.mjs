import { chromium } from 'playwright-core'
import fs from 'fs'
const DIR='docs/payment-review/antom'; fs.mkdirSync(DIR,{recursive:true})
const CART=[{id:'tw_esim_1',packageId:'p-tw',packageName:'台灣 eSIM',planId:'pl-tw',bcSkuId:'TW-ESIM-1GB',bcSkuName:'台灣 eSIM 1GB/天',displayName:'1GB/天',copies:'1',days:1,planCategory:'daily',productType:'esim',unitPrice:105,quantity:1,countryCode:'TW',countryName:'台灣'}]
async function shot(p,n){await p.screenshot({path:`${DIR}/${n}.png`,fullPage:true});console.log('📸',n)}
const b=await chromium.launch({channel:'chrome',headless:false})
const ctx=await b.newContext({viewport:{width:1100,height:1300},locale:'zh-TW'})
await ctx.addInitScript((c)=>{try{localStorage.setItem("flesim_cart",JSON.stringify(c))}catch(e){}},CART)
const page=await ctx.newPage()
await page.goto("http://localhost:3000/checkout",{waitUntil:"networkidle"});await page.waitForTimeout(1500)
await page.fill("input[type=email]","sandbox-test@flesim.com").catch(()=>{})
await shot(page,'jko0-checkout')
await page.locator('button:has-text("前往付款")').first().click()
await page.waitForURL(/alipay\.com/,{timeout:20000}).catch(()=>{})
await page.waitForTimeout(9000)
await shot(page,'jko1-simulator')
// 找 QR：img[src*=qr] 優先，否則點座標(QR 中心約 548,595)
const qr=page.locator('img[src*="qr" i], canvas').first()
const useElem=await qr.count().catch(()=>0)
console.log('QR elem?',useElem)
let done=false,gotMid=false
for(let i=0;i<7 && !done;i++){
  if(useElem) await qr.click({timeout:3000,force:true}).catch(()=>{})
  else await page.mouse.click(548,595)
  console.log('click',i+1)
  await page.waitForTimeout(2500)
  const u=page.url()
  if(!gotMid && /alipay/.test(u) && /result/.test(u)){await shot(page,'jko1b-success');gotMid=true}
  if(/localhost.*payment\/result/.test(u)){done=true;console.log('✅ 導回結果頁')}
}
await page.waitForTimeout(4000)
await shot(page,'jko2-result')
await page.waitForTimeout(1500)
await b.close()
