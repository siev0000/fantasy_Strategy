import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/squad-coordination';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of (process.env.V39_TEST_WIDTHS?.split(',').map(Number)||[320,390,1100])) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.setDefaultTimeout(15000);
    page.on('pageerror',error=>{errors.push(String(error));console.error(String(error));});
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3022',{waitUntil:'networkidle'});
    if(width===320&&!process.env.V39_PRODUCTION_CHECK) {
      const report=await page.evaluate(async()=>{
        const rules=await import('/src/lib/v39-squad-coordination.js'),movement=await import('/src/lib/v39-squad-movement-rules.js');
        const {editV39Squad}=await import('/src/lib/v39-squad-edit-rules.js');
        const check=(ok,label)=>{if(!ok)throw Error(label);};
        const unit=(id,x,y=2)=>({id,name:id,hp:100,currentHp:100,x,y,ap:100,currentAp:100,maxAp:100,squadId:'s',worldId:'surface',status:{移動:10,SIZ:170},squadMoveMode:'follow'});
        const map={w:16,h:8,worldWrapEnabled:false,isUnderground:false,grid:Array.from({length:8},()=>Array(16).fill('平地')),heightLevelMap:Array.from({length:8},()=>Array(16).fill(0))};
        const state={activePlayerId:'p',activeWorldId:'surface',timeline:{phase:'player',turnNumber:1},enemies:[],neutralVillages:[],territoryOwnerByTile:{'4,2':'p'},territoryStateByTile:{'4,2':{settlementId:'base'}},players:[{id:'p',factionState:{units:[unit('lead',1),unit('near',2),unit('far',9)],squads:[{id:'s',label:'部隊',unitIds:['lead','near','far'],movementLeaderId:'lead'}],settlements:[{id:'base',settlementId:'base',ownerPlayerId:'p',placed:true,x:1,y:2}]}}]};
        const units=state.players[0].factionState.units;
        check(rules.inspectV39SquadAssembly(state,'p',[units[0],unit('edge',6)],map).ok,'owned border +2');
        check(!rules.inspectV39SquadAssembly(state,'p',[units[0],unit('out',7)],map).ok,'outside border denied');
        check(rules.inspectV39SquadAssembly({...state,activeWorldId:'cave'},'p',[{...units[0],worldId:'cave'},{...units[1],worldId:'cave'}],map).ok,'adjacent cave assembly');
        check(!rules.inspectV39SquadAssembly(state,'p',[units[0],{...units[1],worldId:'cave'}],map).ok,'world isolation');
        check(!editV39Squad(state,'p',{unitIds:['lead','far']},map).ok,'API validates distant joining');
        const before=JSON.stringify(state),ordered=rules.orderV39SquadMovement(state,'p','s','gather');
        check(ordered.ok,'gather accepted');const moved=rules.advanceV39SquadRallies(ordered.state,'p',map,1);
        check(JSON.stringify(state)===before,'input state remains unchanged');
        const faction=moved.state.players[0].factionState,far=faction.units.find(unit=>unit.id==='far');
        const {getHexDistance}=await import('/src/lib/hex-grid.js');
        check(moved.paths.every(path=>path.positions.slice(1).every((point,index)=>getHexDistance(point,path.positions[index])===1)),'each movement frame is one real tile');
        check(new Set(faction.units.map(unit=>`${unit.x},${unit.y}`)).size===faction.units.length,'no overlap');
        check(far.x<9&&far.x>2&&far.ap===0,'normal path consumes AP without teleport');
        check(movement.resolveV39SquadMovementGroup(faction,'lead').participantIds.length===2,'pending/AP0 does not block ready party');
        const twice=rules.advanceV39SquadRallies(moved.state,'p',map,1);check(twice.paths.length===0,'no double automatic move');
        const scatter=rules.orderV39SquadMovement(moved.state,'p','s','scatter').state;
        check(scatter.players[0].factionState.units.every(unit=>unit.squadId==='s'&&unit.squadMoveMode==='independent'),'scatter retains affiliation');
        check(movement.resolveV39SquadMovementGroup(scatter.players[0].factionState,'near').participantIds.join()==='near','independent move');
        const cave=structuredClone(ordered.state);cave.activeWorldId='cave';cave.players[0].factionState.settlements=[];
        cave.players[0].factionState.units.forEach(unit=>unit.worldId='cave');cave.players[0].factionState.squads[0].rallyPoint.worldId='cave';
        const wallMap={...map,isUnderground:true,grid:map.grid.map(row=>row.map((_,x)=>x===5?'岩壁':'洞窟'))};
        const blocked=rules.advanceV39SquadRallies(cave,'p',wallMap,1).state.players[0].factionState.units.find(unit=>unit.id==='far');
        check(blocked.x===9&&blocked.ap===100&&blocked.squadGather.status==='blocked','cave wall blocks without consuming AP');
        const npcMap={...wallMap,grid:wallMap.grid.map((row,y)=>row.map(()=>y===2?'洞窟':'岩壁')),caveEventNpc:{x:5,y:2}};
        const npcBlocked=rules.advanceV39SquadRallies(cave,'p',npcMap,1).state.players[0].factionState.units.find(unit=>unit.id==='far');
        check(npcBlocked.x===9&&npcBlocked.ap===100,'NPC cannot be crossed or overlapped');
        const battle=structuredClone(ordered.state);battle.enemies=[{id:'enemy',hp:100,x:8,y:2}];
        const engaged=rules.advanceV39SquadRallies(battle,'p',map,1).state.players[0].factionState.units.find(unit=>unit.id==='far');
        check(engaged.x===9&&engaged.ap===100&&engaged.squadGather.reason.includes('敵'),'engaged member pauses rally');
        const freed={...wallMap,grid:wallMap.grid.map(row=>row.map(()=> '洞窟'))};
        const resumed=rules.advanceV39SquadRallies({...cave,players:[{...cave.players[0],factionState:{...cave.players[0].factionState,units:cave.players[0].factionState.units.map(unit=>({...unit,ap:100,currentAp:100}))}}]},'p',freed,2);
        check(resumed.paths.length>0,'next turn resumes on open path');
        const ended=rules.orderV39SquadMovement(moved.state,'p','s','cancel').state.players[0].factionState;
        check(ended.units.find(unit=>unit.id==='far').squadMoveMode==='independent','cancel only pending members');
        check(ended.units.find(unit=>unit.id==='lead').squadMoveMode==='follow','ready members retained');
        const callRules=await import('/src/lib/v39-call-rules.js'),summonRules=await import('/src/lib/v39-summon-rules.js');
        const callSkill={名前:'呼集試験',行動:'A',効果:'呼集_ウルフ_数1',AP消費:10};
        const summonSkill={名前:'召喚試験',行動:'A',効果:'召喚_スケルトン_Lv5_数1',AP消費:10,効果時間:5};
        const magic=structuredClone(state);magic.territoryOwnerByTile['9,2']='p';
        magic.players[0].factionState.units=magic.players[0].factionState.units.map(unit=>unit.id==='lead'
          ?{...unit,techniques:[{source:callSkill},{source:summonSkill}],squadMoveMode:'independent'}:unit.id==='near'
          ?{...unit,squadMoveMode:'gather',squadGather:{status:'waiting-ap',lastProcessedTurn:1}}
          :{...unit,race:'ウルフ',className:'ウルフ',squadId:'solo',squadMoveMode:'independent'});
        magic.players[0].factionState.squads[0].unitIds=['lead','near'];
        magic.players[0].factionState.squads.push({id:'solo',unitIds:['far']});
        const called=callRules.callV39Units(magic,'p','lead','呼集試験',map,['far']);
        check(called.ok,`magic call still reaches distant allies: ${called.reason}`);
        check(called.state.players[0].factionState.units.find(unit=>unit.id==='far').squadMoveMode==='independent','called ally inherits scattered caster mode');
        check(called.state.players[0].factionState.units.find(unit=>unit.id==='near').squadMoveMode==='gather','call does not reorder other members');
        const summoned=summonRules.summonV39Units(magic,'p','lead','召喚試験',map);
        check(summoned.ok,`summon in scattered squad: ${summoned.reason}`);
        check(summoned.created[0].squadMoveMode==='independent','summon inherits scattered caster mode');
        return {geometry:true,pathAp:true,partialParty:true,independent:true,caveWall:true,immutable:true};
      });console.log(JSON.stringify(report));
    }
    await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();
      const faction=window.getV39ActiveFactionState(),base=faction.units[0];
      const units=[['lead',4],['near',3],['far',11]].map(([id,x])=>({...base,id,name:{lead:'先頭',near:'遊撃兵',far:'合流兵'}[id],x,y:5,worldId:'surface',hp:100,currentHp:100,ap:100,currentAp:100,maxAp:100,status:{...base.status,移動:10},squadId:'team',squadMoveMode:'independent',movementHold:false,caveDuty:undefined,transportAssignment:undefined,tradeAssignment:undefined,waitTurnNumber:0,lastActionTurn:0}));
      const map=structuredClone(window.__v39FieldRuntime.mapData);map.worldWrapEnabled=false;map.isUnderground=false;
      map.grid=map.grid.map(row=>row.map(()=> '平地'));map.heightLevelMap=map.grid.map(row=>row.map(()=>0));map.specialMap=map.grid.map(row=>row.map(()=>''));map.lavaMap=map.grid.map(row=>row.map(()=>false));map.riverData=[];
      window.loadV39FieldSnapshot(map,window.__v39FieldRuntime.settings,{layerChange:true});
      window.setV39GameState({enemies:[],enemyNests:[],enemySquads:[],neutralVillages:[]});
      window.updateV39ActiveFactionState({units,squads:[{id:'team',label:'探索部隊',unitIds:units.map(unit=>unit.id),movementLeaderId:'lead'}],selectedUnitId:'lead',recruitInstructorByTile:{},recruitInstructorTransfers:{}});
      window.activateV39FooterTab('squad');await window.waitForV39MapRenderSettled();
    });
    await page.waitForFunction(()=>!window.isV39MapInputLocked?.());
    await page.evaluate(()=>window.openV39SquadEditor({squadId:''}));
    await page.locator('[data-squad-member-filter="all"]').click();
    await page.locator('[data-squad-edit-unit="lead"]').check();
    assert(await page.locator('[data-squad-edit-unit="far"]').isDisabled(),'out-of-range candidate is blacked out');
    assert(await page.locator('[data-squad-edit-unit="near"]').isEnabled());
    await page.screenshot({path:`${out}/assembly-${width}.png`});
    await page.locator('[data-squad-edit-close]').click();
    await page.evaluate(()=>window.commandV39SquadMovement('team','gather'));
    await page.waitForFunction(()=>!window.isV39MapInputLocked?.());
    let result=await page.evaluate(()=>{
      const faction=window.getV39ActiveFactionState();window.startV39SelectedUnitMove();const preview=window.getV39UnitMovePreview();window.cancelV39SelectedUnitMove();return {faction,preview};
    });
    assert.deepEqual(result.preview.unitIds,['lead','near']);
    assert.equal(result.faction.units.find(unit=>unit.id==='far').squadMoveMode,'gather');
    assert(result.faction.units.find(unit=>unit.id==='far').x<11);assert(result.faction.units.find(unit=>unit.id==='far').ap<100);
    await page.evaluate(()=>{window.updateV39ActiveFactionState({selectedUnitId:'near'});window.refreshV39SquadDerivedUI();});
    const controls=page.locator('#squadDetailPane .v39-squad-coordination');
    assert.equal(await page.locator('#squadDetailPane .squad-detail-minihead [data-squad-coordination]').count(),0);
    await page.locator('[data-squad-detail-tab="status"]').click();
    const lineage=await page.locator('#detailAbilitySections .v39-unit-lineage-pair span').evaluateAll(nodes=>nodes.map(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y})));
    assert.equal(lineage[0].y,lineage[1].y);assert(lineage[1].x>lineage[0].x);
    await page.locator('[data-squad-detail-tab="basic"]').click();
    assert(await controls.locator('[data-squad-coordination="follow"]').isDisabled());
    const centers=await controls.locator('[data-squad-coordination="gather"] .technique-icon').evaluate(icon=>{
      const box=icon.getBoundingClientRect(),glyph=icon.querySelector('.technique-icon-glyph').getBoundingClientRect();
      return {x:Math.abs(box.x+box.width/2-glyph.x-glyph.width/2),y:Math.abs(box.y+box.height/2-glyph.y-glyph.height/2)};
    });assert(centers.x<.6&&centers.y<.6,JSON.stringify(centers));
    await controls.locator('summary').click();
    assert(!await controls.locator('[data-squad-coordination="gather"]').isVisible());
    await page.waitForTimeout(30);
    await page.evaluate(()=>window.refreshV39SquadDerivedUI());
    assert(!await controls.evaluate(node=>node.open));
    await controls.locator('summary').click();
    await page.screenshot({path:`${out}/basic-${width}.png`});
    await controls.locator('[data-squad-coordination="independent"]').click();
    await page.waitForFunction(()=>document.querySelector('#detailBasicList [data-squad-coordination="independent"]')?.disabled);
    await page.evaluate(()=>window.startV39SelectedUnitMove());
    assert.deepEqual(await page.evaluate(()=>window.getV39UnitMovePreview().unitIds),['near']);
    await page.evaluate(()=>{window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:2,y:5}}));document.getElementById('moveOk').click();});
    await page.waitForFunction(()=>!window.isV39MapInputLocked?.());
    result=await page.evaluate(()=>window.getV39ActiveFactionState());
    assert.equal(result.units.find(unit=>unit.id==='near').x,2);assert.equal(result.units.find(unit=>unit.id==='near').squadId,'team');
    assert.equal(result.units.find(unit=>unit.id==='lead').x,4);
    await page.evaluate(()=>window.commandV39SquadMovement('team','scatter'));
    assert(await page.evaluate(()=>window.getV39ActiveFactionState().units.every(unit=>unit.squadMoveMode==='independent')));
    await page.evaluate(()=>{const faction=window.getV39ActiveFactionState();window.updateV39ActiveFactionState({units:faction.units.map(unit=>({...unit,ap:100,currentAp:100}))});window.refreshV39SquadDerivedUI();});
    await page.locator('[data-squad-detail-tab="basic"]').click();
    await controls.locator('[data-squad-coordination="pick"]').click();
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:10,y:5}})));
    await page.waitForFunction(()=>!window.isV39MapInputLocked?.());
    await page.screenshot({path:`${out}/rally-${width}.png`});
    const saved=await page.evaluate(()=>{const before=window.getV39ActiveFactionState();window.importV39SaveJson(window.exportV39SaveJson());const after=window.getV39ActiveFactionState();return {before:before.units.map(unit=>[unit.id,unit.squadMoveMode,unit.x,unit.y,unit.ap]),after:after.units.map(unit=>[unit.id,unit.squadMoveMode,unit.x,unit.y,unit.ap])};});
    assert.deepEqual(saved.after,saved.before,'save retains state and AP');
    await page.evaluate(()=>window.openV39CharacterModal());
    await page.locator('[data-v39-character-tab="squad"]').click();
    await page.locator('#characterModal [data-v39-character-detail-tab="basic"]').click();
    assert(await page.locator('#characterModal .v39-squad-coordination').isVisible());
    assert.equal(await page.locator('#characterModal .v39-char-unit-head [data-squad-coordination]').count(),0);
    await page.screenshot({path:`${out}/modal-basic-${width}.png`});
    await page.locator('#characterModal [data-close]').click();
    if(width===390) {
      const before=await page.evaluate(()=>window.getV39ActiveFactionState().units.find(unit=>unit.id==='lead').x);
      await page.evaluate(async()=>{await window.advanceV39Turn({skipUnactedFocus:true});await window.advanceV39Turn({skipUnactedFocus:true});});
      assert(await page.evaluate(x=>window.getV39ActiveFactionState().units.find(unit=>unit.id==='lead').x>x,before),'actual turn ending continues gathering');
    }
    await page.evaluate(()=>window.commandV39SquadMovement('team','cancel'));
    assert(await page.evaluate(()=>window.getV39ActiveFactionState().units.every(unit=>unit.squadMoveMode!=='gather')));
    if(width===390) {
      await page.evaluate(()=>{
        const faction=window.getV39ActiveFactionState();
        window.updateV39ActiveFactionState({units:faction.units.map(unit=>({...unit,squadMoveMode:unit.id==='far'?'follow':'independent'})),selectedUnitId:'far'});
        window.refreshV39SquadDerivedUI();window.startV39CaveTest(undefined,{seed:'coord-transition',worldId:'coord-cave'});
      });
      await page.waitForFunction(()=>!window.isV39MapInputLocked?.());
      const worlds=await page.evaluate(()=>window.getV39ActiveFactionState().units.map(unit=>[unit.id,unit.worldId]));
      assert.equal(worlds.find(row=>row[0]==='far')[1],'coord-cave');
      assert.equal(worlds.find(row=>row[0]==='lead')[1],'surface','scattered party is not pulled into cave');
      await page.evaluate(()=>window.leaveV39Cave());
      assert(await page.evaluate(()=>window.getV39ActiveFactionState().units.every(unit=>unit.worldId==='surface')));
    }
    assert.deepEqual(errors,[]);console.log(`${width}: native gather/AP, partial party move, independent movement, scatter, map target, cancel and save passed`);
    await page.close();
  }
} finally {await browser.close();}
