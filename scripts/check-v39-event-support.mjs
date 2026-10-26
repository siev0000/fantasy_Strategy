import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/event-support';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{for(const width of [390,1100]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.startV39VillagePlanTest);
  await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);await window.startV39VillagePlanTest();});
  const failures=await page.evaluate(async()=>{
    const r=await import('/src/lib/v39-neutral-village-rules.js'),goals=await import('/src/lib/v39-village-support-goals.js');
    const {findV39VillageQuest:find}=await import('/src/lib/v39-village-quest-log.js');
    const {getGameDataRows}=await import('/src/lib/game-data-registry.js');
    const {getV39GuardianLandSettings:settings,chooseV39VictoryGuardian:choose}=await import('/src/lib/v39-victory-guardian-candidates.js');
    const original=window.getV39GameState(),pid=original.activePlayerId,map=window.__v39FieldRuntime.mapData,failures=[];
    const ok=(v,m)=>{if(!v)failures.push(m);};
    const setup=(sample,eventId)=>{
      let s=structuredClone(original);const village=s.neutralVillages.find(v=>v.planTestKey===sample);
      s.players[0].factionState.units=s.players[0].factionState.units.map(u=>({...u,x:village.x,y:village.y}));
      const result=r.acceptV39NeutralVillageQuest(s,pid,village.id,map,eventId);ok(result.ok,`${eventId} accept: ${result.reason}`);
      return {s:result.state,vid:village.id};
    };
    let {s,vid}=setup('guard','VILLAGE_SUPPORT_DEFENSE');
    for(let turn=2;turn<=4;turn++)s=r.advanceV39NeutralVillages({...s,timeline:{...s.timeline,turnNumber:turn}},map,turn).state;
    ok(r.completeV39NeutralVillageQuest(s,pid,vid,{eventId:'VILLAGE_SUPPORT_DEFENSE'}).ok,'watch real turns');
    let a=setup('cemetery','VILLAGE_SUPPORT_CONSTRUCTION');s=a.s;vid=a.vid;
    ok(!r.completeV39NeutralVillageQuest(s,pid,vid,{eventId:'VILLAGE_SUPPORT_CONSTRUCTION'}).ok,'construction not already completed');
    s.neutralVillages=s.neutralVillages.map(v=>v.id===vid?{...v,materialStockByType:{...v.materialStockByType,木材:1000}}:v);
    for(let turn=2;turn<=10;turn++)s=r.advanceV39NeutralVillages({...s,timeline:{...s.timeline,turnNumber:turn}},map,turn).state;
    ok(r.completeV39NeutralVillageQuest(s,pid,vid,{eventId:'VILLAGE_SUPPORT_CONSTRUCTION'}).ok,'construction actual facility completion');
    a=setup('guard','TPL_VILLAGE_COMPOSITE');s=a.s;vid=a.vid;
    let village=s.neutralVillages.find(v=>v.id===vid),quest=find(village,pid,'TPL_VILLAGE_COMPOSITE');
    ok(quest?.supportGoals?.length===2,'two frozen goals');
    village={...village,buildings:[...village.buildings,quest.supportGoals.find(g=>g.type==='construction').facilityName]};
    s={...s,neutralVillages:s.neutralVillages.map(v=>v.id===vid?village:v)};
    ok(!r.completeV39NeutralVillageQuest(s,pid,vid,{eventId:'TPL_VILLAGE_COMPOSITE'}).ok,'all composite conditions required');
    for(let turn=2;turn<=4;turn++)s=r.advanceV39NeutralVillages({...s,timeline:{...s.timeline,turnNumber:turn}},map,turn).state;
    ok(r.completeV39NeutralVillageQuest(s,pid,vid,{eventId:'TPL_VILLAGE_COMPOSITE'}).ok,'composite complete');
    a=setup('food','TPL_VILLAGE_CONTRACT');s=a.s;vid=a.vid;const contract=find(s.neutralVillages.find(v=>v.id===vid),pid,'TPL_VILLAGE_CONTRACT');
    ok(contract?.period===5&&contract.required===3&&contract.grace===3,'sheet timing');
    ok(!r.completeV39NeutralVillageQuest(s,pid,vid,{eventId:contract.eventId}).ok,'early payment blocked');
    const late={...s,timeline:{...s.timeline,turnNumber:10}},resumed=r.completeV39NeutralVillageQuest(late,pid,vid,{eventId:contract.eventId});
    ok(resumed.ok&&find(resumed.state.neutralVillages.find(v=>v.id===vid),pid,contract.eventId).nextDueTurn===15,'overdue manual restart');
    const poor=structuredClone(s);poor.timeline.turnNumber=6;poor.players[0].factionState.settlements.find(b=>b.id===poor.players[0].factionState.selectedSettlementId).foodStockByType[contract.resourceKey]=0;
    const failed=r.completeV39NeutralVillageQuest(poor,pid,vid,{eventId:contract.eventId});ok(!failed.ok&&failed.state===poor,'shortage atomic');
    for(const turn of [6,11,16]){
      s={...s,timeline:{...s.timeline,turnNumber:turn}};
      if(turn===16){
        const unpaid=structuredClone(s);find(unpaid.neutralVillages.find(v=>v.id===vid),pid,contract.eventId).rewardTerms=[{kind:'resource',name:'金',amount:1000000000}];
        const failedReward=r.completeV39NeutralVillageQuest(unpaid,pid,vid,{eventId:contract.eventId});
        ok(!failedReward.ok&&failedReward.state===unpaid,'final reward failure rolls back last payment');
      }
      const result=r.completeV39NeutralVillageQuest(s,pid,vid,{eventId:contract.eventId});ok(result.ok,`period ${turn}: ${result.reason}`);s=result.state;
      if(turn<16)ok(!r.completeV39NeutralVillageQuest(s,pid,vid,{eventId:contract.eventId}).ok,'same period once');
      s=JSON.parse(JSON.stringify(s));
    }
    ok(find(s.neutralVillages.find(v=>v.id===vid),pid,contract.eventId).completed,'contract final report');
    ok(!r.completeV39NeutralVillageQuest(s,pid,vid,{eventId:contract.eventId}).ok,'no duplicate final reward');
    for(const land of getGameDataRows('勝利対象土地')){
      const info=settings({landmarkId:land.ID});ok(info.bossLevel===40&&info.minionCount===2&&info.trialIds.length===3,'sheet guardian settings');
      const classes=new Set(getGameDataRows('クラス').map(c=>c.名前));
      const used=land.守護者候補.map(c=>({hp:100,guardianSpeciesName:c.name}));
      ok(!choose({landmarkId:land.ID},{enemies:[],players:[],explorationWorlds:{other:{spatial:{enemies:used}}}},classes,'test'),'unique across stored worlds');
    }
    return failures;
  });
  assert.deepEqual(failures,[]);
  await page.evaluate(()=>window.focusV39VillagePlanTest('guard'));
  await page.locator('[data-world-action="village-menu"]').click();
  await page.locator('[data-hub-tab="quests"]').click();
  const checks=page.locator('[data-hub-quest="VILLAGE_SUPPORT_DEFENSE"], [data-hub-quest="TPL_VILLAGE_COMPOSITE"]');
  assert.equal(await checks.count(),2);for(const check of await checks.all())await check.check();
  await page.locator('[data-hub-primary]').click();
  assert.equal(await page.evaluate(async()=>{const {getV39VillageQuests}=await import('/src/lib/v39-village-quest-log.js');const s=window.getV39GameState();return getV39VillageQuests(s.neutralVillages.find(v=>v.planTestKey==='guard'),s.activePlayerId).filter(q=>q.accepted&&!q.completed).length;}),2,'batch accepted both support quests');
  await page.screenshot({path:`${out}/${width}-support.png`});
  await page.evaluate(()=>{window.closeV39VillageMenu();window.focusV39VillagePlanTest('food');});
  await page.locator('[data-world-action="village-menu"]').click();await page.locator('[data-hub-tab="quests"]').click();
  await page.locator('[data-hub-quest="TPL_VILLAGE_CONTRACT"]').check();await page.locator('[data-hub-primary]').click();
  await page.evaluate(()=>{const json=window.exportV39SaveJson();window.importV39SaveJson(json);});
  assert.equal(await page.evaluate(async()=>{const {findV39VillageQuest}=await import('/src/lib/v39-village-quest-log.js');const s=window.getV39GameState();return findV39VillageQuest(s.neutralVillages.find(v=>v.planTestKey==='food'),s.activePlayerId,'TPL_VILLAGE_CONTRACT')?.period;}),5,'contract restored from real save');
  await page.screenshot({path:`${out}/${width}-contract-save.png`});
  assert.deepEqual(errors,[]);console.log(`${width}: support/composite/contract timing, failure atomicity, source guardians, batch UI/save passed`);
  await page.close();
}}finally{await browser.close();}
