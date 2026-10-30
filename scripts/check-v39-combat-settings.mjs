import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const browser=await chromium.launch(),url=process.env.V39_TEST_URL||'http://127.0.0.1:5173';
mkdirSync('output/web-game/combat-settings',{recursive:true});
try {for(const width of [390,1100]){
 const page=await browser.newPage({viewport:{width,height:800}}),errors=[];page.on('pageerror',e=>errors.push(String(e.stack)));
 await page.goto(url,{waitUntil:'networkidle'});
 await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();});
 if(process.env.V39_UI_ONLY!=='1'){
  const checks=await page.evaluate(async()=>{
   const {computeAttackDamage}=await import('/src/lib/v39-combat-engine.js');
   const {normalizeV39DamageMultiplier}=await import('/src/lib/v39-combat-settings.js');
   window.damageProbe=(settings,magic=false,count=1)=>computeAttackDamage({attacker:{id:'probe-a',level:35,status:{攻撃:100,魔力:100,命中:100,精神:100},techniques:[],equipment:[],combatProfile:{attackCount:count}},target:{id:'probe-b',level:35,status:{防御:100,精神:100,速度:100},techniques:[],equipment:[]},skillRow:{名前:'Probe',行動:'A',判定:magic?'魔力':'攻撃',攻撃手段:magic?'魔法':'素手',[magic?'魔法':'物理']:100,攻撃回数:1},gameSettings:settings,random:(()=>{let i=0;return()=>i++%2===0?0:0.5;})()});
   const low=window.damageProbe({combatDamageMultiplier:1.5}),high=window.damageProbe({combatDamageMultiplier:3});
   return {default:normalizeV39DamageMultiplier(),empty:normalizeV39DamageMultiplier(''),bad:normalizeV39DamageMultiplier('invalid'),min:normalizeV39DamageMultiplier(-1),max:normalizeV39DamageMultiplier(100),decimal:normalizeV39DamageMultiplier(1.54),low:low.total,high:high.total,zero:window.damageProbe({combatDamageMultiplier:0}).total,magic:window.damageProbe({combatDamageMultiplier:1.5},true).total,army:window.damageProbe({combatDamageMultiplier:1.5},false,3).total};
  });
  assert.deepEqual(checks,{default:1.5,empty:1.5,bad:1.5,min:0,max:10,decimal:1.5,low:67,high:135,zero:0,magic:67,army:201});
 }
 assert.equal(await page.evaluate(()=>window.getV39GameSettings().combatDamageMultiplier),1.5);
 await page.locator('[data-foot="manage"]').click();await page.locator('.manage-tile[data-open="settings"]').click();
 const input=page.locator('#v39-combat-damage-multiplier');assert.equal(await input.inputValue(),'1.5');
 await input.fill('3');await input.press('Tab');assert.equal(await page.evaluate(()=>window.getV39GameSettings().combatDamageMultiplier),3);
 if(process.env.V39_UI_ONLY!=='1')assert.equal(await page.evaluate(()=>window.damageProbe().detail.damageMultiplier),3);
 await page.evaluate(()=>window.importV39SaveJson(window.exportV39SaveJson(0)));
 assert.equal(await page.evaluate(()=>window.getV39GameSettings().combatDamageMultiplier),3);
 await page.evaluate(()=>{const save=JSON.parse(window.exportV39SaveJson(0));delete save.gameState.gameSettings.combatDamageMultiplier;window.importV39SaveJson(JSON.stringify(save));});
 assert.equal(await page.evaluate(()=>window.getV39GameSettings().combatDamageMultiplier),1.5);
 await input.scrollIntoViewIfNeeded();await page.screenshot({path:`output/web-game/combat-settings/settings-${width}.png`});
 await page.evaluate(()=>document.querySelector('#settingsModal [data-close]')?.click());
 await page.locator('#v39-manage-field-settings').click();
 assert.equal(await page.locator('#v39-field-damage-multiplier').inputValue(),'1.5');
 await page.locator('#v39-field-damage-multiplier').fill('2');await page.locator('#v39-field-damage-multiplier').press('Tab');
 assert.equal(await page.locator('#v39-field-damage-multiplier').inputValue(),'2');
 assert.deepEqual(errors,[]);console.log(`${width}: damage settings default, runtime, start UI, save/load${process.env.V39_UI_ONLY==='1'?'':', physical/magic/army damage and bounds'} passed`);
 await page.close();
}} finally {await browser.close();}
