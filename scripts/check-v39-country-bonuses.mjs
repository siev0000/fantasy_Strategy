import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const source=readFileSync(new URL('../frontend/src/lib/v39-country-bonuses.js',import.meta.url),'utf8');
const {normalizeV39CountryBonuses:normalize,resolveV39CountrySummonBonus:summonBonus}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
assert.deepEqual(normalize(),{happiness:0,heroLimit:0,summonLevel:0,summonLevelByFamily:{}});
assert.deepEqual(normalize({happiness:-8,heroLimit:-2,summonLevel:'bad',summonLevelByFamily:['火精霊']}),{happiness:-8,heroLimit:0,summonLevel:0,summonLevelByFamily:{}});
assert.equal(summonBonus({factionState:{countryBonuses:{summonLevel:2,summonLevelByFamily:{火精霊:3}}}},'火精霊'),5);
const out='output/web-game/country-bonuses';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];
 page.on('pageerror',error=>errors.push(String(error.stack)));
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>typeof window.startV39CallTest==='function');
 const result=await page.evaluate(async()=>{
  window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39CallTest();window.setV39RitualTestStage(1);
  const {createPlayerFactionState,PLAYER_FACTION_STATE_KEYS}=await import('/src/lib/player-state.js');
  const {getV39CountryBonuses}=await import('/src/lib/v39-country-bonuses.js');
  const {getFactionSettlements}=await import('/src/lib/settlement-state.js');
  const {inspectV39UnitCreation}=await import('/src/lib/v39-unit-creation-rules.js');
  const ritual=await import('/src/lib/v39-ritual-facilities.js');
  const facility=await import('/src/lib/v39-facility-summoning.js');
  const {advanceV39EconomyTurn}=await import('/src/lib/v39-economy-rules.js');
  const {resolveV39CivicTurn}=await import('/src/lib/v39-civic-rules.js');
  const save=await import('/src/v39/core/v39-save-system.js');
  const state=window.getV39GameState(),id=state.activePlayerId,owner=state.players.find(p=>p.id===id),map=window.__v39FieldRuntime.mapData;
  const failures=[],ok=(value,message)=>{if(!value)failures.push(message);};
  const zero=getV39CountryBonuses(owner),bonus={happiness:10,heroLimit:2,summonLevel:1,summonLevelByFamily:{火精霊:2}};
  ok(zero.happiness===0&&zero.heroLimit===0&&zero.summonLevel===0,'default nonzero');
  const boosted={...owner,factionState:createPlayerFactionState({...owner.factionState,countryBonuses:bonus},id)};
  const boostedState={...state,players:state.players.map(p=>p.id===id?boosted:p)};
  ok(PLAYER_FACTION_STATE_KEYS.includes('countryBonuses'),'country bonus excluded from state keys');
  for(const mode of ['normal','army']){
   const request={className:'ファイター',mode};
   const before=inspectV39UnitCreation(state,owner,request),after=inspectV39UnitCreation(boostedState,boosted,request);
   ok(after.cap===before.cap+(mode==='normal'?2:0),`${mode} cap bonus`);
   ok(after.village.heroBirthUnlock===before.village.heroBirthUnlock,'bonus incorrectly creates hero birth unlock');
  }
  for(const target of ['フレイムエレメンタル','アースエレメンタル'])for(const facilitySummon of [false,true]){
   const before=ritual.resolveV39RitualSummonEffects(owner,target,null,{facilitySummon,baseLevel:5});
   const after=ritual.resolveV39RitualSummonEffects(boosted,target,null,{facilitySummon,baseLevel:5});
   const extra=target==='フレイムエレメンタル'?3:1;
   ok(after.bonusLevel===before.bonusLevel+extra&&after.countryBonus===extra,'summon country/family additive');
   ok(after.maximumLevel===before.maximumLevel,'country bonus changed eligibility');
  }
  const slot=facility.getV39FacilitySummonSlots(state,id).find(s=>s.row.召喚系統==='火精霊');
  const before=facility.inspectV39FacilitySummon(state,id,slot.id,'フレイムエレメンタル',map);
  const after=facility.inspectV39FacilitySummon(boostedState,id,slot.id,'フレイムエレメンタル',map);
  ok(after.preview.level===before.preview.level+3,'actual facility preview level');
  ok(after.goldCost===before.goldCost+6,'summon fee follows boosted level');
  const summoned=facility.summonV39FacilityUnit(boostedState,id,slot.id,'フレイムエレメンタル',map,after.tiles[0]);
  ok(summoned.ok&&summoned.unit.level===after.preview.level,'actual generated unit missing country level');
  const base=getFactionSettlements(owner.factionState)[0];
  const village={...base,populationByRace:{只人:20},civicState:{...base.civicState,lastProcessedTurn:0}};
  const civic=resolveV39CivicTurn(village,1,[],{names:[],bonus:0},{},{happiness:10});
  const baseline=resolveV39CivicTurn(village,1);
  ok(civic.happinessTargetByRace.只人===Math.min(100,baseline.happinessTargetByRace.只人+10),'happiness target bonus');
  ok(civic.modifiers.countryHappiness===10,'happiness breakdown');
  const negative=resolveV39CivicTurn(village,1,[],{names:[],bonus:0},{},{happiness:-10});
  ok(negative.happinessTargetByRace.只人===Math.max(0,baseline.happinessTargetByRace.只人-10),'negative happiness');
  const next={...boostedState,timeline:{...state.timeline,turnNumber:state.timeline.turnNumber+1}};
  const economy=advanceV39EconomyTurn(next,map).state;
  ok(getFactionSettlements(economy.players.find(p=>p.id===id).factionState).every(v=>!v.placed||v.civicState.modifiers.countryHappiness===10),'real economy turn missing country bonus');
  window.setV39GameState(economy);
  const serialized=save.exportV39SaveJson();save.importV39SaveJson(serialized);
  const restored=window.getV39GameState().players.find(p=>p.id===id);
  ok(JSON.stringify(getV39CountryBonuses(restored))===JSON.stringify(bonus),'save/load loses country bonuses');
  ok(getV39CountryBonuses(owner).happiness===0,'input player mutated');
  ok(getV39CountryBonuses(createPlayerFactionState({})).happiness===0,'old save default');
  return {failures,bonus:getV39CountryBonuses(restored),level:after.preview.level,baselineLevel:before.preview.level};
 });
 assert.deepEqual(result.failures,[]);await page.waitForTimeout(400);
 await page.screenshot({path:`${out}/loaded.png`});assert.deepEqual(errors,[]);console.log(JSON.stringify(result));
}finally{await browser.close();}
