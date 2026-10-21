import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1100,height:850}});
const errors=[];
page.on('pageerror',error=>errors.push(String(error)));
try {
  await page.goto(process.env.V39_POLICY_TEST_URL || 'http://127.0.0.1:5173',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>typeof window.runV39FactionAiTurn==='function');
  await page.evaluate(()=>window.closeV39PlayModeSelection());
  const checks = await page.evaluate(async()=>{
    const policy=await import('/src/lib/v39-npc-resource-policy.js');
    const {canV39FactionAttack}=await import('/src/lib/v39-diplomacy-rules.js');
    const {chargeV39Negotiation}=await import('/src/lib/v39-negotiation-rules.js');
    const {recoverV39GroundLootState}=await import('/src/lib/v39-ground-loot-recovery.js');
    const {default:config}=await import('/@fs/C:/Users/skkt3/ドキュメント/Github/fantasy_Strategy/config/v39-npc-faction-ai.json');
    const ok=(value,message)=>{if(!value)throw new Error(message);};
    const actor={id:'npc-unit',name:'悪魔の使者',race:'デヴィル',hp:100,currentHp:100,ap:100,currentAp:100,
      maxHp:100,maxAp:100,x:4,y:4,worldId:'surface',squadId:'solo',status:{攻撃:100,SIZ:170},skillLevels:{威圧:100}};
    const npc={id:'npc',isPlayer:false,race:'悪魔',factionState:{units:[actor],squads:[{id:'solo',unitIds:[actor.id]}],
      settlements:[{id:'base',settlementId:'base',name:'悪魔の拠点',placed:true,x:2,y:2,population:10,populationByRace:{悪魔:10},foodStockByType:{魂:0},territoryResidentialCenterMap:{'3,2':'2,2'}}],
      selectedSettlementId:'base',exploration:{discoveredFactionsByPlayerId:{}},aiState:{}}};
    const human={id:'human',isPlayer:true,race:'只人',factionState:{units:[],settlements:[]}};
    const village={id:'village',name:'要求先の村',x:5,y:4,population:100,populationByRace:{只人:100},
      contactedByPlayerIds:['npc'],relationsByPlayerId:{npc:0},defenseUnits:[],territoryTileKeys:['5,4']};
    const state={activePlayerId:'human',activeWorldId:'surface',timeline:{turnNumber:2,phase:'resolution'},players:[human,npc],
      neutralVillages:[village],settlements:[village],groundLootByTile:{},diplomacyRelations:{}};
    ok(policy.inspectV39NpcResourceNeeds(npc)[0]?.resource==='魂','悪魔の増加条件を魂として解決しない');
    const vampire=structuredClone(npc);vampire.factionState.settlements[0].populationByRace={吸血鬼:10};
    ok(policy.inspectV39NpcResourceNeeds(vampire)[0]?.resource==='死体','吸血鬼の増加条件を解決しない');
    const fed=structuredClone(npc);fed.factionState.settlements[0].foodStockByType.魂=5;
    ok(!policy.inspectV39NpcResourceNeeds(fed).length,'在庫があっても資源不足');
    const peaceful=structuredClone(npc);peaceful.factionState.aiState.behaviorPatternId='standard';
    ok(!policy.inspectV39NpcResourceNeeds(peaceful).length,'通常方針へ切替できない');
    ok(!policy.inspectV39NpcResourceNeeds(npc,{...config,racePatternIds:{悪魔:'standard'}}).length,'種族別設定を無視');
    const demand=policy.selectV39NpcResourceObjective(state,npc);
    ok(demand.type==='resource-demand','既知村への要求を選ばない');
    const unknown={...state,neutralVillages:[{...village,contactedByPlayerIds:[]}]};
    ok(policy.selectV39NpcResourceObjective(unknown,npc).type==='resource-search','未発見の村を利用した');
    const accepted=policy.executeV39NpcResourceObjective(state,'npc',demand,2,()=>0);
    ok(accepted.state.neutralVillages[0].sacrificeContract?.active,'契約が成立しない');
    ok(accepted.state.players[1].factionState.units[0].ap===80,'要求AP20を消費しない');
    ok(accepted.state.neutralVillages[0].population===100,'契約だけで住民が消えた');
    ok(!policy.executeV39NpcResourceObjective(accepted.state,'npc',demand,2,()=>0),'同ターン重複');
    const rejected=policy.executeV39NpcResourceObjective(state,'npc',demand,2,()=>1);
    ok(!rejected.state.neutralVillages[0].sacrificeContract?.active,'拒否でも契約');
    ok(policy.selectV39NpcResourceObjective(rejected.state,rejected.state.players[1],null,config,6).type==='resource-search','拒否後の待機がない');
    ok(policy.selectV39NpcResourceObjective(rejected.state,rejected.state.players[1],null,config,7).type==='resource-demand','5T後に再要求できない');
    const lowAp=structuredClone(state);lowAp.players[1].factionState.units[0].ap=10;
    ok(!policy.executeV39NpcResourceObjective(lowAp,'npc',demand,2,()=>0),'AP不足でも要求した');
    ok(!chargeV39Negotiation(state,'npc',actor.id,'village',[]).ok,'人の操作制限が壊れた');
    ok(!chargeV39Negotiation(state,'human','none','village',[],{aiTurn:true,turnNumber:2}).ok,'人がAI特例を利用');
    const ground=structuredClone(state);ground.groundLootByTile['4,4']={discoveredByPlayerIds:['npc'],cargo:{resourcesByType:{魂:2}}};
    const recover=policy.selectV39NpcResourceObjective(ground,npc);
    ok(recover.type==='resource-recover','回収を最優先しない');
    const recovered=policy.executeV39NpcResourceObjective(ground,'npc',recover,2);
    ok(!recovered.state.groundLootByTile['4,4'],'回収後も残留品が残った');
    ok(recovered.state.players[1].factionState.squads[0].cargoByUnitId[actor.id].resourcesByType.魂===2,'荷物へ加算しない');
    ok(recovered.state.players[1].factionState.settlements[0].foodStockByType.魂===0,'遠隔で拠点へ瞬間移送');
    ok(policy.selectV39NpcResourceObjective(recovered.state,recovered.state.players[1]).type==='resource-return','持帰りに移らない');
    const hidden=structuredClone(ground);hidden.groundLootByTile['4,4'].discoveredByPlayerIds=[];
    ok(!recoverV39GroundLootState(hidden,'npc',actor.id,'4,4').ok,'未発見の残留品を回収');
    const foreign=structuredClone(unknown);foreign.players[1].factionState.exploration.discoveredFactionsByPlayerId.human={playerId:'human',playerName:'他国',key:'8,8',x:8,y:8};
    const raid=policy.selectV39NpcResourceObjective(foreign,foreign.players[1]);
    ok(raid.resourceRaid,'既知勢力への襲撃を選ばない');
    const war=policy.executeV39NpcResourceObjective(foreign,'npc',raid,2);
    ok(canV39FactionAttack(war.state,'npc','human'),'宣戦が実際の敵対にならない');
    foreign.diplomacyRelations['human|npc']={status:'peace',treaties:{nonAggression:{active:true,expiresAtTurn:20}}};
    ok(policy.selectV39NpcResourceObjective(foreign,foreign.players[1]).type==='resource-search','不可侵を破った');
    ok(!policy.selectV39NpcResourceObjective({...state,activeWorldId:'cave'},npc),'別世界で地上資源を利用');
    const save=JSON.parse(JSON.stringify(accepted.state));
    ok(save.neutralVillages[0].npcSacrificeAttemptsByPlayerId.npc.nextAttemptTurn===7,'保存で再要求期限消失');
    return {accepted:accepted.command,rejected:rejected.command,recovered:recovered.command,raid:war.command,checks:24};
  });
  assert.equal(checks.checks,24);
  console.log(JSON.stringify({checks,errors},null,2));
  assert.deepEqual(errors,[]);
  await mkdir('output/web-game/npc-resource-policy',{recursive:true});
  await page.evaluate(async()=>{
    await window.setV39TestMode(true);
    window.startV39VillageIncidentTest();
    const s=window.getV39GameState();
    const npc=s.players[1],v=s.neutralVillages.find(row=>row.incidentTest);
    const base=npc.factionState.settlements[0];
    window.setV39GameState({players:s.players.map(p=>p.id!==npc.id?p:{...p,isPlayer:false,factionState:{...p.factionState,
      settlements:[{...base,population:10,populationByRace:{悪魔:10},foodStockByType:{魂:0}}],
      aiState:{lastProcessedTurn:0},exploration:{...p.factionState.exploration,discoveredFactionsByPlayerId:{},discoveredFeaturesByTile:{}}}}),
      victoryLandmarksByTile:{},neutralVillages:[{...v,contactedByPlayerIds:[npc.id],sacrificeContract:null}],
      groundLootByTile:{},timeline:{...s.timeline,turnNumber:2,phase:'resolution'}},{reason:'npc-resource-policy-check'});
    const random=Math.random;Math.random=()=>0;
    try{window.dispatchEvent(new CustomEvent('v39:turn-stage-ai',{detail:{turnNumber:2}}));}finally{Math.random=random;}
  });
  const runtime=await page.evaluate(()=>{
    const s=window.getV39GameState(),npc=s.players.find(p=>p.isPlayer===false),v=s.neutralVillages.find(v=>v.incidentTest);
    if(!v.sacrificeContract?.active||v.sacrificeContract.playerId!==npc.id)throw new Error('実AIステージで村の契約を保存しない');
    if(!npc.factionState.aiState.lastCommands.some(c=>c.includes('生贄要求:')))throw new Error('実AIステージで診断ログを保存しない');
    const commands=npc.factionState.aiState.lastCommands;
    window.importV39SaveJson(window.exportV39SaveJson(0));
    const loaded=window.getV39GameState();
    if(!loaded.neutralVillages.find(v=>v.incidentTest).sacrificeContract?.active)throw new Error('実セーブ読込で契約消失');
    return {commands};
  });
  await page.evaluate(()=>{window.closeV39VillageMenu();window.openV39TestTools();});
  await page.locator('[data-test-tab=diagnostics]').click();
  const diagnostic=page.locator('[data-test-section=npc-ai]');
  if(!await diagnostic.evaluate(el=>el.open))await diagnostic.locator(':scope > summary').click();
  await page.screenshot({path:'output/web-game/npc-resource-policy/diagnostics-1100.png'});
  assert.match(await diagnostic.innerText(),/村への生贄要求/);
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'output/web-game/npc-resource-policy/diagnostics-390.png'});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({runtime,errors},null,2));
  const delivery=await page.evaluate(()=>{
    window.closeV39TestTools?.();
    let s=window.getV39GameState(),npc=s.players.find(p=>p.isPlayer===false),unit=npc.factionState.units[0];
    window.setV39GameState({groundLootByTile:{[`${unit.x},${unit.y}`]:{discoveredByPlayerIds:[npc.id],cargo:{resourcesByType:{魂:2}}}}});
    window.dispatchEvent(new CustomEvent('v39:turn-stage-ai',{detail:{turnNumber:3}}));
    s=window.getV39GameState();npc=s.players.find(p=>p.isPlayer===false);
    if(Object.keys(s.groundLootByTile).length)throw new Error('実AIで残留品が残る');
    const base=npc.factionState.settlements[0];
    window.setV39GameState({players:s.players.map(p=>p.id!==npc.id?p:{...p,factionState:{...p.factionState,
      units:p.factionState.units.map(u=>u.id!==unit.id?u:{...u,x:base.x,y:base.y,position:[base.x,base.y]})}})});
    window.dispatchEvent(new CustomEvent('v39:turn-stage-ai',{detail:{turnNumber:4}}));
    npc=window.getV39GameState().players.find(p=>p.isPlayer===false);
    if(npc.factionState.settlements[0].foodStockByType.魂!==2)throw new Error('持帰り後に通常納庫されない');
    return {stock:npc.factionState.settlements[0].foodStockByType.魂,commands:npc.factionState.aiState.lastCommands};
  });
  console.log(JSON.stringify({delivery},null,2));
  await page.evaluate(()=>{
    const s=window.getV39GameState();
    window.setV39GameState({players:s.players.map(p=>p.isPlayer!==false?p:{...p,factionState:{...p.factionState,
      aiState:{...p.factionState.aiState,behaviorPatternId:'standard'}}})});
    window.importV39SaveJson(window.exportV39SaveJson(0));
    if(window.getV39GameState().players.find(p=>p.isPlayer===false).factionState.aiState.behaviorPatternId!=='standard')throw new Error('勢力別パターンが保存されない');
  });
} finally { await browser.close(); }
