import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/field-icons',{recursive:true});
const browser=await chromium.launch();
try {for(const width of [390,1100]){
 const page=await browser.newPage({viewport:{width,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e.stack)));
 await page.goto('http://127.0.0.1:5173',{waitUntil:'networkidle'});
 await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();await window.waitForV39MapRenderSettled();
  const s=window.getV39GameState();window.setV39GameState({players:s.players.map(p=>({...p,factionState:{...p.factionState,settlements:p.factionState.settlements.map((b,i)=>i?b:{...b,landExpansionProjects:[{tileKey:'4,2',remainingTurns:3},{tileKey:'5,2',remainingTurns:2,paused:true}],territoryTileConversionMap:{'6,2':{targetMode:'resource',remainingTurns:4}}})}}))});
  await window.waitForV39MapRenderSettled();
 });
 await page.waitForFunction(()=>{const scene=window.__v39FieldRuntime?.game?.scene?.getScenes(true)[0];return !!scene&&scene.children.list.some(c=>c.name==='v39-construction-label-layer'&&c.list?.length>=3);});
 const report=await page.evaluate(async()=>{
  const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0],walk=o=>[o,...(o.list||[]).flatMap(walk)],all=scene.children.list.flatMap(walk);
  const progress=all.filter(o=>o.name==='v39-construction-progress');
  const marker=all.find(o=>o.name==='v39-land-expansion-marker');scene.cameras.main.setZoom(1.5);scene.cameras.main.centerOn(marker.x+45,marker.y);
  const {addV39FieldSymbol}=await import('/src/v39/map/v39-field-symbols.js');
  for(const [i,kind] of ['cast','ready','pause','construction','expansion','housing','resource','nest','guard','wanderer','swamp','herb','canyon','miss','blocked'].entries())addV39FieldSymbol(scene,null,kind,scene.cameras.main.worldView.x+20+i*28,marker.y+80,22).setDepth(1000010);
  const markers=all.filter(o=>['v39-land-expansion-marker','v39-tile-conversion-marker','v39-facility-construction-marker','v39-construction-progress'].includes(o.name));
  return {progress:progress.map(o=>({paused:o.getData('paused'),turns:o.getData('remainingTurns')})),words:markers.flatMap(walk).filter(o=>o.type==='Text'&&/\p{L}/u.test(o.text)).map(o=>o.text),symbols:all.filter(o=>o.getData?.('fieldSymbol')).map(o=>o.getData('fieldSymbol'))};
 });
 assert.equal(report.progress.length,3);assert(report.progress.some(o=>o.paused));assert(report.progress.some(o=>o.turns===4));assert.deepEqual(report.words,[]);assert(report.symbols.includes('expansion'));assert(report.symbols.includes('pause'));assert(report.symbols.includes('resource'));
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('v39:combat-presentation',{detail:{obstruction:{x:4,y:2,message:'射線遮断'}}})));
 await page.waitForFunction(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list.some(o=>o.name==='v39-combat-outcome-icon'&&o.getData('fieldSymbol')==='blocked'));
 await page.screenshot({path:`output/web-game/field-icons/field-${width}.png`});assert.deepEqual(errors,[]);console.log(width,JSON.stringify(report));await page.close();
}}finally{await browser.close();}