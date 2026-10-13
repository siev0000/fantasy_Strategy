import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/village-events',{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [390,1100]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(String(e.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3022',{waitUntil:'networkidle'});
    await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();
      const state=window.getV39GameState();window.setV39GameState({neutralVillages:state.neutralVillages.map(v=>({...v,relationsByPlayerId:{[state.activePlayerId]:50}}))});
      window.activateV39FooterTab('tile');window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:10,y:5,terrain:'平地'}}));});
    await page.locator('[data-event-id="VILLAGE_FIELD_SHORTAGE_SUPPLY"]').click();
    const quest=await page.evaluate(()=>window.getV39GameState().neutralVillages[0].questsByPlayerId[window.getV39GameState().activePlayerId]);
    assert(quest.eventDefinition&&quest.required>3,'JSON definition and resolved requirements saved');
    const setStock=amount=>page.evaluate(({quest,amount})=>{const faction=window.getV39ActiveFactionState(),field=quest.stockKind==='food'?'foodStockByType':'materialStockByType';
      const selected=faction.settlements.find(row=>(row.id||row.settlementId)===faction.selectedSettlementId)||faction.settlements[0];
      const village={...selected,[field]:{...selected[field],[quest.resourceKey]:amount}};
      window.updateV39ActiveFactionState({settlements:faction.settlements.map(row=>row===selected?village:row)});}, {quest,amount});
    await setStock(3);await page.locator('[data-world-action="quest-complete"]').click();
    const partial=await page.evaluate(()=>{const s=window.getV39GameState(),v=s.neutralVillages[0];return {quest:v.questsByPlayerId[s.activePlayerId],relation:v.relationsByPlayerId[s.activePlayerId]};});
    assert.equal(partial.quest.progress,3);assert.equal(partial.quest.completed,false);assert.equal(partial.relation,50);
    await page.screenshot({path:`output/web-game/village-events/partial-${width}.png`});
    await page.evaluate(()=>{const save=window.exportV39SaveJson();window.importV39SaveJson(save);});
    await setStock(quest.required-3);await page.locator('[data-world-action="quest-complete"]').click();
    const final=await page.evaluate(()=>{const s=window.getV39GameState(),v=s.neutralVillages[0];return {quest:v.questsByPlayerId[s.activePlayerId],relation:v.relationsByPlayerId[s.activePlayerId]};});
    assert.equal(final.quest.completed,true);assert.equal(final.quest.progress,quest.required);assert.equal(final.relation,55);
    assert.equal(await page.locator('[data-world-action="quest-complete"]').count(),0,'cannot receive twice');
    if(!process.env.V39_PRODUCTION_CHECK)await page.evaluate(async()=>{
      const engine=await import('/src/lib/v39-event-rules.js'),rules=await import('/src/lib/v39-neutral-village-rules.js'),data=await import('/src/lib/game-data-registry.js');
      const check=(ok,name)=>{if(!ok)throw Error(name);};
      const definition=data.getGameDataRows('イベント_一般村').find(row=>row.生成設定?.方式==='周辺脅威');
      const renamed={...definition,ID:'RENAMED_EVENT'};
      const context={player:{id:'p',race:'只人'},relation:50,turn:1};
      check(engine.createV39EventQuest(renamed,context,{周辺脅威:()=>({required:1})}).eventId==='RENAMED_EVENT','ID-independent dispatch');
      check(!engine.isV39EventReady({...renamed,発生条件:[{タイプ:'不明',比較:'一致',値:true}]},context),'unknown conditions denied');
      const state=window.getV39GameState(),v=state.neutralVillages[0],id=state.activePlayerId;
      const expired=structuredClone(state);expired.neutralVillages[0].questsByPlayerId[id]={...v.questsByPlayerId[id],accepted:true,completed:false,deadlineTurn:2};
      const result=rules.advanceV39NeutralVillages(expired,window.__v39FieldRuntime.mapData,2);
      check(result.state.neutralVillages[0].questsByPlayerId[id].failed,'deadline failure');
      const fail=engine.applyV39EventEffects(state,[{タイプ:'不明'}],{});check(!fail.ok&&fail.state===state,'unknown effects atomic');
    });
    assert.deepEqual(errors,[]);console.log(`${width}: native JSON quest accept, partial delivery, save, reward once and cooldown passed`);await page.close();
  }
}finally{await browser.close();}
