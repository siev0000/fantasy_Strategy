import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/terrain-destruction';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:475,height:869}}),errors=[],plays=[];page.on('pageerror',e=>errors.push(String(e.stack)));page.on('console',async m=>{if(m.text().startsWith('[エフェクト再生]'))plays.push(await m.args()[1].jsonValue());});
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
 page.on('dialog',dialog=>dialog.accept());
 await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();window.activateV39FooterTab('test');});
 const entry=page.locator('[data-test-action="ground-test-start"]');await entry.waitFor();await entry.evaluate(button=>{for(let p=button.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});await entry.click();
 await page.waitForFunction(()=>window.getV39ActiveFactionState()?.units?.[0]?.id==='ground-test-0');
 await page.waitForFunction(()=>!window.isV39MapInputLocked?.()&&!!window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.[0]?.v39Input);
 if(!process.env.V39_PRODUCTION_CHECK){const checks=await page.evaluate(async()=>{
  const {damageV39Ground,advanceV39GroundCollapses,clearV39Rubble,resolveV39PowerEffectScale}=await import('/src/lib/v39-terrain-destruction.js');
  const {canUnitEnterV39Tile}=await import('/src/lib/v39-terrain-traversal.js');const {traceV39AttackRay}=await import('/src/lib/v39-combat-ray.js');
  const {resolveV39TerrainAttackPower}=await import('/src/lib/v39-combat-engine.js');const check=(ok,label)=>{if(!ok)throw Error(label);};
  const map={w:8,h:8,grid:Array.from({length:8},()=>Array(8).fill('丘陵')),heightLevelMap:Array.from({length:8},()=>Array(8).fill(3))},area=new Map([['3,3',1]]),unit={x:2,y:3,hp:100,ap:100,status:{攻撃:60}};
  check(damageV39Ground(map,area,200,1).map===map,'threshold');let a=damageV39Ground(map,area,450,1).map;check(a.terrainDamage.cells['3,3'].hp===250,'damage accumulates');
  let b=damageV39Ground(a,area,450,1).map;check(b.heightLevelMap[3][3]===2&&map.heightLevelMap[3][3]===3,'height loss and immutable input');
  check(damageV39Ground(b,area,999,1).map===b,'height cap');check(!advanceV39GroundCollapses(b,1).impacts.length,'warning delay');
  const enemyWarning=damageV39Ground(map,area,700,1,{timeline:{phase:'enemy'}}).map;check(enemyWarning.terrainDamage.pendingByTile['3,3'].resolvesAtTurn===3,'enemy warning leaves a player action phase');
  let collapse=advanceV39GroundCollapses(b,2);check(collapse.impacts.length===1,'delayed collapse');check(!advanceV39GroundCollapses(collapse.map,2).impacts.length,'no repeat');
  const chipped=damageV39Ground(collapse.map,area,40,2).map;check(chipped.terrainDamage.rubbleByTile['3,3'].hp===60,'weak physical attacks chip rubble without terrain threshold');check(!damageV39Ground(chipped,area,60,2).map.terrainDamage.rubbleByTile['3,3'],'attacks clear rubble');
  check(!canUnitEnterV39Tile(collapse.map,3,3,unit),'rubble movement');check(traceV39AttackRay(collapse.map,unit,{x:5,y:3},[]).reason==='瓦礫','rubble ray');
  let clear=clearV39Rubble(collapse.map,unit,{x:3,y:3});check(clear.ok&&clear.hp===40&&clear.apCost===20,'partial removal');clear=clearV39Rubble(clear.map,unit,{x:3,y:3});check(clear.ok&&!clear.map.terrainDamage.rubbleByTile['3,3'],'multiple workers');
  const {resolveV39AutomaticRoute}=await import('/src/lib/v39-transport-rules.js');
  const corridor={...collapse.map,grid:map.grid.map((row,y)=>row.map(()=>y===3?'平地':'海'))},hauler={...unit,id:'hauler',worldId:'surface',status:{攻撃:60,移動:100},maxAp:100};
  const state={players:[{id:'p',factionState:{units:[hauler],settlements:[]}}],enemies:[],neutralVillages:[],activeWorldId:'surface',territoryOwnerByTile:{}};
  check(!resolveV39AutomaticRoute(state,corridor,'p',hauler,{x:5,y:3},false)?.length,'automatic route stops at blocked corridor');
  check(resolveV39AutomaticRoute(state,{...corridor,terrainDamage:clear.map.terrainDamage},'p',hauler,{x:5,y:3},false)?.length>0,'automatic route reopens after clearance');
  check(!clearV39Rubble(collapse.map,{...unit,ap:19},{x:3,y:3}).ok,'AP shortage');check(!clearV39Rubble(collapse.map,{...unit,x:6},{x:3,y:3}).ok,'adjacent only');
  check(damageV39Ground({...map,entrances:[{x:3,y:3}]},area,999,1).map.terrainDamage===undefined,'entrance protection');check(damageV39Ground(map,new Map([['0,3',1]]),999,1).map===map,'border protection');
  const cave={...map,isUnderground:true,grid:map.grid.map(row=>row.map(()=> '岩壁'))};cave.grid[3][2]='洞窟';const opened=damageV39Ground(cave,area,300,1).map;check(opened.grid[3][3]==='洞窟','cave wall opens');check(Object.keys(opened.terrainDamage.pendingByTile).length===1,'one rockfall');
  const attacker={status:{攻撃:100}};check(resolveV39TerrainAttackPower({判定:'攻撃',物理:100,打撃:100},attacker)===resolveV39TerrainAttackPower({判定:'攻撃',物理:100},attacker),'no duplicate physical');check(resolveV39TerrainAttackPower({判定:'魔力',炎:999},attacker)===0,'fire alone excluded');
  check(resolveV39PowerEffectScale(100)===1&&resolveV39PowerEffectScale(400)===2&&resolveV39PowerEffectScale(9999)===2,'effect scale cap');return true;
 });assert(checks);}
 await page.locator('[data-squad-detail-tab="action"]').click();
 const attack=page.locator('[data-v39-attack-name="棍棒"]');await attack.click();
 assert(await page.evaluate(()=>window.executeV39AttackAt(3,6)),'normal weapon attack succeeds');
 const partial=await page.evaluate(()=>window.__v39FieldRuntime.mapData.terrainDamage.cells['3,6']);assert(partial.hp<partial.maxHp,'normal weapon damages terrain');
 if(!partial.broken){await page.evaluate(async()=>{await window.advanceV39Turn({skipUnactedFocus:true,presentation:false});});await page.locator('[data-squad-detail-tab="action"]').click();await attack.click();assert(await page.evaluate(()=>window.executeV39AttackAt(3,6)));}
 const terrain=await page.evaluate(()=>window.__v39FieldRuntime.mapData.terrainDamage);assert(terrain.cells['3,6']?.broken,'repeated attacks break terrain');
 assert.equal(await page.evaluate(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].v39Input.selectTile({x:3,y:6},false,{notify:false}).height),2,'selection reads new height');
 await page.screenshot({path:`${out}/warning-475.png`});
 const before=await page.evaluate(()=>window.getV39ActiveFactionState().units[0].hp);
 await page.evaluate(async()=>{await window.advanceV39Turn({skipUnactedFocus:true,presentation:false});});
 assert(await page.evaluate(()=>!!window.__v39FieldRuntime.mapData.terrainDamage.rubbleByTile['3,6']),'turn creates rubble');
 await page.locator('[data-squad-detail-tab="basic"]').click();
 const ap=await page.evaluate(()=>window.getV39ActiveFactionState().units[0].ap);
 await page.locator('[data-v39-rubble-clear="3,6"]').click();
 assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().units[0].ap),ap-20);
 const saved=await page.evaluate(()=>window.exportV39SaveJson(0));
 await page.reload({waitUntil:'networkidle'});await page.evaluate(async save=>{window.closeV39PlayModeSelection();window.importV39SaveJson(save);await window.waitForV39MapRenderSettled();},saved);
 assert(await page.evaluate(()=>window.__v39FieldRuntime.mapData.terrainDamage.cells['3,6'].broken),'fresh reload retains destruction');
 await page.screenshot({path:`${out}/saved-475.png`});
 for(const power of [100,400]){
  await page.evaluate(power=>window.playV39MapEffect({effectName:'打撃3',power,tileX:3,tileY:6,areaTiles:[{x:3,y:6},{x:4,y:6}],allowInFog:true,totalDurationMs:100}),power);
  await page.waitForTimeout(40);assert.equal(plays.at(-1).威力倍率,power===100?1:2);assert.equal(plays.at(-1).範囲マス数,2);
 }
 await page.evaluate(()=>window.openV39EffectSettings());
 await page.locator('#v39-effect-preview-power').fill('400');await page.locator('#v39-effect-preview-power').dispatchEvent('change');
 if(!process.env.V39_PRODUCTION_CHECK){
  const ratio=await page.evaluate(async()=>{const {effectPreviewGeometry}=await import('/src/v39/ui/v39-effect-preview-combatants.js');document.getElementById('v39-effect-preview-shape').value='circle';const stage=document.getElementById('v39-effect-preview-stage'),power=document.getElementById('v39-effect-preview-power');power.value='100';const a=effectPreviewGeometry(stage).fitDiameterPx;power.value='400';return effectPreviewGeometry(stage).fitDiameterPx/a;});assert.equal(ratio,2);
 }
 await page.screenshot({path:`${out}/power-preview-475.png`});await page.evaluate(()=>window.closeV39EffectSettings());
 await page.evaluate(async()=>{const state=window.getV39GameState(),world=Object.keys(state.explorationWorlds).find(id=>id.startsWith('cave:'));if(!world)throw Error('native cave missing');const f=window.getV39ActiveFactionState();window.updateV39ActiveFactionState({units:f.units.map((u,i)=>i===1?{...u,worldId:world,x:2,y:6}:u)});window.viewV39OwnedUnitWorld(f.units[1].id);await window.waitForV39MapRenderSettled();});
 const cave=await page.evaluate(()=>{
  const current=window.__v39FieldRuntime.mapData,map={...current,isUnderground:true,caveMine:null,terrainDamage:{},grid:current.grid.map(row=>row.map(()=> '岩壁')),specialMap:current.grid.map(row=>row.map(()=>''))};map.grid[6][2]='洞窟';map.grid[7][2]='洞窟';window.updateV39FieldData(map);window.setV39GameState({enemies:[],enemyNests:[],neutralVillages:[]});
  const state=window.getV39GameState(),p=state.players.find(p=>p.id===state.activePlayerId),unit=p.factionState.units[1];
  const ok=window.executeV39FactionCombatAction({playerId:p.id,attackerId:unit.id,target:{x:3,y:6},skillRow:{名前:'地形破壊検証打撃',行動:'A',攻撃手段:'肉体',判定:'攻撃',物理:1000,射程:3,AP消費:1}});
  return {ok,opened:window.__v39FieldRuntime.mapData.grid[6][3],hp:window.getV39ActiveFactionState().units[1].hp};
 });assert(cave.ok);assert.equal(cave.opened,'洞窟','faction combat opens a real wall');
 assert.equal(await page.evaluate(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].v39Input.selectTile({x:3,y:6},false,{notify:false}).terrain),'洞窟','selection reads opened terrain');
 await page.evaluate(()=>{const tile=Object.values(window.__v39FieldRuntime.mapData.terrainDamage.pendingByTile)[0];if(!tile)throw Error('missing rockfall warning');const f=window.getV39ActiveFactionState();window.updateV39ActiveFactionState({units:f.units.map((u,i)=>i===1?{...u,x:tile.x,y:tile.y}:u)});window.__groundImpactEntries=[];window.addEventListener('v39:terrain-damage',event=>window.__groundImpactEntries.push(...event.detail.entries));});
 await page.evaluate(async()=>{await window.advanceV39Turn({skipUnactedFocus:true,presentation:false});});
 assert(await page.evaluate(()=>window.__groundImpactEntries.some(e=>e.targetId==='ground-test-1'&&e.afterHp<e.beforeHp)),'rockfall uses common damage against occupant');
 const caveSave=await page.evaluate(()=>window.exportV39SaveJson(0));await page.reload({waitUntil:'networkidle'});await page.evaluate(save=>{window.closeV39PlayModeSelection();window.importV39SaveJson(save);},caveSave);
 await page.waitForFunction(()=>window.__v39FieldRuntime?.mapData?.terrainDamage?.cells?.['3,6']?.broken);
 assert(await page.evaluate(()=>window.getV39GameState().activeWorldId.startsWith('cave:')&&window.__v39FieldRuntime.mapData.grid[6][3]==='洞窟'),'native cave destruction survives reload');
 assert.deepEqual(errors,[]);console.log('PASS: normal weapon, threshold/height/cave/rubble, delay, movement/ray, clear/AP, save reload');
}finally{await browser.close();}
