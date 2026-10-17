import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/fusion-placement',{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [390,1100]){
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.startV39FusionTest);
    const result=await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39FusionTest();await window.waitForV39MapRenderSettled();
      window.refreshV39MapEntities();
      const s=window.getV39GameState(),f=window.getV39ActiveFactionState(),b=f.settlements.find(b=>b.settlementId===f.selectedSettlementId);
      const stored=f.deadUnitReserve.filter(e=>e.corpseStorage),units=[...f.units,...s.enemies].filter(u=>(u.worldId||'surface')==='surface');
      const nodes=window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list.flatMap(n=>[n,...(n.list||[])]);
      const markers=nodes.filter(n=>n.name==='v39-facility-marker').map(n=>n.getData('tileKey'));
      const counts=nodes.filter(n=>n.name==='v39-facility-storage-count').map(n=>[n.getData('tileKey'),Number(n.getData('label'))]);
      const distinct=['3,3','3,4','5,5'].every(key=>!units.some(u=>`${u.x},${u.y}`===key)&&`${b.x},${b.y}`!==key);
      const isolated=stored.every(e=>e.unit.hp===0&&!units.some(u=>u.id===e.unitId));
      const souls=f.soulStorage;
      const soulIsolated=souls.length===2&&souls.every(soul=>soul.soulStored&&soul.hp===0&&!soul.equipment.length&&!('x' in soul)&&!units.some(u=>u.id===soul.id||u.id===soul.sourceUnitId));
      const fusion=await import('/src/lib/v39-monster-fusion.js');
      const recipe=fusion.getV39FusionRecipes(s).find(r=>r.合成結果==='バイコーン');
      const made=fusion.executeV39MonsterFusion(s,{playerId:s.activePlayerId,actorId:'expedition-test-king',recipeId:recipe.id,mode:'facility',materialIds:souls.map(u=>u.id)});
      const soulFusion=made.ok&&made.state.players.find(p=>p.id===s.activePlayerId).factionState.soulStorage.length===0;
      const save=window.exportV39SaveJson();window.importV39SaveJson(save);
      const saved=window.getV39ActiveFactionState().deadUnitReserve.filter(e=>e.corpseStorage).length;
      const soulSaved=window.getV39ActiveFactionState().soulStorage.length===2;
      const restarted=window.startV39FusionTest();await window.waitForV39MapRenderSettled();
      return {distinct,isolated,soulIsolated,soulFusion,soulSaved,soulRestarted:restarted.storedSoulCount,count:stored.length,saved,restarted:restarted.storedCorpseCount,markers,counts};
    });
    assert(result.distinct&&result.isolated,JSON.stringify(result));assert.equal(result.count,3);assert.equal(result.saved,3);assert.equal(result.restarted,3);
    assert(result.soulIsolated&&result.soulFusion&&result.soulSaved,JSON.stringify(result));assert.equal(result.soulRestarted,2);
    assert(result.counts.some(([key,count])=>key==='3,4'&&count===2));
    for(const key of ['3,3','3,4','5,5'])assert(result.markers.includes(key),`${key} facility drawn`);
    assert(result.counts.some(([key,count])=>key==='5,5'&&count===3));
    assert(result.counts.some(([key,count])=>key==='3,3'&&count===69));
    await page.screenshot({path:`output/web-game/fusion-placement/field-${width}.png`});
    await page.evaluate(()=>window.openV39CharacterModal());
    await page.locator('[data-v39-character-location]').selectOption('mausoleum');
    assert.equal(await page.locator('#characterModal [data-v39-character-row]').count(),3);
    await page.screenshot({path:`output/web-game/fusion-placement/mausoleum-${width}.png`});
    await page.evaluate(()=>{document.getElementById('characterModal').classList.remove('open');window.activateV39FooterTab('settlement');window.renderV39SettlementPanel();});
    await page.locator('[data-settlement-page-select="operation"]').click();
    await page.locator('[data-settlement-fold="facility"] summary').click();
    await page.locator('[data-storage-open="3,4"][data-storage-name="魂の保管庫"]').click();
    assert.equal(await page.locator('#v39-facility-storage [data-storage-row]').count(),2);
    assert.equal(await page.locator('#v39-facility-storage [data-storage-withdraw]').count(),0);
    await page.screenshot({path:`output/web-game/fusion-placement/souls-${width}.png`});
    assert.deepEqual(errors,[]);console.log(`${width}: separate visible facilities, map counts, 3 stored corpses, save/restart and roster passed`);
    await page.close();
  }
}finally{await browser.close();}
