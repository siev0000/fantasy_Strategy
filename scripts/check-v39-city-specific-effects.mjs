import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/city-specific-effects';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e.stack)));
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
 const result=await page.evaluate(async()=>{
  window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39CallTest();window.setV39RitualTestStage(1);
  const city=await import('/src/lib/v39-city-specialization-rules.js');
  const eco=await import('/src/lib/v39-economy-rules.js');
  const {getFactionSettlements}=await import('/src/lib/settlement-state.js');
  const {researchExperiencePerTurn}=await import('/src/lib/research-progress.js');
  const {researchTreeData}=await import('/src/lib/research-tree-config.js');
  const {inspectV39RecruitTraining}=await import('/src/lib/v39-recruit-training.js');
  const {inspectV39UnitCreation}=await import('/src/lib/v39-unit-creation-rules.js');
  const {resolveV39UnitCargoCapacity}=await import('/src/lib/v39-logistics-state.js');
  const {tradeCapacity,tradeSpeed}=await import('/src/lib/v39-trade-state.js');
  const {resolveV39NegotiationSkill}=await import('/src/lib/v39-negotiation-rules.js');
  const {advanceV39Purification}=await import('/src/lib/v39-purification-rules.js');
  const ritual=await import('/src/lib/v39-ritual-facilities.js');
  const facility=await import('/src/lib/v39-facility-summoning.js');
  const summon=await import('/src/lib/v39-summon-rules.js');
  const save=await import('/src/v39/core/v39-save-system.js');
  const state=window.getV39GameState(),owner=state.players.find(p=>p.id===state.activePlayerId),base=getFactionSettlements(owner.factionState)[0],map=window.__v39FieldRuntime.mapData;
  const failures=[],ok=(v,msg)=>{if(!v)failures.push(msg);},near=(a,b)=>Math.abs(a-b)<.01;
  const make=(name)=>({...base,citySpecializationId:name,cityTraits:['test-none'],scaleLevel:3});
  const player=(name)=>({...owner,factionState:{...owner.factionState,settlements:[make(name)],selectedSettlementId:base.settlementId}});
  for(const [name,skill] of [['農業都市','農業'],['産業都市','工業'],['水上都市','漁業']]){
   const p=player(name),before=eco.resolveV39SettlementProductionMetrics(null,null,make(''));
   const after=eco.resolveV39SettlementProductionMetrics(null,p,make(name));
   ok(after.skills[skill]===before.skills[skill]+25,`${name} skill +25`);
   ok(city.resolveV39CitySpecializationModifiers(make(name)).foodMultiplier===1&&city.resolveV39CitySpecializationModifiers(make(name)).materialMultiplier===1,'old multiplier double bonus');
  }
  const scholar={id:'scholar',level:100,settlementId:base.settlementId,skillLevels:{魔術:0},hp:100};
  const magic=city.resolveV39CityUnitModifiers(player('魔法都市'),scholar),academic=city.resolveV39CityUnitModifiers(player('学術都市'),scholar);
  const raw=researchExperiencePerTurn(scholar,'魔法',researchTreeData);
  ok(researchExperiencePerTurn(scholar,'魔法',researchTreeData,null,magic)===Math.floor(raw*1.25),'magic research skill bonus');
  ok(researchExperiencePerTurn(scholar,'魔法',researchTreeData,null,academic)===Math.floor(raw*1.15),'all research exp bonus');
  ok(scholar.skillLevels.魔術===0,'city mutated unit skills');
  const trainingUnit={race:'只人',className:'ファイター',level:10};
  const train=inspectV39RecruitTraining({units:[]},make('軍事都市'),trainingUnit);
  ok(train.expPerTurn===250,'military training EXP +25%');
  const p=player('軍事都市'),plain=player('');
  const cap=(p,mode)=>inspectV39UnitCreation({...state,players:[p]},p,{mode,className:'ファイター'}).cap;
  ok(cap(p,'army')===cap(plain,'army')+2,'army cap +2');ok(cap(p,'normal')===cap(plain,'normal'),'army bonus changed hero cap');
  const carrier={...scholar,id:'carrier',status:{SIZ:170,攻撃:0},skillLevels:{交渉:10,威圧:10}};
  const trader=player('交易都市');trader.factionState.units=[carrier];const ts={...state,players:[trader]};
  ok(resolveV39UnitCargoCapacity(carrier,ts)===125,'cargo +25%');
  ok(tradeCapacity([carrier],ts)===125&&near(tradeSpeed([carrier],150,ts),.8),'trade load/speed shared bonus');
  ok(resolveV39NegotiationSkill(ts,trader.id,carrier,'交渉')===35,'trade negotiation +25');
  ok(resolveV39NegotiationSkill(ts,trader.id,carrier,'威圧')===10,'city changed intimidation');
  const foreign={...carrier,id:'foreign'};
  ok(resolveV39UnitCargoCapacity(foreign,ts)===100,'cargo bonus leaked to foreign unit');
  const cityOwner=player('魔法都市'),sample={総Lv:10,クラス構成:'フレイムエレメンタル_10'};
  const a=ritual.resolveV39RitualSummonEffects(owner,'フレイムエレメンタル',sample,{baseLevel:10});
  const b=ritual.resolveV39RitualSummonEffects(cityOwner,'フレイムエレメンタル',sample,{baseLevel:10});
  ok(b.cityBonus===1&&b.bonusLevel===a.bonusLevel+1,'city summon +1');
  const slot=facility.getV39FacilitySummonSlots(state,owner.id).find(s=>s.row.召喚系統==='火精霊');
  const cs={...state,players:state.players.map(p=>p.id===owner.id?cityOwner:p)};
  const before=facility.inspectV39FacilitySummon(state,owner.id,slot.id,'フレイムエレメンタル',map);
  const after=facility.inspectV39FacilitySummon(cs,owner.id,slot.id,'フレイムエレメンタル',map);
  ok(after.preview.level===before.preview.level+1&&after.goldCost===before.goldCost+2,'facility city level/cost');
  const caster=cityOwner.factionState.units.find(u=>summon.getV39SummonEntries(u).some(e=>e.catalog));
  if(caster){const entry=summon.getV39SummonEntries(caster).find(e=>e.catalog);const check=summon.inspectV39Summon(cs,owner.id,caster.id,entry.row.名前,map);ok(check.facility.cityBonus===1,'skill summon city bonus');}
  else failures.push('missing summon test caster');
  const holy=player('信仰都市');holy.factionState.units=[];
  const ps={...state,players:[holy],activeWorldId:'surface',enemies:[],neutralVillages:[],groundLootByTile:{},territoryOwnerByTile:{'1,1':holy.id},territoryStateByTile:{'1,1':{settlementId:base.settlementId}}};
  const pm={w:3,h:3,grid:Array.from({length:3},()=>Array(3).fill('平地')),purificationByTile:{'1,1':0,'2,2':0}};
  advanceV39Purification(pm,ps,1,()=>1);ok(pm.purificationByTile['1,1']===2&&pm.purificationByTile['2,2']===0,'city purification scoped +2');
  advanceV39Purification(pm,ps,1,()=>1);ok(pm.purificationByTile['1,1']===2,'purification applied twice');
  const healer={...owner.factionState.units[0],id:'healer',name:'回復検証',settlementId:base.settlementId,x:base.x,y:base.y,hp:50,currentHp:50,maxHp:100,status:{HP:100,SIZ:170},lastMovedTurn:0,lastCombatTurn:0,starvationStage:0};
  const resting={...make('信仰都市'),buildings:[],tileFacilityMap:{},facilityStateByTile:{}};
  const hpState={...state,explorationWorlds:{},enemies:[],neutralVillages:[],victory:null,timeline:{...state.timeline,turnNumber:1,phase:'player'},
   players:[{...owner,factionState:{...owner.factionState,exploration:{},units:[healer],unitTrainingQueue:[],settlements:[resting],research:{},squads:[],logisticsRoutes:[]}}],
   territoryOwnerByTile:{[`${base.x},${base.y}`]:owner.id},territoryStateByTile:{[`${base.x},${base.y}`]:{settlementId:base.settlementId,hp:100,maxHp:100}}};
  window.setV39GameState(hpState);await window.advanceV39Turn({skipUnactedFocus:true});
  const healed=window.getV39GameState().players[0].factionState.units.find(u=>u.id==='healer');
  const expectedHp=50+Math.max(1,Math.floor(healed.maxHp*.07));
  ok(healed.hp===expectedHp,`real turn recovery +2 expected${expectedHp} got${healed.hp}`);
  const encoded=save.exportV39SaveJson();save.importV39SaveJson(encoded);
  ok(window.getV39GameState().players[0].factionState.settlements[0].citySpecializationId==='信仰都市','city effects save/load');
  return {failures,training:train.expPerTurn,research:raw,healedHp:healed.hp};
 });
 assert.deepEqual(result.failures,[]);await page.screenshot({path:`${out}/verified.png`});assert.deepEqual(errors,[]);console.log(JSON.stringify(result));
}finally{await browser.close();}
