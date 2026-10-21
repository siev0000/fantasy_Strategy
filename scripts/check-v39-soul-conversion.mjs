import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1100,height:850}});
const errors=[];
page.on('pageerror',error=>errors.push(String(error)));
try {
  await page.goto(process.env.V39_POLICY_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>typeof window.runV39FactionAiTurn==='function');
  await page.evaluate(()=>window.closeV39PlayModeSelection());
  const checks=await page.evaluate(async()=>{
    const {resolveV39ImmediateSoulAmount:amount}=await import('/src/lib/v39-soul-conversion.js');
    const {receiveV39VillageSacrifice:receive}=await import('/src/lib/v39-village-sacrifice.js');
    const {payV39QuestReward}=await import('/src/lib/v39-quest-rewards.js');
    const {selectV39NpcResourceObjective:select,executeV39NpcResourceObjective:execute}=await import('/src/lib/v39-npc-resource-policy.js');
    const config={enabled:true,receiverClassNames:['エンジェル','デヴィル'],soulsPerPerson:1};
    const ok=(value,message)=>{if(!value)throw new Error(message);};
    for(const race of ['天使','エンジェル','悪魔','デヴィル'])ok(amount({race},3)===3,`${race}の変換がない`);
    ok(amount({race:'只人'},3)===0,'人族まで変換');
    ok(amount({race:'悪魔'},3,{...config,enabled:false})===0,'OFFが無効');
    ok(amount({race:'悪魔'},3,{...config,soulsPerPerson:2})===6,'比率を変更できない');
    const actor={id:'actor',name:'受取役',race:'デヴィル',x:4,y:4,worldId:'surface',squadId:'solo',hp:100,ap:100};
    const donor={id:'sacrifice',name:'生贄',race:'只人',hp:1,state:'拘束',equipment:[{slot:'武器1',name:'剣'}]};
    const npc={id:'npc',race:'悪魔',isPlayer:false,factionState:{units:[actor],squads:[{id:'solo',unitIds:['actor']}],
      soulStorage:[{id:'stored-soul'}],settlements:[{id:'bank',settlementId:'bank',placed:true,name:'拠点',x:2,y:2,population:10,
        populationByRace:{悪魔:10},foodStockByType:{魂:0}}],selectedSettlementId:'bank',aiState:{},exploration:{}}};
    const village={id:'v',name:'契約村',x:5,y:4,population:20,populationByRace:{只人:20},
      sacrificeContract:{active:true,playerId:'npc'},heldUnits:[{kind:'captive',ownerPlayerId:'human',unit:donor}]};
    const state={activeWorldId:'surface',activePlayerId:'human',timeline:{turnNumber:2,phase:'resolution'},
      players:[npc],neutralVillages:[village],settlements:[village]};
    const objective=select(state,npc);
    ok(objective.type==='resource-receive','契約先の受取を選ばない');
    const result=execute(state,'npc',objective,2);
    ok(result.command.includes('魂へ即時変換 +1'),'NPCが即時変換しない');
    const faction=result.state.players[0].factionState;
    const cargo=faction.squads[0].cargoByUnitId.actor;
    ok(cargo.resourcesByType.魂===1,'魂が部隊荷物に入らない');
    ok(cargo.equipmentInventory[0].item.name==='剣','元の装備を失う');
    ok(faction.soulStorage.length===1,'保管魂を変更');
    ok(!faction.villagePrisoners.length,'変換した捕虜も保持');
    ok(!result.state.neutralVillages[0].heldUnits.length,'供給元を消費しない');
    ok(faction.settlements[0].foodStockByType.魂===0,'拠点へ瞬間輸送');
    ok(!execute(result.state,'npc',objective,2),'二重受取');
    const repeated=structuredClone(result.state);repeated.neutralVillages[0].heldUnits=village.heldUnits;
    ok(!receive(repeated,'npc','v',{aiTurn:true}).ok,'同じ対象を再変換');
    const off=receive(state,'npc','v',{aiTurn:true,conversion:{...config,enabled:false}});
    ok(off.ok&&off.soulAmount===0&&off.state.players[0].factionState.villagePrisoners.length===1,'OFF時に捕虜保持へ戻らない');
    const human=structuredClone(state);human.players[0].race='只人';
    ok(receive(human,'npc','v',{aiTurn:true}).soulAmount===0,'人族が魂へ変換');
    const angel=structuredClone(state);angel.players[0].race='天使';
    ok(receive(angel,'npc','v',{aiTurn:true}).soulAmount===1,'天使が受取変換できない');
    const undead=structuredClone(state);undead.neutralVillages[0].heldUnits[0].unit.race='ゾンビ';
    ok(receive(undead,'npc','v',{aiTurn:true}).soulAmount===0,'アンデッドで魂を再生産');
    const collected=structuredClone(state);collected.neutralVillages[0].heldUnits[0].unit.soulCollected=true;
    ok(receive(collected,'npc','v',{aiTurn:true}).soulAmount===0,'回収済みの魂を再生産');
    const far=structuredClone(state);far.players[0].factionState.units[0].x=0;
    ok(!receive(far,'npc','v',{aiTurn:true}).ok,'遠隔受取');
    const reward={kind:'population',name:'只人',amount:2};
    const paid=payV39QuestReward(state,'npc','v',reward);
    ok(paid.ok&&paid.state.players[0].factionState.settlements[0].foodStockByType.魂===2,'人口報酬を魂へ変換しない');
    ok(paid.state.players[0].factionState.settlements[0].population===10&&paid.state.neutralVillages[0].population===18,'人口と魂を二重加算');
    const normal=payV39QuestReward(human,'npc','v',reward);
    ok(normal.state.players[0].factionState.settlements[0].population===12,'通常人口報酬を壊した');
    return {npcCommand:result.command,offPrisoners:off.state.players[0].factionState.villagePrisoners.length};
  });
  console.log(JSON.stringify({checks},null,2));
  await page.goto(process.env.V39_POLICY_RUNTIME_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>typeof window.runV39FactionAiTurn==='function');
  await page.evaluate(()=>window.closeV39PlayModeSelection());
  await page.evaluate(async()=>{
    await window.setV39TestMode(true);window.startV39VillageIncidentTest();
    const s=window.getV39GameState(),npc=s.players[1],v=s.neutralVillages.find(v=>v.incidentTest);
    window.setV39GameState({activePlayerId:npc.id,players:s.players.map(p=>p.id!==npc.id?p:{...p,race:'天使'}),
      timeline:{...s.timeline,phase:'player',activeTurnPlayerId:npc.id},
      neutralVillages:[{...v,sacrificeContract:{active:true,playerId:npc.id},heldUnits:[{kind:'captive',ownerPlayerId:s.players[0].id,
        unit:{id:'test-offered-unit',name:'提供される住民',race:'只人',hp:1,state:'拘束',equipment:[{slot:'武器1',name:'剣'}]}}]}]});
    window.openV39VillageMenu(v.id);
  });
  await page.locator('[data-hub-talk=sacrifice-receive]').click();
  await page.locator('[data-hub-primary]').click();
  await page.waitForFunction(()=>window.getV39GameState().players[1].factionState.sacrificeReceiptHistory?.length===1);
  await mkdir('output/web-game/soul-conversion',{recursive:true});
  await page.screenshot({path:'output/web-game/soul-conversion/receive-1100.png'});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'output/web-game/soul-conversion/receive-390.png'});
  const saved=await page.evaluate(()=>{
    const s=window.getV39GameState(),p=s.players[1];
    const soul=p.factionState.squads[0].cargoByUnitId[p.factionState.units[0].id].resourcesByType.魂;
    window.importV39SaveJson(window.exportV39SaveJson(0));
    const f=window.getV39GameState().players[1].factionState;
    if(f.sacrificeReceiptHistory.length!==1||f.squads[0].cargoByUnitId[f.units[0].id].resourcesByType.魂!==soul)throw new Error('受取履歴/魂の保存読込失敗');
    return {soul,history:f.sacrificeReceiptHistory};
  });
  assert.equal(saved.soul,1);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({saved,errors},null,2));
  const npc=await page.evaluate(()=>{
    window.closeV39VillageMenu();window.startV39VillageIncidentTest();
    const s=window.getV39GameState(),p=s.players[1],v=s.neutralVillages.find(v=>v.incidentTest);
    window.setV39GameState({players:s.players.map(row=>row.id!==p.id?row:{...row,isPlayer:false,
      factionState:{...row.factionState,aiState:{lastProcessedTurn:0}}}),
      neutralVillages:[{...v,sacrificeContract:{active:true,playerId:p.id},heldUnits:[{kind:'corpse',ownerPlayerId:s.players[0].id,
        unit:{id:'npc-offered',name:'渡された遺体',race:'只人',hp:0,state:'死亡',equipment:[]}}]}],
      timeline:{...s.timeline,phase:'resolution',turnNumber:2},victoryLandmarksByTile:{},groundLootByTile:{}});
    window.dispatchEvent(new CustomEvent('v39:turn-stage-ai',{detail:{turnNumber:2}}));
    let f=window.getV39GameState().players[1].factionState;
    if(!f.aiState.lastCommands.some(c=>c.includes('魂へ即時変換 +1')))throw new Error('NPC実AIステージで受取変換しない');
    const base=f.settlements[0],id=f.units[0].id;
    window.setV39GameState({players:window.getV39GameState().players.map(row=>row.id!==p.id?row:{...row,factionState:{...row.factionState,
      units:row.factionState.units.map(u=>u.id!==id?u:{...u,x:base.x,y:base.y,position:[base.x,base.y]})}})});
    const before=Number(base.foodStockByType.魂)||0;
    window.dispatchEvent(new CustomEvent('v39:turn-stage-ai',{detail:{turnNumber:3}}));
    f=window.getV39GameState().players[1].factionState;
    if(f.settlements[0].foodStockByType.魂!==before+1)throw new Error('NPC変換後の魂を納庫しない');
    return {commands:f.aiState.lastCommands,souls:f.settlements[0].foodStockByType.魂};
  });
  console.log(JSON.stringify({npc},null,2));
}finally{await browser.close();}
