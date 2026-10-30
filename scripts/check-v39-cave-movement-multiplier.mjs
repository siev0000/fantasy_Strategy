import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/cave-movement-multiplier';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{for(const width of [390,1100]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e.stack)));
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
 await page.evaluate(async()=>{
   window.closeV39PlayModeSelection();await window.setV39TestMode(true);await window.startV39ExpeditionTest();
   const unit=window.getV39ActiveFactionState().units.find(u=>u.worldId?.startsWith('cave:'));
   window.viewV39OwnedUnitWorld(unit.id);await window.waitForV39MapRenderSettled();
   window.activateV39FooterTab('squad');
 });
 for(const underground of [false,true]){
  await page.evaluate(async underground=>{
    const map=structuredClone(window.__v39FieldRuntime.mapData);map.isUnderground=underground;map.worldWrapEnabled=false;map.w=26;
    map.grid=map.grid.map(()=>Array(map.w).fill(underground?'岩壁':'海'));
    for(let x=2;x<map.w-1;x++)map.grid[10][x]=underground?'洞窟':'平地';
    map.heightLevelMap=map.grid.map(row=>row.map(()=>0));map.specialMap=map.grid.map(row=>row.map(()=>''));
    map.caveSites=[];map.entrances=[];map.stairsDown=null;map.defenseStructures=[];map.hazardZones=[];delete map.caveEventNpc;
    window.updateV39FieldData(map);
    const f=window.getV39ActiveFactionState();
    window.updateV39ActiveFactionState({units:f.units.map(u=>u.id!==f.selectedUnitId?u:{...u,x:5,y:10,testOnly:true,testMovementMinimum:50,status:{...u.status,移動:50},movement:50,ap:100,currentAp:100,actionPoint:100,movementHold:false})});
    window.setV39GameState({enemies:[],neutralVillages:[],facilitiesByTile:{},territoryOwnerByTile:{},worldEnvironment:{}});
    await window.waitForV39MapRenderSettled();
  },underground);
  await page.locator('[data-squad-detail-tab="basic"]').click();
  assert.equal(await page.locator('#mobileMoveAp').innerText(),`AP ${underground?10:20}/マス`);
  assert.equal((await page.locator('#mobileMoveMeta').innerText()).includes('×2'),underground);
  await page.locator('#mobileBattleMove').click();
  await page.waitForFunction(()=>window.getV39UnitMovePreview()?.reachable.length>1);
  const range=await page.evaluate(()=>window.getV39UnitMovePreview().reachable);
  const steps=underground?10:5,target=5+steps;
  assert(range.some(t=>t.key===`${target},10`&&t.cost===100),JSON.stringify({underground,range}));
  assert(!range.some(t=>t.key===`${target+1},10`));
  await page.screenshot({path:`${out}/${underground?'cave':'surface'}-${width}.png`});
  await page.evaluate(x=>window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x,y:10}})),target);
  await page.locator('#moveOk').click();
  await page.waitForFunction(x=>window.getV39ActiveFactionState().units.find(u=>u.id===window.getV39ActiveFactionState().selectedUnitId)?.x===x,target);
  await page.waitForFunction(()=>!window.isV39MapInputLocked());
  assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().units.find(u=>u.id===window.getV39ActiveFactionState().selectedUnitId).ap),0);
 }
 assert.deepEqual(errors,[]);console.log(`${width}: surface 5 tiles, cave 10 tiles; displayed cost, actual range and actual AP consumption agree`);
 await page.close();
}}finally{await browser.close();}
