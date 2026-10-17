import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const browser=await chromium.launch();
try {
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(String(error.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3022',{waitUntil:'networkidle'});
  const result=await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();
    const state=window.getV39GameState(),player=state.players.find(p=>p.id===state.activePlayerId),id=player.id;
    const omitted=window.setV39GameState({}, {silent:true,returnState:false})===undefined;
    const ordinary=window.setV39GameState({}, {silent:true});
    const faction={...player.factionState,research:{},exploration:{researchDiscoveryVersion:1,surveyedTileKeys:['1,1']}};
    window.setV39GameState({players:[{...player,factionState:faction},{...player,id:'snapshot-research-other',factionState:{...faction,units:[],squads:[],exploration:{surveyedTileKeys:['1,1']}}}],
      specialtiesByTile:{'1,1':{name:'鉄',x:1,y:1}},explorationSitesByTile:{},
      explorationWorlds:{...state.explorationWorlds,'cave:snapshot-research':{map:{w:1,h:1,isUnderground:true,grid:[['洞窟']]},
        spatial:{specialtiesByTile:{'0,0':{name:'鉄',x:0,y:0}}},exploration:{[id]:{researchDiscoveryVersion:1,surveyedTileKeys:['0,0']}}}}},{reason:'snapshot-research-setup'});
    const hidden=!window.getV39ActiveFactionState().exploration.discoveredSpecialtiesByTile['1,1'];
    const selected=window.selectV39Research('調査Lv','地質調査Lv:1:地質調査Ⅰ');
    if(!selected.changed)throw new Error('unified research selection failed');
    window.addV39ResearchExperience('調査Lv',1000);
    const next=window.getV39GameState(),own=next.players.find(p=>p.id===id),other=next.players.find(p=>p.id==='snapshot-research-other');
    const archived=!!next.explorationWorlds['cave:snapshot-research'].exploration[id].discoveredSpecialtiesByTile['0,0'];
    const active=!!own.factionState.exploration.discoveredSpecialtiesByTile['1,1'];
    const isolated=!other.factionState.exploration.discoveredSpecialtiesByTile['1,1'];
    window.importV39SaveJson(window.exportV39SaveJson());
    const restored=window.getV39GameState();
    return {omitted,ordinary:ordinary?.activePlayerId===id&&!!ordinary.explorationWorlds['cave:expedition-test:1'],hidden,active,archived,isolated,originalCaveRetained:!!restored.explorationWorlds['cave:expedition-test:1'],
      archiveSaved:!!restored.explorationWorlds['cave:snapshot-research'].exploration[id].discoveredSpecialtiesByTile['0,0']};
  });
  for(const [name,value] of Object.entries(result))assert.equal(value,true,name);
  if(process.env.V39_PRODUCTION_CHECK!=='1') {
    const projected=await page.evaluate(async()=>{
      const {withV39WorldContext}=await import('/src/v39/core/v39-world-context.js');
      const originalPlayer=window.getV39ActivePlayer,originalFaction=window.getV39ActiveFactionState;
      let players=0,factions=0;
      window.getV39ActivePlayer=(...args)=>{players++;return originalPlayer(...args);};
      window.getV39ActiveFactionState=(...args)=>{factions++;return originalFaction(...args);};
      try {
        return await withV39WorldContext('cave:expedition-test:1',()=>{
          players=0;factions=0;const player=window.getV39ActivePlayer();
          return {players,factions,units:player.factionState.units.map(u=>u.worldId||'surface')};
        });
      } finally {window.getV39ActivePlayer=originalPlayer;window.getV39ActiveFactionState=originalFaction;}
    });
    assert.equal(projected.players,1);assert.equal(projected.factions,0);
    assert(projected.units.every(id=>id==='cave:expedition-test:1'));
  }
  assert.deepEqual(errors,[]);console.log(result);
} finally {await browser.close();}
