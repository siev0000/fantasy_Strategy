import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/unit-name-fit';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
async function verify(label){
  const value=await label.evaluate(el=>{
    const style=getComputedStyle(el),box=el.getBoundingClientRect(),card=el.closest('.squad-card').getBoundingClientRect(),range=document.createRange();
    range.selectNodeContents(el);
    const rects=[...range.getClientRects()].filter(rect=>rect.width>0);
    const lines=new Set(rects.map(rect=>Math.round(rect.top*10)/10));
    return {text:el.textContent,fit:Number(el.style.getPropertyValue('--v39-name-fit')),font:parseFloat(style.fontSize),
      clamp:style.webkitLineClamp,lines:lines.size,
      box:{x:box.x,y:box.y,width:box.width,height:box.height},rects:rects.map(rect=>({x:rect.x,y:rect.y,width:rect.width,height:rect.height})),
      contained:rects.every(rect=>rect.left>=box.left-1&&rect.right<=box.right+1&&rect.top>=card.top-1&&rect.bottom<=card.bottom+1)};
  });
  assert(value.fit>0&&value.fit<=1,JSON.stringify(value));
  assert.equal(value.clamp,'none');assert(value.lines<=2,JSON.stringify(value));
  assert(value.contained,JSON.stringify(value));
  assert(!value.text.includes('…'));return value;
}
try{
  for(const width of [320,390,540,1100]){
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on('pageerror',error=>errors.push(String(error.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
    await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39CallTest();
      const f=window.getV39ActiveFactionState();
      window.updateV39ActiveFactionState({units:f.units.map((unit,index)=>({...unit,name:index===0?'短名':index===1?'アークフレイムソルジャー':'長いユニット名ABCDEFGHIJKLMNOPQRSTUVWXYZ'}))});
      window.activateV39FooterTab('squad');
    });
    const cards=page.locator('#squadMemberList [data-v39-unit-id]');
    for(const selected of [0,1,2]){
      await cards.nth(selected).click();await settle(page);
      for(let index=0;index<await cards.count();index++)await verify(cards.nth(index).locator('.squad-name'));
    }
    assert.equal((await verify(cards.locator('.squad-name').filter({hasText:/^短名$/}))).fit,1,'short name should retain normal font');
    await page.screenshot({path:`${out}/field-${width}.png`});
    const before=await verify(cards.nth(1).locator('.squad-name'));
    await page.evaluate(()=>window.refreshV39SquadDerivedUI());await settle(page);
    await verify(cards.nth(1).locator('.squad-name'));
    await page.setViewportSize({width:width+200,height:900});await settle(page);
    const wide=await verify(cards.nth(1).locator('.squad-name'));
    assert(wide.font>=before.font-0.1,'wider card must not shrink name further');
    await page.setViewportSize({width,height:900});
    await page.evaluate(()=>window.openV39CharacterModal());
    await page.locator('[data-v39-character-tab="character"]').click();await settle(page);
    const modal=page.locator('#characterModal [data-v39-character-row]');
    for(let index=0;index<await modal.count();index++)await verify(modal.nth(index).locator('.squad-name'));
    await page.locator('#characterModal [data-close]').click();
    await page.evaluate(async()=>{await window.startV39RitualTest(3);});await settle(page);
    const candidates=page.locator('#v39-summon-modal [data-summon-card]');
    for(let index=0;index<await candidates.count();index++)await verify(candidates.nth(index).locator('.squad-name'));
    await candidates.last().click();await settle(page);
    for(let index=0;index<await candidates.count();index++)await verify(candidates.nth(index).locator('.squad-name'));
    await page.screenshot({path:`${out}/summon-${width}.png`});
    assert.deepEqual(errors,[]);console.log(`${width}: all names fit two lines in selected/unselected cards, short name unchanged, resize/rerender/modal/summon passed`);
    await page.close();
  }
}finally{await browser.close();}
