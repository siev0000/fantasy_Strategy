import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const browser=await chromium.launch();
try{
 await mkdir('output/web-game/initial-subjects',{recursive:true});
 for(const width of [390,1100]){
  const page=await browser.newPage({viewport:{width,height:850}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
  const initial=await page.evaluate(async()=>{
   window.closeV39PlayModeSelection();await window.setV39TestMode(true);
   const random=Math.random;Math.random=()=>0.999;
   try{window.startV39LocalSession(1,{playMode:'single-normal',gameSettings:{npcFactionCount:2}});}finally{Math.random=random;}
   window.__v39PendingInitialSovereignProfile={playerId:'player-1',race:'悪魔',className:'ファイター',characterName:'奴隷住民検証',villageName:'魔族拠点'};
   const sovereign=window.consumeV39PendingInitialSovereignProfile();if(!sovereign?.ok)throw Error(sovereign?.reason);
   window.generateV39TestFieldWithSeed({w:60,h:60,patternId:'realistic'},'initial-subjects-production');
   const result=window.autoPlaceV39InitialBases('player-1');if(!result.ok)throw Error(result.reason);
   const s=window.getV39GameState(),classes=window.getGameDataRows('クラス'),races=window.getGameDataRows('勢力');
   const foodKeys=window.getGameDataRows('都市基本データ').filter(row=>row.分類==='食料').map(row=>row.データ分類);
   if(!foodKeys.length)throw Error('normal food definitions missing');
   if(window.getV39EconomyRules().initialFoodMaintenanceTurns!==10)throw Error('stale initial food setting');
   for(const player of s.players)for(const base of player.factionState.settlements.filter(v=>v.placed))for(const key of foodKeys){
    let required=0;
    for(const [race,population] of Object.entries(base.populationByRace)){
     const className=races.find(row=>row.種族===race)?.カナ||race,definition=classes.find(row=>row.名前===className);
     if(!definition)throw Error('population ability missing: '+race);
     const unitWeight=player.factionState.units.filter(u=>u.race===race&&u.hp>0&&u.settlementId===base.settlementId)
      .reduce((sum,u)=>sum+(['army','elite_army'].includes(u.combatProfile?.mode)?u.combatProfile.mode==='army'?4:5:1),0);
     const perPerson=Math.round(Number(definition?.[key]||0)*0.02*10)/10;
     required+=perPerson*(Number(population)+unitWeight)*10;
    }
    if(Number(base.foodStockByType[key])<Math.round(required*10)/10)throw Error(player.id+' insufficient initial '+key);
   }
   return s.players.map(p=>({id:p.id,race:p.race,base:p.factionState.settlements.find(v=>v.placed)}));
  });
  assert.equal(initial.length,3);
  for(const p of initial){
   const seed=p.base.initialSubjects;
   assert(seed&&seed.count>=10&&seed.count<=15,p.id+' did not get initial subjects');
   assert.equal(p.base.subjectPopulationByRace[seed.race],seed.count);
   assert(p.base.populationByRace[p.race]>0,'native population lost');
   assert.equal(p.base.population,Object.values(p.base.populationByRace).reduce((sum,n)=>sum+n,0));
  }
  await page.evaluate(()=>{window.activateV39FooterTab('settlement');window.renderV39SettlementPanel();});
  const controls=page.locator('[data-subject-population]');await controls.scrollIntoViewIfNeeded();
  page.once('dialog',dialog=>dialog.dismiss());await controls.locator('[data-subject-convert=魂]').click();
  const own=initial[0],seed=own.base.initialSubjects;
  assert.equal(await page.evaluate(race=>window.getV39GameState().players[0].factionState.settlements.find(v=>v.placed).subjectPopulationByRace[race],seed.race),seed.count);
  await controls.locator('[data-subject-count]').fill('2');
  page.once('dialog',dialog=>dialog.accept());await controls.locator('[data-subject-convert=魂]').click();
  page.once('dialog',dialog=>dialog.accept());await controls.locator('[data-subject-convert=死体]').click();
  const saved=await page.evaluate(()=>window.exportV39SaveJson(0));await page.evaluate(save=>window.importV39SaveJson(save),saved);
  const restored=await page.evaluate(()=>window.getV39GameState().players[0].factionState.settlements.find(v=>v.placed));
  assert.equal(restored.subjectPopulationByRace[seed.race],seed.count-3);
  assert.equal(restored.foodStockByType.魂,2);assert.equal(restored.foodStockByType.死体,1);
  assert.equal(restored.populationByRace.悪魔,own.base.populationByRace.悪魔);
  const npc=await page.evaluate(()=>{const s=window.getV39GameState(),turn=s.timeline.turnNumber+1;
   const result=window.runV39FactionAiTurn(s,turn,window.__v39FieldRuntime.mapData);
   return result.reports.map(r=>({id:r.playerId,commands:r.commands}));});
  assert(npc.every(r=>r.commands.some(command=>command.includes('奴隷住民')&&command.includes('死体'))),'real NPC pipeline omitted conversion');
  await page.locator('[data-subject-population]').scrollIntoViewIfNeeded();await page.screenshot({path:`output/web-game/initial-subjects/production-${width}.png`});
  assert.deepEqual(errors,[]);console.log(width,'normal new game: native/subject population, NPCs, UI conversion/cancel, save and real NPC action passed');
  await page.close();
 }
}finally{await browser.close();}
