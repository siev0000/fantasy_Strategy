import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/hazard-zones';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e.stack)));
 page.on('dialog',dialog=>dialog.accept());
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>!!window.startV39HazardTest);
 await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39HazardTest();await window.waitForV39MapRenderSettled();});
 if(!process.env.V39_PRODUCTION_CHECK){
 const result=await page.evaluate(async()=>{
   const {tickV39HazardEffects:tick}=await import('/src/lib/v39-hazard-effects.js');
   const {getV39HazardDefinitions,projectV39HazardEvents,v39HazardRecoveryMultiplier:recovery}=await import('/src/lib/v39-hazard-zones.js');
   const {applyV39DisasterMovementDamage:move}=await import('/src/lib/v39-disaster-damage.js');
   const {resolveV39UnitMovementStepCost:cost}=await import('/src/lib/v39-terrain-traversal.js');
   const {clearV39FogByWind:clear,isV39FogTile:fog,resolveV39FogPenalty:penalty}=await import('/src/lib/v39-fog-rules.js');
   const {generateV39CaveMap}=await import('/src/lib/v39-cave-generator.js');
   const {createTerrainMapData}=await import('/src/lib/map-generator.js');
   const s=window.getV39GameState(),map=window.__v39FieldRuntime.mapData,turn=s.timeline.turnNumber;
   const first=tick(s,map,turn+1),units=first.players.find(p=>p.id===s.activePlayerId).factionState.units;
   const duplicate=tick({...s,...first},map,turn+1),miasma=map.hazardZones.find(z=>z.name==='瘴気地帯'),cold=map.hazardZones.find(z=>z.name==='極寒地帯');
   const acid=map.hazardZones[0],normal=units[0],immune=units[1];
   const walk=(unit)=>move({...unit,x:acid.x-1,y:acid.y},[{x:acid.x,y:acid.y}],{...s,...first,worldEnvironment:{activeDisasters:projectV39HazardEvents(map,turn+1)}},turn+1);
   const moved=walk(normal),resisted=walk(immune),flight=walk({...normal,status:{...normal.status,飛行:100}});
   const poison=units.find(u=>u.id==='hazard-observer-1-normal');
   const outside={...poison,x:0,y:0};
   const outsideState={...s,players:s.players.map(p=>({...p,factionState:{...p.factionState,units:[outside]}}))};
   const poisonAfter=tick(outsideState,map,turn+2).players[0].factionState.units[0];
   const poisonEnd=tick({...outsideState,players:outsideState.players.map(p=>({...p,factionState:{...p.factionState,units:[poisonAfter]}}))},map,turn+5).players[0].factionState.units[0];
   const target={x:cold.x,y:cold.y},coldUnit=units.find(u=>u.id==='hazard-observer-4-normal');
   const coldCost=cost(map,cold.x-1,cold.y,cold.x,cold.y,coldUnit),immuneCost=cost(map,cold.x-1,cold.y,cold.x,cold.y,{...coldUnit,status:{...coldUnit.status,氷耐性:100}});
   const recoveryBefore=recovery(map,{x:miasma.x,y:miasma.y},map.hazardTurn);
   const recoveryImmune=recovery(map,{x:miasma.x,y:miasma.y,resistances:{毒耐性:100}},map.hazardTurn);
   const f=map.hazardZones.find(z=>z.name==='常霧の谷'),before=fog(map,f.x,f.y),beforePenalty=penalty(map,{x:f.x-2,y:f.y},{x:f.x,y:f.y});
   clear(map,new Map([[`${f.x},${f.y}`,1],[`${miasma.x},${miasma.y}`,1]]),{系統:'風',炸裂:0.5});
   const cleared=fog(map,f.x,f.y),suppressed=recovery(map,{x:miasma.x,y:miasma.y},map.hazardTurn);
   const clone=JSON.parse(JSON.stringify(map));clone.hazardTurn+=3;
   const cave=generateV39CaveMap({seed:'hazard-cave-check'}),caveAgain=generateV39CaveMap({seed:'hazard-cave-check'});
   const caveAcid=cave.hazardZones.find(z=>z.name==='酸の沼');
   const caveUnits=[{...normal,x:caveAcid.x,y:caveAcid.y,worldId:'cave-check',lastHazardTickTurn:0},
     {...normal,id:'surface-isolated',x:caveAcid.x,y:caveAcid.y,worldId:'surface',lastHazardTickTurn:0}];
   const caveState={...s,activeWorldId:'cave-check',players:s.players.map(p=>({...p,factionState:{...p.factionState,units:caveUnits}}))};
   const caveTick=tick(caveState,cave,turn+1).players[0].factionState.units;
   const surface=createTerrainMapData({w:48,h:48,patternId:'realistic'});
   return {count:getV39HazardDefinitions().length,hps:units.map(u=>({id:u.id,hp:u.hp,poison:u.environmentPoison})),
     duplicate:JSON.stringify(first.players)===JSON.stringify(duplicate.players),moved:moved.entries.length,resisted:resisted.entries.length,flight:flight.entries.length,
     poisonAfter:poisonAfter.hp<outside.hp,poisonEnd:poisonEnd.environmentPoison,coldCost,immuneCost,
     recoveryBefore,recoveryImmune,purification:map.purificationByTile[`${miasma.x},${miasma.y}`],
     before,beforePenalty,cleared,suppressed,resumed:fog(clone,f.x,f.y),
     caveDamage:caveTick[0].hp<normal.hp,surfaceIsolated:caveTick[1].hp===normal.hp,
     cave:cave.hazardZones.map(z=>z.name),sameCave:JSON.stringify(cave.hazardZones)===JSON.stringify(caveAgain.hazardZones),surface:surface.hazardZones.map(z=>z.name)};
 });
 assert.equal(result.count,6);assert(result.duplicate);assert.equal(result.moved,1);assert.equal(result.resisted,0);assert.equal(result.flight,0);
 for(const i of [0,1,3,4]){assert(result.hps[i*2].hp<300,`damage ${i}`);assert.equal(result.hps[i*2+1].hp,300,`resistance ${i}`);}
 assert(result.poisonAfter);assert.equal(result.poisonEnd,null);assert(result.coldCost>result.immuneCost);
 assert(result.before&&!result.cleared&&result.resumed);assert(result.beforePenalty.scout>0);assert.equal(result.suppressed,1);
 assert.equal(result.recoveryBefore,0.5);assert.equal(result.recoveryImmune,1);
 assert(result.caveDamage&&result.surfaceIsolated);
 assert(result.purification<0);assert(result.sameCave&&result.cave.includes('瘴気地帯')&&result.cave.includes('酸の沼'));assert(result.surface.length>0);
 }
 const report=await page.evaluate(async()=>{
   const map=window.__v39FieldRuntime.mapData,s=window.getV39GameState(),t=s.timeline.turnNumber;
   window.dispatchEvent(new CustomEvent('v39:turn-stage-world',{detail:{turnNumber:t+1}}));
   const after=window.getV39ActiveFactionState().units;
   window.importV39SaveJson(window.exportV39SaveJson());await window.waitForV39MapRenderSettled();
   const restored=window.__v39FieldRuntime.mapData;
   return {zones:restored.hazardZones.length,persistent:window.getV39GameState().worldEnvironment.activeDisasters.filter(e=>e.persistentHazard).length,
     poison:after.find(u=>u.id==='hazard-observer-1-normal').environmentPoison,
     persisted:JSON.stringify(map.hazardZones)===JSON.stringify(restored.hazardZones)};
 });
 assert.equal(report.zones,6);assert(report.persisted&&report.poison);assert(report.persistent>=4);
 await page.evaluate(async()=>{window.startV39HazardTest();await window.waitForV39MapRenderSettled();});
 await page.locator('[data-test-tab="environment"]').click();
 await page.locator('[data-test-action="hazard-test-start"]').waitFor({state:'attached'});
 await page.screenshot({path:`${out}/field-1100.png`});
 const turns=await page.evaluate(async()=>{
   const result=[];for(let i=0;i<6;i++){
     const ok=await window.advanceV39Turn({skipUnactedFocus:true});const s=window.getV39GameState();
     result.push({ok,turn:s.timeline.turnNumber,zones:window.__v39FieldRuntime.mapData.hazardZones.length,
       persistent:s.worldEnvironment.activeDisasters.filter(e=>e.persistentHazard).length});
   }return result;
 });
 assert(turns.every(row=>row.ok&&row.zones===6&&row.persistent===6));
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('#v39-test-disaster-fixture option').count(),6);
 await page.locator('#v39-test-disaster-fixture').selectOption('危険地帯:常霧の谷');
 await page.locator('[data-test-action="disaster-fixture-focus"]').click();
 await page.screenshot({path:`${out}/field-390.png`});assert.deepEqual(errors,[]);console.log('Hazards: six kinds, actual generation, tick, movement, resistance, poison, cold AP, fog suppression, save/load passed');
}finally{await browser.close();}
