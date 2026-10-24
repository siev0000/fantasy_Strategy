import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const output='output/web-game/land-construction';mkdirSync(output,{recursive:true});
const browser=await chromium.launch();
try{
  for(const [width,height] of [[320,900],[390,600],[390,900],[1100,900]]){
    const page=await browser.newPage({viewport:{width,height}}),errors=[];
    page.on('pageerror',error=>errors.push(String(error.stack)));page.on('dialog',dialog=>dialog.accept());
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
    const setup=await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();
      await window.waitForV39MapRenderSettled();
      const s=window.getV39GameState(),p=s.players.find(p=>p.id===s.activePlayerId),f=p.factionState;
      const first=f.settlements[0],base={...structuredClone(first),id:'build-second',settlementId:'build-second',name:'建築先拠点',x:7,y:6,
        placed:true,scaleKey:'metropolis',scaleLevel:4,type:'大都市',buildings:['墓地'],constructionQueue:[],tileFacilityMap:{},facilityStateByTile:{},
        territoryTileKeys:['6,6'],territoryTileModeMap:{'6,6':'resource'},
        materialStockByType:Object.fromEntries(Object.keys(first.materialStockByType).map(key=>[key,10000])),
        cityLevels:Object.fromEntries(['軍事Lv','鍛冶Lv','魔法Lv','信仰Lv','経済Lv','交渉Lv','調査Lv'].map(key=>[key,10]))};
      const map=window.__v39FieldRuntime.mapData;map.grid[6][6]='平地';if(map.specialMap?.[6])map.specialMap[6][6]='';
      window.setV39GameState({players:s.players.map(row=>row.id===p.id?{...p,factionState:{...f,settlements:[first,base],selectedSettlementId:first.settlementId}}:row),
        territoryOwnerByTile:{...s.territoryOwnerByTile,'6,6':p.id},territoryStateByTile:{...s.territoryStateByTile,'6,6':{settlementId:base.settlementId,hp:100,maxHp:100}},
        facilitiesByTile:{...s.facilitiesByTile,'6,6':[]}});
      window.activateV39FooterTab('tile');window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:6,y:6}}));
      const current=window.getV39GameState();return {first:first.settlementId,before:JSON.stringify(current.players),playerId:p.id};
    });
    await page.locator('#footTile [data-land-construction-open]').click();
    const panel=page.locator('#v39-land-construction');assert(await panel.isVisible());
    assert.equal(await page.locator('#buildModal').evaluate(el=>el.classList.contains('open')),false);
    const farm=panel.locator('[data-land-build-facility="農場"]');await farm.click();
    await page.waitForFunction(()=>window.getV39LandConstructionPreview()?.facilityName==='農場');
    assert.match(await panel.locator('.v39-land-build-detail').innerText(),/建築先拠点/);
    assert.match(await panel.locator('.v39-land-build-detail').innerText(),/維持費/);
    assert.equal(await page.evaluate(()=>JSON.stringify(window.getV39GameState().players)),setup.before,'preview must not spend or mutate players');
    const preview=await page.evaluate(()=>{
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0],layer=scene.children.list.find(node=>node.name==='v39-construction-preview-layer');
      const marker=layer?.list.find(node=>node.name==='v39-construction-preview');
      if(marker){scene.cameras.main.centerOn(marker.x,marker.y);scene.cameras.main.setZoom(scene.v39FitZoom*3);}
      return {tile:marker?.getData('tileKey'),name:marker?.getData('facilityName'),alpha:marker?.alpha};
    });assert.equal(preview.tile,'6,6');assert.equal(preview.name,'農場');assert.equal(preview.alpha,.45);
    assert.equal(await panel.locator('[data-land-construction-start]').isEnabled(),true);
    const header=await panel.locator('header').boundingBox(),footer=await panel.locator('footer').boundingBox();
    await panel.locator('.v39-land-build-list').evaluate(el=>el.scrollTop=1000);
    await panel.locator('.v39-land-build-detail').evaluate(el=>el.scrollTop=1000);
    assert.equal((await panel.locator('header').boundingBox()).y,header.y);
    assert.equal((await panel.locator('footer').boundingBox()).y,footer.y);
    await panel.locator('.v39-land-build-detail').evaluate(el=>el.scrollTop=0);
    await farm.scrollIntoViewIfNeeded();
    await page.screenshot({path:`${output}/build-${width}-${height}.png`});
    await panel.locator('[data-land-construction-back]').click();
    assert.equal(await panel.count(),0);assert.equal(await page.evaluate(()=>window.getV39LandConstructionPreview()),null);
    assert.deepEqual(await page.evaluate(()=>{const d=window.getV39SelectedLandDetail();return [d.x,d.y];}),[6,6]);
    await page.locator('#footTile [data-land-construction-open]').click();await farm.click();
    await panel.locator('[data-land-construction-start]').click();
    assert.equal(await panel.count(),0);
    const result=await page.evaluate(()=>{
      const f=window.getV39ActiveFactionState(),base=f.settlements.find(b=>b.settlementId==='build-second');
      return {selected:f.selectedSettlementId,queue:base.constructionQueue,wood:base.materialStockByType.木材,
        firstQueue:f.settlements.find(b=>b.settlementId!=='build-second').constructionQueue};
    });
    assert.equal(result.selected,setup.first,'building must not change the selected settlement');
    assert.equal(result.queue.length,1);assert.equal(result.queue[0].tileKey,'6,6');assert.equal(result.queue[0].facilityName,'農場');
    assert(result.wood<10000);assert.equal(result.firstQueue.length,0);
    await page.locator('#footTile [data-land-construction-open]').click();await farm.click();
    assert.equal(await panel.locator('[data-land-construction-start]').isDisabled(),true,'second facility on same tile rejected');
    await page.evaluate(()=>window.activateV39FooterTab('squad'));
    assert.equal(await page.evaluate(()=>window.getV39LandConstructionPreview()),null);
    await page.evaluate(()=>window.openV39SettlementDevelopment());
    assert.equal(await page.locator('#buildModal [data-v39-facility]').count(),0,'development is scale only');
    assert.equal(await page.locator('#buildModal #v39-development').count(),1);
    await page.keyboard.press('Escape');
    await page.evaluate(()=>{window.activateV39FooterTab('tile');window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:0,y:0}}));});
    await page.locator('#footTile [data-land-construction-open]').click();assert.equal(await panel.count(),0,'foreign/empty tile does not open builder');
    await page.evaluate(async()=>{
      window.startV39CallTest();window.setV39RitualTestStage(1);await window.waitForV39MapRenderSettled();
      const s=window.getV39GameState(),p=s.players.find(row=>row.id===s.activePlayerId),f=p.factionState;
      const base=f.settlements.find(base=>base.placed),[tileKey]=Object.entries(base.tileFacilityMap).find(([,names])=>names.includes('火の儀式場I'));
      window.setV39GameState({players:s.players.map(row=>row.id!==p.id?row:{...row,factionState:{...f,settlements:f.settlements.map(row=>row.settlementId!==base.settlementId?row:{...row,cityLevels:{...row.cityLevels,魔法Lv:10}})}})});
      const [x,y]=tileKey.split(',').map(Number);window.activateV39FooterTab('tile');window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x,y}}));
    });
    await page.locator('#footTile [data-land-construction-open]').click();
    assert.equal(await panel.locator('[data-land-build-facility="火の儀式場II"]').count(),1,'occupied facility exposes its direct upgrade');
    assert.equal(await panel.locator('[data-land-build-facility="農場"]').count(),0,'occupied facility does not offer unrelated replacements');
    await panel.locator('[data-land-build-facility="火の儀式場II"]').click();
    assert.match(await panel.locator('[data-land-construction-start]').innerText(),/改築開始/);
    await page.evaluate(()=>{const s=window.getV39GameState();window.setV39GameState({timeline:{...s.timeline,turnNumber:s.timeline.turnNumber+1}});});
    assert.equal(await panel.count(),0,'turn change clears builder');
    assert.equal(await page.evaluate(()=>window.getV39LandConstructionPreview()),null);
    assert.deepEqual(errors,[]);console.log(`${width}x${height}: inline layout, fixed controls, ghost preview, cancel, exact settlement charging, one facility/tile, upgrades, turn cleanup and development separation passed`);
    await page.close();
  }
}finally{await browser.close();}
