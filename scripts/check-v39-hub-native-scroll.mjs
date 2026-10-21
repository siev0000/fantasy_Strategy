import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/hub-native-scroll';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{for(const mobile of [false,true]){
  const page=await browser.newPage({viewport:{width:390,height:700},isMobile:mobile,hasTouch:mobile});
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39VillageIncidentTest();});
  await page.waitForSelector('#v39-hub-tab-talk');await page.waitForFunction(()=>!window.isV39MapInputLocked?.());
  const body=page.locator('.v39-village-menu-body'),conversation=page.locator('[data-hub-conversation]'),fixed=await conversation.boundingBox();
  const cdp=mobile?await page.context().newCDPSession(page):null;
  async function scrollAt(x,y){
    if(!mobile){await page.mouse.move(x,y);await page.mouse.wheel(0,360);}
    else{
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-i*12}]});await page.waitForTimeout(20);}
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }
    await page.waitForTimeout(300);
  }
  for(const tab of ['talk','quests','trade','info']){
    await page.locator(`[data-hub-tab=${tab}]`).click();
    if(tab==='info')await page.locator('.v39-conversation-preparation>summary').click();
    if(tab==='trade')await page.locator('[data-trade-fold=delivery]>summary').click();
    const box=await body.boundingBox();
    if(tab==='trade'){
      const ul=page.locator('[data-trade-basket="0"] ul');await ul.scrollIntoViewIfNeeded();await ul.evaluate(n=>n.scrollTop=n.scrollHeight);
      await body.evaluate(n=>n.scrollTop=0);
      const r=await ul.boundingBox(),y=Math.min(box.y+box.height-15,r.y+r.height-10);
      await scrollAt(r.x+r.width/2,y);
    }else await scrollAt(box.x+box.width/2,box.y+box.height-20);
    const s=await body.evaluate(n=>({top:n.scrollTop,max:n.scrollHeight-n.clientHeight}));
    console.log({mobile,tab,...s});if(s.max>0)assert(s.top>0,`${mobile?'touch':'wheel'} ${tab}: lower pane actually scrolls`);
    assert.deepEqual(await conversation.boundingBox(),fixed);
  }
  await page.screenshot({path:`${out}/${mobile?'touch':'wheel'}.png`});await page.close();
}}finally{await browser.close();}
