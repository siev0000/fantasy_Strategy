import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/scrollbars',{recursive:true});
const browser=await chromium.launch();
try{for(const width of [390,1100]){
 const page=await browser.newPage({viewport:{width,height:640}}),errors=[];page.on('pageerror',e=>errors.push(String(e.stack)));
 await page.goto('http://127.0.0.1:3000',{waitUntil:'networkidle'});
 await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();
  const state=window.getV39GameState(),p=state.players.find(p=>p.id===state.activePlayerId),source=p.factionState.units[0];
  window.setV39GameState({players:state.players.map(row=>row.id!==p.id?row:{...row,factionState:{...row.factionState,units:Array.from({length:35},(_,i)=>({...source,id:`scroll-unit-${i}`,name:`スクロール確認${i+1}`})),selectedUnitId:'scroll-unit-0',squads:[{id:'solo',unitIds:Array.from({length:35},(_,i)=>`scroll-unit-${i}`)}]}})});
  window.openV39CharacterModal({tab:'character'});
 });
 const list=page.locator('#characterModal .list-pane');
 assert(await list.evaluate(el=>el.scrollHeight>el.clientHeight));
 for(const selector of ['#characterModal .list-pane','#squadMemberList']){
  const style=await page.locator(selector).evaluate(el=>({width:getComputedStyle(el,'::-webkit-scrollbar').width,height:getComputedStyle(el,'::-webkit-scrollbar').height,thumb:getComputedStyle(el,'::-webkit-scrollbar-thumb').backgroundColor,display:getComputedStyle(el,'::-webkit-scrollbar').display,standard:getComputedStyle(el).scrollbarWidth}));

  assert.notEqual(style.display,'none');
  const {display,...metrics}=style;
  assert.deepEqual(metrics,{width:'6px',height:'6px',thumb:'rgb(100, 129, 140)',standard:'auto'});
 }
 await list.evaluate(el=>el.scrollTop=el.scrollHeight);assert(await list.evaluate(el=>el.scrollTop>0));
 await page.screenshot({path:`output/web-game/scrollbars/list-${width}.png`});
 await page.locator('[data-v39-character-tab="create"]').click();
 const pane=page.locator('#v39-create-pane');assert(await pane.evaluate(el=>el.scrollHeight>el.clientHeight));
 assert.equal(await pane.evaluate(el=>getComputedStyle(el,'::-webkit-scrollbar').width),'6px');
 await pane.evaluate(el=>el.scrollTop=el.scrollHeight);assert(await pane.evaluate(el=>el.scrollTop>0));
 await page.screenshot({path:`output/web-game/scrollbars/create-${width}.png`});
 await page.evaluate(()=>document.documentElement.style.setProperty('--scrollbar-size','8px'));
 assert.equal(await pane.evaluate(el=>getComputedStyle(el,'::-webkit-scrollbar').width),'8px');
 await page.evaluate(()=>document.documentElement.style.removeProperty('--scrollbar-size'));
 assert.deepEqual(errors,[]);console.log(`${width}: shared 6px vertical/horizontal bars, colored thumbs, actual scrolling and centralized variable passed`);await page.close();
}}finally{await browser.close();}
