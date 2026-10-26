import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];
 page.on('pageerror',error=>errors.push(String(error)));page.on('dialog',dialog=>dialog.accept());
 await page.goto('http://127.0.0.1:5173',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>typeof window.startV39VillagePlanTest==='function');
 const result=await page.evaluate(async()=>{
  const {buildV39TerritoryOverlayGroups:groups}=await import('/src/lib/v39-territory-overlay.js');
  const {placeV39DeathFog,advanceV39CorpseFog,advanceV39Fog}=await import('/src/lib/v39-fog-rules.js');
  const {advanceV39Purification}=await import('/src/lib/v39-purification-rules.js');
  const ok=(value,message)=>{if(!value)throw new Error(message);};
  const map={w:8,h:8,grid:Array.from({length:8},()=>Array(8).fill('平地')),worldWrapEnabled:false};
  placeV39DeathFog(map,'3,3',1);ok(!Object.keys(map.purificationByTile||{}).length,'fog placement polluted land');
  const empty={players:[],enemies:[],neutralVillages:[],groundLootByTile:{},activeWorldId:'surface'};
  advanceV39Purification(map,{...empty,groundLootByTile:{'3,3':{cargo:{resourcesByType:{死体:100}}},'6,6':{cargo:{resourcesByType:{死体:100}}}}},2,()=>1);
  ok(map.purificationByTile['3,3']===-2&&map.purificationByTile['6,6']===-1,'corpse-only vs corpse-and-fog wrong');
  ok(!map.purificationByTile['4,3'],'empty neighboring fog polluted land');
  advanceV39Purification(map,empty,3,()=>1);ok(map.purificationByTile['3,3']===-2,'extra decay continued after corpse removal');
  const persistent={w:8,h:8,grid:map.grid,purificationByTile:{'3,3':-5}};
  for(let turn=1;turn<=20;turn++){advanceV39Fog(persistent,turn);advanceV39CorpseFog(persistent,empty,turn,()=>0);}
  ok(Object.keys(persistent.purificationByTile).length===1&&persistent.purificationByTile['3,3']===-5,'fog created self-sustaining pollution');
  ok(persistent.fogMap.flat().filter(Boolean).length<=7,'fog expanded beyond its unchanged pollution source');
  const sample={activePlayerId:'a',players:[{id:'a',label:'自国'},{id:'b',label:'相手国'}],neutralVillages:[{id:'v',name:'村',x:5,y:5,territoryTileKeys:['5,5','5,4','6,5']}],territoryOwnerByTile:{'1,1':'a','2,2':'b','3,2':'b','5,4':'b'}};
  const original=JSON.stringify(sample),known=new Set(['2,2','5,5']);
  const visible=groups(sample,map,{explored:known});
  ok(visible.find(row=>row.id==='a').tileKeys.includes('1,1'),'own territory missing');
  ok(visible.find(row=>row.id==='b').tileKeys.length===1,'unexplored foreign land leaked');
  ok(visible.find(row=>row.id==='v').tileKeys.length===1,'village hidden territory leaked');
  const all=groups(sample,map,{testMode:true});
  ok(all.find(row=>row.id==='v').tileKeys.length===2,'annexed tile still village owned');
  ok(new Set(all.map(row=>row.color)).size===3,'owners share colors');
  ok(groups(sample,map,{testMode:true,colors:{b:'#ff0000'}}).find(row=>row.id==='b').color===0xff0000,'custom faction color ignored');
  ok(JSON.stringify(sample)===original,'view mutated territory');
  return {fogPurification:map.purificationByTile,groups:all};
 });
 if(process.env.V39_TEST_URL)await page.goto(process.env.V39_TEST_URL,{waitUntil:'networkidle'});
 await page.waitForFunction(()=>typeof window.startV39VillagePlanTest==='function');
 await page.evaluate(async()=>{
  window.closeV39PlayModeSelection();await window.setV39TestMode(true);await window.startV39VillagePlanTest();await window.waitForV39MapRenderSettled();
  const state=window.getV39GameState(),own=state.players[0],other={...own,id:'border-npc',label:'境界テスト国',isPlayer:false,factionState:{...own.factionState,units:[],settlements:[]}};
  window.setV39GameState({players:[own,other],territoryOwnerByTile:{...state.territoryOwnerByTile,'6,4':other.id,'6,5':other.id,'7,4':other.id}});
  await window.waitForV39MapRenderSettled();window.renderV39Visibility();
 });
 await mkdir('output/web-game/territory-overlay',{recursive:true});
 for(const width of [1100,390]){await page.setViewportSize({width,height:850});await page.screenshot({path:`output/web-game/territory-overlay/field-${width}.png`});}
 const layer=()=>page.evaluate(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.getByName('v39-territory-ownership-layer')?.getData('owners'));
 assert((await layer()).some(row=>row.id==='border-npc'));assert((await layer()).some(row=>row.kind==='village'));
 await page.evaluate(()=>{window.activateV39FooterTab('manage');document.getElementById('v39-manage-display-settings').click();});
 const toggle=page.locator('#v39-show-territory-ownership');
 await toggle.uncheck();await page.waitForTimeout(400);assert.equal(await layer(),undefined);
 await toggle.check();await page.waitForTimeout(400);assert((await layer()).length>1);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('v39-display-settings-v1')).showTerritoryOwnership),true);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result,errors},null,2));
}finally{await browser.close();}
