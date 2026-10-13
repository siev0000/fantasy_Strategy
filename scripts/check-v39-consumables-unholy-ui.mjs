import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/consumables-unholy',{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [390,1100]) {
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(process.env.V39_TEST_URL || 'http://127.0.0.1:3022',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.startV39ExpeditionTest);
    const setup=await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();
      const faction=window.getV39ActiveFactionState(),base=faction.settlements[0],id='expedition-test-medic';
      base.tileFacilityMap={...base.tileFacilityMap,'3,4':['調薬所'],'3,3':['霊薬工房'],'4,5':['教会']};base.toolStockByType={薬草:10,水薬:2,聖水:2,煙玉:2};
      window.updateV39ActiveFactionState({settlements:[base],selectedUnitId:id,units:faction.units.map(unit=>unit.id===id?{...unit,x:4,y:4,worldId:'surface',
        toolStockByType:{薬草:2,水薬:2,聖水:2,煙玉:2},defaultToolLoadout:[{name:'水薬',count:3},{name:'聖水',count:3},{name:'煙玉',count:3}]}:unit)});
      const map=window.__v39FieldRuntime.mapData;map.purificationByTile={'4,4':-8};
      window.refreshV39SquadDerivedUI();window.activateV39FooterTab('squad');await window.waitForV39MapRenderSettled();
      return {id,hp:window.getV39ActiveFactionState().units.find(unit=>unit.id===id).hp};
    });
    await page.evaluate(()=>window.openV39CharacterModal());
    await page.locator(`[data-v39-character-row="${setup.id}"]`).click();
    await page.locator('[data-v39-character-detail-tab="equipment"]').click();
    assert.equal(await page.locator('[data-v39-tool-setting-row]').count(),3);
    await page.locator('[data-v39-tool-setting-name]').nth(0).selectOption('水薬');
    await page.locator('[data-v39-tool-setting-name]').nth(1).selectOption('聖水');
    await page.locator('[data-v39-tool-setting-name]').nth(2).selectOption('煙玉');
    await page.locator('[data-v39-tool-settings-save]').click();
    await page.screenshot({path:`output/web-game/consumables-unholy/settings-${width}.png`});
    await page.locator('#characterModal [data-close]').click();
    await page.locator('[data-squad-select="solo"]').click();await page.locator(`[data-v39-unit-id="${setup.id}"]`).click();
    await page.locator('[data-squad-detail-tab="action"]').click();
    const action=async id=>{await page.waitForTimeout(100);const card=page.locator(`[data-expedition-tool="${id}"]`);await card.evaluate(node=>node.scrollIntoView({block:'nearest'}));await card.click();await card.getByRole('button',{name:'実行',exact:true}).click();await page.waitForTimeout(100);};
    await action('use-聖水');
    assert.equal(await page.evaluate(()=>window.__v39FieldRuntime.mapData.purificationByTile['4,4']),-3);
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().units.find(unit=>unit.id==='expedition-test-medic').hp),setup.hp);
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:3,y:5}})));
    await action('use-煙玉');
    assert.equal(await page.evaluate(()=>window.__v39FieldRuntime.mapData.fogMap[5][3].source),'smoke');
    await action('produce-水薬');
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().settlements[0].toolStockByType.薬草),9);
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().settlements[0].toolProductionQueue.length),1);
    await page.evaluate(async()=>{await window.advanceV39Turn({skipUnactedFocus:true});});
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().settlements[0].toolStockByType.水薬),3);
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().settlements[0].toolProductionQueue.length),0);
    const blade=await page.evaluate(()=>{
      const state=window.getV39GameState(),faction=window.getV39ActiveFactionState(),id='expedition-test-medic',unit=faction.units.find(unit=>unit.id===id);
      window.updateV39ActiveFactionState({units:faction.units.map(row=>row.id===id?{...row,className:'戦闘試験官',level:11,testOnly:true}:row)});
      window.setV39GameState({enemies:[{...unit,id:'blade-target',race:'只人',className:'ファイター',x:6,y:4,worldId:'surface',hp:1,currentHp:1,maxHp:100,techniques:[],equipment:[],resistances:{},status:{防御:0,精神:0}}]});
      window.__v39FieldRuntime.mapData.purificationByTile['6,4']=3;
      const result=window.executeV39FactionCombatAction({playerId:state.activePlayerId,attackerId:id,target:{x:6,y:4},skillRow:{名前:'不浄試験攻撃',行動:'A',判定:'攻撃',切断:10000,貫通:10000,威力:10000,射程:30,AP消費:0,効果:'必中'}});
      return {result,value:window.__v39FieldRuntime.mapData.purificationByTile['6,4'],hp:window.getV39GameState().enemies.find(row=>row.id==='blade-target')?.hp ?? 0,
        turn:window.getV39GameState().timeline,ap:window.getV39ActiveFactionState().units.find(row=>row.id===id).ap};
    });
    assert.equal(blade.hp,0,JSON.stringify(blade));assert.equal(blade.value,-2,'real player combat subtracts five');
    await page.evaluate(()=>window.importV39SaveJson(window.exportV39SaveJson()));
    assert.equal(await page.evaluate(()=>window.__v39FieldRuntime.mapData.purificationByTile['6,4']),-2);
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().units.find(unit=>unit.id==='expedition-test-medic').defaultToolLoadout.length),3);
    await page.screenshot({path:`output/web-game/consumables-unholy/field-${width}.png`});
    assert.deepEqual(errors,[]);console.log(`${width}: actual loadout, holy water, smoke target, native manufacture turn, death blade combat and save passed`);
    await page.close();
  }
}finally{await browser.close();}
