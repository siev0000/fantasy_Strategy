import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/guardian-trials';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {for(const width of [390,1100]) {
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>typeof window.startV39GuardianTrialTest==='function');
  await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);await window.startV39GuardianTrialTest();});
  await page.waitForFunction(()=>!window.isV39MapInputLocked?.());
  const failures=await page.evaluate(async()=>{
    const r=await import('/src/lib/v39-guardian-quests.js'),fails=[],ok=(v,m)=>{if(!v)fails.push(m);};
    const original=window.getV39GameState(),pid=original.activePlayerId,key='13,10',map=window.__v39FieldRuntime.mapData;
    let s=structuredClone(original);
    const definitions=r.getV39GuardianQuestDefinitions(),stock=s.players[0].factionState.settlements[0].materialStockByType;
    ok(definitions.length===3,'three sheet definitions');
    const bundle=definitions.find(d=>d.type==='supplies');ok(bundle?.supplies.length===5,'five resources');
    const accept=id=>{const result=r.acceptV39GuardianQuest(s,pid,key,id,map);ok(result.ok,`accept ${id}: ${result.reason}`);s=result.state;};
    const complete=()=>{const result=r.completeV39GuardianQuest(s,pid,key);ok(result.ok,`complete: ${result.reason}`);s=result.state;};
    accept(bundle.ID);
    ok(!r.acceptV39GuardianQuest(s,pid,key,'GUARDIAN_TRIAL_POWER',map).ok,'one active quest');
    const poor=structuredClone(s);poor.players[0].factionState.settlements[0].materialStockByType.宝石=9;
    const failed=r.completeV39GuardianQuest(poor,pid,key);
    ok(!failed.ok&&failed.state===poor&&poor.players[0].factionState.settlements[0].materialStockByType.黒木===stock.黒木,'atomic bundle payment');
    s=JSON.parse(JSON.stringify(s));complete();
    ok(s.players[0].factionState.settlements[0].materialStockByType.宝石===stock.宝石-10,'exact payment');
    ok(!r.completeV39GuardianQuest(s,pid,key).ok&&!r.acceptV39GuardianQuest(s,pid,key,bundle.ID,map).ok,'no duplicate completion');
    accept('GUARDIAN_TRIAL_DEVELOPMENT');
    ok(!r.completeV39GuardianQuest(s,pid,key).ok,'unfinished villages');
    ok(r.getV39GuardianProgress(s,pid,key).quest.targetVillages.every(t=>t.initialFacilities===2),'fixed village baseline');
    const abandoned=structuredClone(s);abandoned.neutralVillages[0].abandoned=true;
    ok(!r.completeV39GuardianQuest(abandoned,pid,key).ok,'abandoned village');
    s={...s,neutralVillages:s.neutralVillages.map(v=>({...v,buildings:[...v.buildings,'伐採場']}))};complete();
    ok(!r.transferV39GuardianLand(s,pid,key).ok,'two trials and relation 70 insufficient');
    const crowded={...s,enemies:[...s.enemies,...Array.from({length:map.w*map.h},(_,i)=>({id:`occupant-${i}`,hp:10,x:i%map.w,y:Math.floor(i/map.w),worldId:'surface'}))]};
    const noRoom=r.acceptV39GuardianQuest(crowded,pid,key,'GUARDIAN_TRIAL_POWER',map);
    ok(!noRoom.ok&&noRoom.state===crowded,'blocked spawn is atomic');
    const minion={...s.enemies[0],id:'source-minion',race:'ウルフ',className:'ウルフ',strongMinion:true};
    const minionResult=r.acceptV39GuardianQuest({...s,enemies:[...s.enemies,minion]},pid,key,'GUARDIAN_TRIAL_POWER',map);
    ok(minionResult.ok&&minionResult.state.enemies.find(e=>e.guardianTrial)?.race==='ウルフ','minion preferred over unique guardian');
    accept('GUARDIAN_TRIAL_POWER');const enemy=s.enemies.find(e=>e.guardianTrial);
    ok(enemy?.level===30&&enemy.summon&&enemy.race==='タイガー','derived guardian summon');
    ok(!r.completeV39GuardianQuest(s,pid,key).ok,'living trial blocked');
    ok(!r.completeV39GuardianQuest({...s,enemies:s.enemies.filter(e=>e.id!==enemy.id)},pid,key).ok,'disappearance is not kill proof');
    s=r.recordV39GuardianTrialDefeats({...s,enemies:s.enemies.map(e=>e.id===enemy.id?{...e,hp:0,currentHp:0,state:'死亡'}:e)});
    ok(r.recordV39GuardianTrialDefeats(s)===s,'proof idempotent');
    s={...s,enemies:s.enemies.filter(e=>e.id!==enemy.id)};s=JSON.parse(JSON.stringify(s));complete();
    ok(r.getV39GuardianTrialStatus(s,pid,key).ready,'all three complete');
    ok(!r.getV39GuardianTrialStatus(s,'other-player',key).ready,'trial progress separated by player');
    const claim=r.transferV39GuardianLand(s,pid,key);ok(claim.ok&&claim.state.territoryOwnerByTile[key]===pid,'peaceful transfer');
    ok(!r.transferV39GuardianLand(claim.state,pid,key).ok,'transfer once');
    const developed={...original,neutralVillages:original.neutralVillages.map(v=>({...v,buildings:['墓地','農場','伐採場']}))};
    ok(!r.acceptV39GuardianQuest(developed,pid,key,'GUARDIAN_TRIAL_DEVELOPMENT',map).ok,'pre-developed villages');
    const legacy=structuredClone(original);
    legacy.victoryLandmarksByTile[key].guardianByPlayerId={[pid]:{relation:0,completedEventIds:[],quest:{ID:'GUARDIAN_SUPPLY',名前:'旧依頼',type:'delivery',stockKind:'material',resourceKey:'木材',required:7,completed:false}}};
    const old=r.completeV39GuardianQuest(legacy,pid,key);
    ok(old.ok&&r.getV39GuardianProgress(old.state,pid,key).relation===35,'legacy reward');
    ok(old.state.players[0].factionState.settlements[0].materialStockByType.木材===stock.木材-7,'legacy quantity');
    ok(!r.getV39GuardianTrialStatus(old.state,pid,key).ready,'old IDs cannot complete new trials');
    legacy.victoryLandmarksByTile[key].guardianByPlayerId[pid].quest={ID:'GUARDIAN_WATCH',type:'watch',required:3,progress:0,lastProgressTurn:1,range:3};
    let watch=r.advanceV39GuardianQuests(legacy,2);
    ok(r.getV39GuardianProgress(watch,pid,key).quest.progress===1&&r.advanceV39GuardianQuests(watch,2)===watch,'legacy watch same-turn guard');
    watch={...watch,players:watch.players.map(p=>({...p,factionState:{...p.factionState,units:[]}}))};
    watch=r.advanceV39GuardianQuests(watch,3);ok(r.getV39GuardianProgress(watch,pid,key).quest.progress===0,'legacy watch interruption');
    return fails;
  });
  assert.deepEqual(failures,[]);
  await page.screenshot({path:`${out}/${width}-choices.png`});
  await page.locator('[data-event-id="GUARDIAN_TRIAL_RESOURCES"]').click();
  await page.locator('[data-world-action="guardian-complete"]').click();
  await page.locator('[data-event-id="GUARDIAN_TRIAL_DEVELOPMENT"]').click();
  for(let i=0;i<5;i++) {
    await page.evaluate(async()=>window.advanceV39Turn({skipUnactedFocus:true}));
    await page.waitForFunction(()=>!window.isV39MapInputLocked?.());
  }
  const check=()=>page.evaluate(async()=>{const r=await import('/src/lib/v39-guardian-quests.js');const s=window.getV39GameState();return r.inspectV39GuardianQuest(s,s.activePlayerId,'13,10');});
  assert.equal((await check()).ready,true,'real village turn construction');
  await page.locator('[data-world-action="guardian-complete"]').click();
  await page.locator('[data-event-id="GUARDIAN_TRIAL_POWER"]').click();
  await page.evaluate(()=>{const saved=window.exportV39SaveJson();window.importV39SaveJson(saved);window.activateV39FooterTab('interaction');window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:13,y:10}}));});
  assert.equal(await page.evaluate(()=>window.getV39GameState().enemies.filter(e=>e.guardianTrial).length),1,'summon saved once');
  await page.screenshot({path:`${out}/${width}-trial.png`});
  const combat=await page.evaluate(()=>{
    const s=window.getV39GameState(),p=s.players[0],enemy=s.enemies.find(e=>e.guardianTrial),hero=p.factionState.units[0],point={x:enemy.x-1,y:enemy.y};
    const players=s.players.map(row=>({...row,factionState:{...row.factionState,units:row.factionState.units.map(u=>u.id===hero.id?{...u,...point,position:[point.x,point.y],ap:100,currentAp:100}:u)}}));
    window.__v39SuppressCombatEffects=true;
    window.setV39GameState({players,enemies:s.enemies.map(e=>e.id===enemy.id?{...e,hp:1,currentHp:1}:e)},{reason:'trial-combat-test',trackUnitDeaths:false});
    return {skillRow:hero.techniques.find(row=>row.action==='A'&&row.source?.攻撃手段)?.source,targetUnitId:enemy.id,playerId:p.id,attackerId:hero.id};
  });
  assert(combat.skillRow,'hero attack available');
  for(let attempt=0;attempt<12;attempt++) {
    if((await check()).ready)break;
    await page.evaluate(params=>{const random=Math.random;try{Math.random=()=>0;return window.executeV39FactionCombatAction({...params,apPaid:true});}finally{Math.random=random;}},combat);
  }
  assert.equal((await check()).ready,true,'combat/death lifecycle proof');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:13,y:10}})));
  await page.locator('[data-world-action="guardian-complete"]').click();
  await page.locator('[data-world-action="guardian-transfer"]').click();
  assert.equal(await page.evaluate(()=>{const s=window.getV39GameState();return s.victoryLandmarksByTile['13,10'].peacefulOwnerPlayerId===s.activePlayerId;}),true,'UI peaceful claim');
  assert.equal(await page.evaluate(()=>window.getV39GameState().victory?.completed===true),false,'claim is not immediate victory');
  await page.screenshot({path:`${out}/${width}-claimed.png`});
  for(let i=0;i<5;i++) {
    await page.evaluate(async()=>window.advanceV39Turn({skipUnactedFocus:true}));
    await page.waitForFunction(()=>!window.isV39MapInputLocked?.());
  }
  assert.equal(await page.evaluate(()=>{const s=window.getV39GameState();return s.victory?.completed&&s.victory.winnerPlayerId===s.activePlayerId;}),true,'five secure turns to victory');
  await page.screenshot({path:`${out}/${width}-victory.png`});
  assert.deepEqual(errors,[]);
  console.log(`${width}: three trials, atomic resources, development, combat, legacy/save, peaceful claim passed`);
  await page.close();
}} finally {await browser.close();}
