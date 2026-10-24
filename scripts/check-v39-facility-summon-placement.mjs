import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const browser=await chromium.launch(),output='output/web-game/facility-summon-placement';mkdirSync(output,{recursive:true});
try {
 const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e.stack)));
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
 const report=await page.evaluate(async()=>{
  window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39CallTest();
  const f=await import('/src/lib/v39-facility-summoning.js'),{getHexNeighborCoords}=await import('/src/lib/hex-grid.js');
  const failures=[],ok=(v,m)=>{if(!v)failures.push(m);};
  for(const stage of [1,2,3]){
   window.setV39RitualTestStage(stage);
   const state=structuredClone(window.getV39GameState()),id=state.activePlayerId,player=state.players.find(p=>p.id===id);
   state.players=[player];player.factionState.units=[];state.enemies=[];state.neutralVillages=[];
   const original=window.__v39FieldRuntime.mapData,map={...original,grid:Array.from({length:original.h},()=>Array(original.w).fill('平地')),defenseStructures:[],caveEventNpc:null};
   const slot=f.getV39FacilitySummonSlots(state,id).find(s=>s.row.召喚系統==='火精霊'),name='フレイムエレメンタル';
   const check=s=>f.inspectV39FacilitySummon(s,id,slot.id,name,map);
   let inspected=check(state);ok(inspected.available,`stage${stage} availability`);ok(inspected.radius===stage-1,`stage${stage} radius`);
   ok(inspected.tiles.length===[1,7,19][stage-1],`stage${stage} footprint ${inspected.tiles.length}`);
   ok(inspected.tiles.some(t=>t.key===slot.tileKey),'center missing');
   const destination=inspected.tiles.at(-1),spawn=f.summonV39FacilityUnit(state,id,slot.id,name,map,destination);
   ok(spawn.ok&&spawn.unit.x===destination.x&&spawn.unit.y===destination.y,'explicit destination not used');
   ok(!f.summonV39FacilityUnit(state,id,slot.id,name,map).ok,'missing target accepted');
   ok(!f.summonV39FacilityUnit(state,id,slot.id,name,map,{x:-1,y:-1}).ok,'outside target accepted');
   const terrain=map.grid[destination.y][destination.x];map.grid[destination.y][destination.x]='海';
   ok(!f.summonV39FacilityUnit(state,id,slot.id,name,map,destination).ok,'invalid terrain accepted');
   map.grid[destination.y][destination.x]=terrain;
   const friend={id:'friend',x:slot.x,y:slot.y,hp:10,worldId:slot.worldId};player.factionState.units=[friend];
   inspected=check(state);ok(stage===1?!inspected.available:inspected.available,'friend center occupancy');
   ok(!inspected.tiles.some(t=>t.key===slot.tileKey),'friend overlap');player.factionState.units=[];
   state.enemies=[{...friend,id:'enemy'}];ok(!check(state).available&&check(state).blocked,'enemy on facility did not block all summons');
   state.enemies=[{...friend,id:'dead-enemy',hp:0}];ok(check(state).available,'dead enemy blocked');
   state.enemies=[{...friend,id:'other-world',worldId:'other'}];ok(check(state).available,'other-world enemy blocked');state.enemies=[];
   state.players.push({id:'rival',factionState:{units:[{...friend,id:'rival-unit'}]}});ok(check(state).blocked,'rival occupation not blocked');state.players.pop();
   state.neutralVillages=[{hostilePlayerIds:[id],defenseUnits:[{...friend,id:'guard'}]}];ok(check(state).blocked,'hostile village occupation not blocked');state.neutralVillages=[];
   const neighbors=getHexNeighborCoords(map.w,map.h,slot.x,slot.y,map.worldWrapEnabled===true);
   map.defenseStructures=neighbors.map((t,i)=>({id:'wall'+i,kind:'壁',hp:100,height:1,barrierAttached:true,edge:{from:{x:slot.x,y:slot.y},to:t},tiles:[]}));
   inspected=check(state);ok(inspected.tiles.length===1,'wall crossing accepted');map.defenseStructures=[];
   const occupied=structuredClone(state);occupied.players[0].factionState.units=[{...friend,x:destination.x,y:destination.y}];
   ok(!f.summonV39FacilityUnit(occupied,id,slot.id,name,map,destination).ok,'target occupancy changed before commit');
   const edge=f.resolveV39FacilitySummonPlacements(state,id,{...map,w:5,h:5,grid:Array.from({length:5},()=>Array(5).fill('平地')),worldWrapEnabled:true},{...slot,x:0,y:0,tileKey:'0,0'},check(state).preview);
   ok(edge.tiles.length===[1,7,19][stage-1],`wrapped footprint ${stage}`);
  }
  window.startV39CallTest();return {failures};
 });assert.deepEqual(report.failures,[]);
 for(const width of [390,1100]){
  await page.setViewportSize({width,height:900});
  await page.evaluate(async()=>{window.startV39CallTest();await window.startV39RitualTest(3);});
  await page.locator('[data-summon-option="フレイムエレメンタル"]').click();
  await page.locator('[data-summon-confirm]').click();
  await page.waitForFunction(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.getByName('v39-development-selection-layer')?.getData('candidateCount')>0);
  assert.equal(await page.locator('[data-facility-placement-confirm]').isDisabled(),true);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:-1,y:-1}})));
  assert.equal(await page.locator('[data-facility-placement-confirm]').isDisabled(),true);
  const target=await page.evaluate(()=>{const keys=window.getV39FacilitySummonSelection().candidateTileKeys;const [x,y]=keys.at(-1).split(',').map(Number);return {x,y};});
  const point=await page.evaluate(async target=>{
    const {HEX_TILE_CONFIG:c}=await import('/src/lib/phaser-map-panel-config.js');
    const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0],camera=scene.cameras.main;
    const x=target.x*c.width+(target.y%2?c.oddRowOffsetX:0)+c.width/2,y=target.y*c.rowStep+c.height/2;
    const canvas=scene.game.canvas,rect=canvas.getBoundingClientRect();
    return {x:rect.left+((x-camera.worldView.x)*camera.zoom+camera.x)*rect.width/canvas.width,y:rect.top+((y-camera.worldView.y)*camera.zoom+camera.y)*rect.height/canvas.height};
  },target);
  await page.mouse.click(point.x,point.y);
  assert.equal(await page.locator('[data-facility-placement-confirm]').isEnabled(),true);
  await page.screenshot({path:`${output}/placement-${width}.png`});
  await page.locator('[data-facility-placement-back]').click();assert.equal(await page.locator('[data-summon-confirm]').isEnabled(),true);
  assert.equal(await page.evaluate(()=>window.getV39FacilitySummonSelection()),null);
  await page.locator('[data-summon-confirm]').click();
  await page.evaluate(target=>window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:target})),target);
  await page.locator('[data-facility-placement-confirm]').click();
  const unit=await page.evaluate(()=>{const s=window.getV39GameState();return s.players.find(p=>p.id===s.activePlayerId).factionState.units.find(u=>u.summon?.kind==='facility');});
  assert.equal(unit.x,target.x);assert.equal(unit.y,target.y);
  assert.equal(await page.evaluate(()=>window.getV39FacilitySummonSelection()),null);
  await page.evaluate(async()=>{window.startV39CallTest();await window.startV39RitualTest(1);});
  await page.locator('[data-summon-confirm]').click();await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>window.getV39FacilitySummonSelection()),null);
  assert.equal(await page.evaluate(()=>window.isV39MapInputLocked()),false);
  await page.evaluate(async()=>{await window.startV39RitualTest(2);});
  await page.locator('[data-summon-confirm]').click();
  await page.evaluate(()=>{const s=window.getV39GameState();window.setV39GameState({timeline:{...s.timeline,turnNumber:s.timeline.turnNumber+1}},{reason:'placement-turn-change'});});
  await page.waitForFunction(()=>window.getV39FacilitySummonSelection()===null);
  assert.equal(await page.locator('#v39-facility-summon-placement').count(),0);
  assert.equal(await page.evaluate(()=>window.isV39MapInputLocked()),false);
 }
 assert.deepEqual(errors,[]);console.log('Facility placement: radius0/1/2, enemy occupation, explicit target, occupancy revalidation, walls, wrap, back/cancel, 390/1100px OK');
} finally {await browser.close();}
