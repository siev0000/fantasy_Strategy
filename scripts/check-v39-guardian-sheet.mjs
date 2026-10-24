import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/guardian-sheet';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {for(const width of [390,1100]) {
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>typeof window.startV39CallTest==='function');
  const result=await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39CallTest();
    const rules=await import('/src/lib/v39-guardian-quests.js');
    const failures=[],ok=(value,message)=>{if(!value)failures.push(message);};
    const state=window.getV39GameState(),pid=state.activePlayerId,player=state.players.find(p=>p.id===pid);
    const key='13,10',landmark={id:'sheet-test',key,name:'守護者依頼試験地',kind:'victory-landmark',x:13,y:10,occupiedTileKeys:[key]};
    const base={id:'guardian-base',settlementId:'guardian-base',placed:true,ownerPlayerId:pid,x:10,y:10,population:50,
      foodStockByType:{穀物:300},materialStockByType:{木材:300}};
    const unit={...player.factionState.units[0],x:12,y:10,hp:100,currentHp:100,worldId:'surface'};
    let s={...state,activeWorldId:'surface',timeline:{...state.timeline,turnNumber:1},victory:{},neutralVillages:[],
      victoryLandmarksByTile:{[key]:landmark},territoryOwnerByTile:{},territoryStateByTile:{},
      players:[{...player,factionState:{...player.factionState,units:[unit],squads:[],selectedUnitId:unit.id,
        settlements:[base],selectedSettlementId:base.id,village:base,
        exploration:{...player.factionState.exploration,discoveredFeaturesByTile:{[key]:landmark}}}}],
      enemies:[{id:'guardian',name:'守護者',x:13,y:10,hp:500,currentHp:500,worldId:'surface',victoryGuard:true,victoryLandmarkKey:key}]};
    const progress=()=>rules.getV39GuardianProgress(s,pid,key);
    const accept=id=>{const r=rules.acceptV39GuardianQuest(s,pid,key,id);ok(r.ok,`accept ${id}: ${r.reason}`);s=r.state;};
    const complete=()=>{const r=rules.completeV39GuardianQuest(s,pid,key);ok(r.ok,`complete: ${r.reason}`);s=r.state;};
    const definitions=rules.getV39GuardianQuestDefinitions();
    ok(definitions.length===3,'three sheet definitions');
    ok(definitions.find(d=>d.ID==='GUARDIAN_SUPPLY')?.required===100,'sheet amount');
    ok(!rules.listV39GuardianQuests(s,pid,key).some(d=>d.type==='hunt'),'empty hunt hidden');
    accept('GUARDIAN_SUPPLY');
    ok(!rules.acceptV39GuardianQuest(s,pid,key,'GUARDIAN_WATCH').ok,'one active quest');
    const poor={...s,players:s.players.map(p=>({...p,factionState:{...p.factionState,settlements:[{...base,materialStockByType:{木材:99}}],village:{...base,materialStockByType:{木材:99}}}}))};
    const failed=rules.completeV39GuardianQuest(poor,pid,key);
    ok(!failed.ok&&failed.state===poor,'insufficient payment atomic');
    const snapshot=JSON.parse(JSON.stringify(s));
    s=snapshot;complete();
    ok(progress().relation===35,'delivery relation');
    ok(s.players[0].factionState.settlements[0].materialStockByType.木材===200,'exact payment');
    const done=s;ok(!rules.completeV39GuardianQuest(s,pid,key).ok&&s===done,'duplicate complete');
    ok(!rules.acceptV39GuardianQuest(s,pid,key,'GUARDIAN_SUPPLY').ok,'completed unavailable');
    accept('GUARDIAN_WATCH');
    s=rules.advanceV39GuardianQuests(s,2);ok(progress().quest.progress===1,'watch step');
    s=rules.advanceV39GuardianQuests(s,2);ok(progress().quest.progress===1,'same turn idempotent');
    s={...s,players:s.players.map(p=>({...p,factionState:{...p.factionState,units:[{...unit,x:0,y:0}]}}))};
    s=rules.advanceV39GuardianQuests(s,3);ok(progress().quest.progress===0,'absent resets watch');
    s={...s,players:s.players.map(p=>({...p,factionState:{...p.factionState,units:[unit]}}))};
    for(let t=4;t<=6;t++)s=rules.advanceV39GuardianQuests(s,t);
    complete();ok(progress().relation===70,'watch relation');
    s={...s,enemies:[...s.enemies,...Array.from({length:5},(_,i)=>({id:`hunt-${i}`,race:'ウルフ',hp:50,currentHp:50,x:14+i,y:10,worldId:'surface',aggressive:true})),
      {id:'far',hp:50,x:30,y:30,aggressive:true},{id:'underground',hp:50,x:13,y:10,worldId:'cave:1',aggressive:true}]};
    accept('GUARDIAN_HUNT');ok(progress().quest.targetEnemyIds.length===3,'hunt max from sheet');
    ok(!progress().quest.targetEnemyIds.some(id=>['far','underground','guardian'].includes(id)),'hunt scope');
    ok(!rules.completeV39GuardianQuest(s,pid,key).ok,'living targets cannot report');
    const ids=new Set(progress().quest.targetEnemyIds);
    s={...s,enemies:s.enemies.map(e=>ids.has(e.id)?{...e,hp:0,currentHp:0,state:'死亡'}:e)};
    s=JSON.parse(JSON.stringify(s));complete();ok(progress().relation===100,'relation clamps at 100');
    ok(progress().completedEventIds.length===3,'three completion ids');
    // Pre-migration saves lack sheet snapshot fields; preserve their original payment and reward.
    let legacy={...snapshot,victoryLandmarksByTile:{[key]:{...landmark,guardianByPlayerId:{[pid]:{relation:0,completedEventIds:[],
      quest:{ID:'GUARDIAN_SUPPLY',名前:'旧依頼',type:'delivery',stockKind:'material',resourceKey:'木材',required:7,progress:0,completed:false}}}}}};
    const old=rules.completeV39GuardianQuest(legacy,pid,key);
    ok(old.ok&&rules.getV39GuardianProgress(old.state,pid,key).relation===35,'legacy reward');
    ok(old.state.players[0].factionState.settlements[0].materialStockByType.木材===293,'legacy quantity unchanged');
    window.setV39GameState({...snapshot},{reason:'guardian-sheet-fixture'});
    const map=window.__v39FieldRuntime.mapData;map.isUnderground=false;
    window.activateV39FooterTab('interaction');
    window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:13,y:10}}));
    const saved=window.exportV39SaveJson();window.importV39SaveJson(saved);
    ok(rules.getV39GuardianProgress(window.getV39GameState(),pid,key).quest.required===100,'real save snapshot');
    window.activateV39FooterTab('interaction');
    window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:13,y:10}}));
    return {failures};
  });
  assert.deepEqual(result.failures,[]);
  await page.locator('[data-world-action="guardian-complete"]').click();
  assert.equal(await page.evaluate(()=>{
    const s=window.getV39GameState();return s.victoryLandmarksByTile['13,10'].guardianByPlayerId[s.activePlayerId].relation;
  }),35);
  await page.screenshot({path:`${out}/${width}-completed.png`});
  await page.locator('[data-event-id="GUARDIAN_WATCH"]').click();
  await page.screenshot({path:`${out}/${width}-watch.png`});
  assert.deepEqual(errors,[]);
  console.log(`${width}: guardian sheet, payment, watch, hunt, legacy/save and UI passed`);
  await page.close();
}} finally {await browser.close();}
