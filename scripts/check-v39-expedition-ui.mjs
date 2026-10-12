import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
mkdirSync('output/web-game/expedition',{recursive:true});
const browser=await chromium.launch({headless:true}),errors=[];
try{
  for(const width of [390,1100]){
    const page=await browser.newPage({viewport:{width,height:900}});page.on('pageerror',error=>errors.push(String(error)));
    await page.goto('http://127.0.0.1:3022',{waitUntil:'networkidle'});
    await page.locator('[data-v39-cave-test]').click();await page.getByRole('button',{name:'探索ゲーム',exact:true}).click();await page.getByRole('button',{name:'探索開始',exact:true}).click();
    await page.waitForTimeout(700);
    await page.evaluate(()=>{
      const map=window.__v39FieldRuntime.mapData,state=window.getV39GameState(),actor=window.getV39SelectedSquadUnit();
      map.caveSites.push({id:'test-herb',kind:'herb',icon:'🌿',name:'薬草群生地',discovered:true,x:actor.x,y:actor.y,key:`${actor.x},${actor.y}`,remaining:3});
      window.setV39GameState({enemies:[],players:state.players.map(player=>({...player,factionState:{...player.factionState,
        units:player.factionState.units.map(unit=>unit.id===actor.id?{...unit,hp:20,currentHp:20,toolStockByType:{薬草:2}}:unit)}}))});
      document.querySelector('[data-squad-detail-tab="action"]')?.click();window.refreshV39ExpeditionTools();
    });
    const herb=page.locator('[data-expedition-tool="use-薬草"]');await herb.waitFor();
    const before=await page.evaluate(()=>window.getV39SelectedSquadUnit().ap);
    await herb.click();await page.waitForTimeout(150);
    assert.equal(await page.evaluate(()=>window.getV39SelectedSquadUnit().ap),before,'preview does not execute');
    await herb.getByRole('button',{name:'実行',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.getV39SelectedSquadUnit().toolStockByType.薬草),1);
    const gather=page.locator('[data-expedition-tool="gather-test-herb"]');await gather.click();await gather.getByRole('button',{name:'実行',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.getV39SelectedSquadUnit().expeditionCargoByType.薬草),1);
    await page.screenshot({path:`output/web-game/expedition/tools-${width}.png`});
    const roundTrip=await page.evaluate(()=>{
      const save=window.getV39GameState();window.setV39GameState(JSON.parse(JSON.stringify(save)),{silent:true});
      return window.getV39SelectedSquadUnit().toolRecovery.remainingTurns;
    });assert.equal(roundTrip,6,'save state fields retained');
    await page.evaluate(async()=>{
      const {buildV39UnitEntity}=await import('/src/lib/v39-unit-creation-rules.js');
      const state=window.getV39GameState(),map=window.__v39FieldRuntime.mapData,id=state.activePlayerId;
      map.entrances[0].surfaceEntrance={x:2,y:2};
      map.caveMine={ownerPlayerId:id,claimedTurn:1,lastProcessedTurn:1,productionProgress:0,resourcesPerCycle:{鉱石:1},stockByResource:{鉱石:2},suspended:false};
      const surface={w:12,h:12,grid:Array.from({length:12},()=>Array(12).fill('平地')),heightLevelMap:Array.from({length:12},()=>Array(12).fill(0)),isUnderground:false};
      const army={...buildV39UnitEntity({id:'transport-army',race:'只人',className:'ファイター',unitType:'軍隊ユニット',isNamed:false,level:7,x:2,y:2}),name:'輸送軍',worldId:'surface'};
      const other=map.rooms?.[0]?.center || {x:1,y:1};
      window.setV39GameState({players:state.players.map(player=>({...player,factionState:{...player.factionState,
        units:[...player.factionState.units.map(unit=>({...unit,x:other.x,y:other.y})),army],
        settlements:[{id:'base',settlementId:'base',name:'搬入先',x:2,y:2,placed:true,population:1,populationByRace:{只人:1},foodStockByType:{穀物:1000},materialStockByType:{木材:100},tileFacilityMap:{}}],selectedSettlementId:'base'}})),
        explorationWorlds:{...state.explorationWorlds,surface:{map:surface,spatial:{enemies:[],enemyNests:[],enemySquads:[],neutralVillages:[],settlements:[],territoryOwnerByTile:{'2,2':id},territoryStateByTile:{},worldEnvironment:{},specialtiesByTile:{},facilitiesByTile:{}}}}});
    });
    await page.locator('#v39-mine-duty-unit').selectOption('transport-army');
    await page.locator('[data-mine-duty="transport"]').click();
    const duties=await page.evaluate(async()=>{
      const id=window.getV39GameState().activePlayerId;
      // 階層の入口を確実に空け、実ターン処理で任務を進める。
      const map=window.__v39FieldRuntime.mapData,entry=map.entrances[0];
      const floor=[];for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++)if(map.grid[y][x]==='洞窟'&&(x!==entry.x||y!==entry.y))floor.push({x,y});
      const player=window.getV39ActivePlayer();
      window.setV39GameState({players:[{...player,factionState:{...player.factionState,units:player.factionState.units.map((unit,index)=>unit.id==='transport-army'?unit:{...unit,...floor[index],ap:100,currentAp:100})}}]});
      await window.advanceV39Turn({skipUnactedFocus:true});
      const loaded=window.getV39ActiveFactionState().units.find(unit=>unit.id==='transport-army');
      if(loaded.worldId!==window.getV39GameState().activeWorldId||loaded.caveDuty.cargo.鉱石!==2)throw Error(`native load failed: ${JSON.stringify(loaded.caveDuty)}`);
      const unit=window.getV39ActiveFactionState().units.find(unit=>unit.id===window.getV39SelectedSquadUnit().id);
      if(unit.toolRecovery.remainingTurns!==5)throw Error('native healing tick not applied once');
      await window.advanceV39Turn({skipUnactedFocus:true});
      const base=window.getV39ActiveFactionState().settlements[0];
      if(base.materialStockByType.鉄<2)throw Error(`native delivery failed ${JSON.stringify(base.materialStockByType)}`);
      return {owner:id,iron:base.materialStockByType.鉄};
    });assert.ok(duties.iron>=2);
    await page.screenshot({path:`output/web-game/expedition/mine-${width}.png`});
    await page.evaluate(async()=>{
      const {buildV39UnitEntity}=await import('/src/lib/v39-unit-creation-rules.js');
      const state=window.getV39GameState(),map=window.__v39FieldRuntime.mapData;
      const tiles=[];for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++)if(map.grid[y][x]==='洞窟')tiles.push({x,y});
      map.caveMine.stockByResource={鉱石:3,宝石:2};
      const intruders=tiles.slice(-2).map((tile,index)=>({...buildV39UnitEntity({id:`intruder-${index}`,race:'ウルフ',className:'ウルフ',level:7,...tile}),worldId:state.activeWorldId,lastCaveEntryTurn:1,caveArrivalFood:10,caveArrivalFoodResource:'肉'}));
      window.setV39GameState({enemies:intruders,players:state.players.map(player=>({...player,factionState:{...player.factionState,units:player.factionState.units.map(unit=>({...unit,worldId:'surface'}))}}))});
      for(let turn=4;turn<=8;turn++)window.advanceV39CaveMine(turn);
      const after=window.getV39GameState();
      if(map.caveMine)throw Error('mine not replaced after 5 unoccupied turns');
      const nest=after.enemyNests.find(nest=>nest.id===map.caveConquest.activeNestId);
      if(!nest||!nest.unitIds.includes('intruder-0')||!nest.unitIds.includes('intruder-1')||!map.caveBossIds.length)throw Error('actual invaders/new boss not linked');
      if(nest.materialStockByType.鉄<3||nest.materialStockByType.宝石!==2)throw Error('captured mine stock lost');
    });
    await page.close();
  }
  assert.deepEqual(errors,[]);console.log('expedition UI: 390/1100, preview/use, harvesting, stock consumption, save restoration passed');
}finally{await browser.close();}
