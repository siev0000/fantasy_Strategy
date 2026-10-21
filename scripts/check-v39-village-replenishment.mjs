import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

mkdirSync('output/web-game/village-replenishment', {recursive:true});
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport:{width:390,height:850}}), errors=[];
  page.on('pageerror', error=>errors.push(String(error)));
  await page.goto('http://127.0.0.1:3024', {waitUntil:'networkidle'});
  const report = await page.evaluate(async()=>{
    const {normalizeV39NeutralVillage:normalize,advanceV39NeutralVillages:advance} = await import('/src/lib/v39-neutral-village-rules.js');
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);
    window.startV39ExpeditionTest(false,{silentBanner:true});await window.waitForV39MapRenderSettled();
    const original=window.getV39GameState(), map={...window.__v39FieldRuntime.mapData,w:20,h:20,worldWrapEnabled:false,
      grid:Array.from({length:20},()=>Array(20).fill('平地')),lavaMap:[]};
    const initial=normalize({...original.neutralVillages[0],x:6,y:6,population:50,abandoned:false,incidentTest:false,
      hadDefenseUnits:false,defenseRosterInitialized:false,defenseUnits:[],vassalPlayerId:'',lastProcessedTurn:0},map);
    const dead={...initial,defenseUnits:initial.defenseUnits.map(unit=>({...unit,hp:0,currentHp:0,state:'死亡'}))};
    const live=unit=>Number(unit.hp??unit.currentHp)>0&&unit.state!=='死亡';
    const makeState=village=>({...original,timeline:{...original.timeline,turnNumber:10},enemies:[],wandererGroups:[],
      players:original.players.map(player=>({...player,factionState:{...player.factionState,
        units:player.factionState.units.map(unit=>({...unit,x:0,y:0}))}})),neutralVillages:[village],settlements:[village]});
    let state=makeState(dead), result=advance(state,map,10);state=result.state;
    const start=state.neutralVillages[0], ready=start.defenseTraining?.readyTurn;
    if(ready!==13)throw Error('Expected three-turn training: '+JSON.stringify(start.defenseTraining));
    const repeat=advance(state,map,10);
    if(repeat.reports.some(row=>row.type==='defense-training-started'))throw Error('Duplicate training');
    state=advance(state,map,11).state;
    window.setV39GameState({...state,timeline:{...state.timeline,turnNumber:11}});
    window.importV39SaveJson(window.exportV39SaveJson());await window.waitForV39MapRenderSettled();
    state=window.getV39GameState();
    const saved=state.neutralVillages[0].defenseTraining?.readyTurn===ready;
    const before=advance(state,map,12);state=before.state;
    const early=state.neutralVillages[0].defenseUnits.filter(live).length;
    result=advance(state,map,13);state=result.state;
    const completed=state.neutralVillages[0], recruit=completed.defenseUnits.find(live);
    const deadPreserved=dead.defenseUnits.every(unit=>completed.defenseUnits.some(row=>row.id===unit.id&&!live(row)));
    if(!recruit)throw Error('No recruit at completion');
    const repeatComplete=advance(state,map,13);
    const removedCorpses=normalize({...completed,defenseUnits:[recruit]},map);
    const noInstantRespawn=normalize({...completed,defenseUnits:[]},map).defenseUnits.length===0;
    for(let turn=14;turn<22;turn++)state=advance(state,map,turn).state;
    const minimumOnly=state.neutralVillages[0].defenseUnits.filter(live).length===1;
    const poor=advance(makeState({...dead,population:1}),map,10).state.neutralVillages[0];
    const abandoned=advance(makeState({...dead,population:0}),map,10).state.neutralVillages[0];
    const returned=advance(makeState({...dead,defenseUnits:[recruit],defenseTraining:{startedTurn:7,readyTurn:12}}),map,10).state.neutralVillages[0];
    const blockedMap={...map,grid:map.grid.map(row=>row.map(()=>'海'))};
    const blocked=advance({...makeState(dead),neutralVillages:[{...dead,defenseTraining:{startedTurn:7,readyTurn:10}}]},blockedMap,10).state.neutralVillages[0];
    const retried=advance(makeState({...blocked,lastProcessedTurn:10}),map,11).state.neutralVillages[0];
    const displayed={...start,x:original.neutralVillages[0].x,y:original.neutralVillages[0].y};
    window.setV39GameState({...original,neutralVillages:[displayed],settlements:original.settlements.map(row=>row.id===displayed.id?displayed:row),
      timeline:{...original.timeline,turnNumber:11}});
    const location=original.neutralVillages[0];window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:location.x,y:location.y}}));
    window.activateV39FooterTab('interaction');await window.waitForV39MapRenderSettled();
    if(!document.body.innerText.includes('守備軍訓練 ⌛2'))throw Error('Training progress is not visible');
    return {initial:initial.defenseUnits.length,notAbandoned:!start.abandoned,saved,early,deadPreserved,
      newId:!dead.defenseUnits.some(unit=>unit.id===recruit.id),count:completed.defenseUnits.filter(live).length,
      spawnDistance:(await import('/src/lib/hex-grid.js')).getHexDistance(recruit,completed),
      sameTurnInactive:recruit.lastDefenseTurn===13,duplicate:repeatComplete.reports.some(row=>row.type==='defense-replenished'),
      removedCorpses:removedCorpses.defenseUnits.length,noInstantRespawn,minimumOnly,
      insufficient:!poor.defenseTraining,abandoned:abandoned.abandoned&&!abandoned.defenseTraining,
      cancelled:!returned.defenseTraining,blocked:!!blocked.defenseTraining&&!blocked.defenseUnits.some(live),retried:retried.defenseUnits.some(live)};
  });
  assert(report.initial>0);assert(report.notAbandoned&&report.saved&&report.deadPreserved&&report.newId);
  assert.equal(report.early,0);assert.equal(report.count,1);assert(report.spawnDistance<=3);
  assert(report.sameTurnInactive&&!report.duplicate&&report.noInstantRespawn&&report.minimumOnly);
  assert.equal(report.removedCorpses,1);assert(report.insufficient&&report.abandoned&&report.cancelled&&report.blocked&&report.retried);
  assert.deepEqual(errors,[]);await page.screenshot({path:'output/web-game/village-replenishment/training.png'});console.log(report);
} finally {await browser.close();}
