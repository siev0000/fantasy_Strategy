import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/insect-undead';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
  const report=await page.evaluate(async()=>{
    const {INSECT_ARTWORK}=await import('/src/lib/insect-artwork-config.js');
    const {resolveAnimalArtworkReference:animal}=await import('/src/lib/animal-artwork-config.js');
    const {resolveUndeadArtworkReference:undead}=await import('/src/lib/undead-artwork-config.js');
    const {resolveMonsterSheetArtwork:art}=await import('/src/lib/monster-sheet-artwork.js');
    const {canV39SpeciesBecomeUndead:allowed}=await import('/src/lib/v39-undead-species-rules.js');
    const {buildV39UndeadInheritance:inherit}=await import('/src/lib/v39-undead-inheritance.js');
    const {convertV39CorpsesInDeathFog:convert}=await import('/src/lib/v39-corpse-undead-rules.js');
    const checks=Object.entries(INSECT_ARTWORK).map(([race,[file,base]])=>{
      const variants=['ヴァンパイア','ゾンビ'].map((className,i)=>{
        const unit={race,className,level:20,strongAnimalClassName:'フレイムアニマル',
          imageFile:file,imageIndex:base};
        return {expected:[file,base+4+i],animal:animal(unit),undead:undead(unit),art:art(unit)?.sheetFrame,
          inherited:art({race,className:'フレイムアニマル',prerequisiteClassLevels:{[className]:2}})?.sheetFrame};
      });
      return {race,variants,skeleton:allowed({race},'スケルトン'),skeletonArt:animal({race,className:'スケルトン'})};
    });
    const original={id:'insect-corpse',race:'アリ',className:'アリ',level:20,x:2,y:2,state:'死亡',hp:0,currentHp:0,equipment:[]};
    const map={w:5,h:5,grid:Array.from({length:5},()=>Array(5).fill('平原')),
      purificationByTile:{'2,2':-5},fogMap:Array.from({length:5},()=>Array(5).fill({kind:'death',createdAtTurn:1,sourceKey:'2,2'}))};
    const state={players:[],enemies:[original],activeWorldId:'surface',worldEnvironment:{}};
    const createEnemy=args=>({...args,hp:100,currentHp:100});
    const natural=[0,0.5,0.99].map(random=>convert(state,map,2,{createEnemy,random:()=>random}).spawned.map(row=>row.enemy.className));
    const rejected=convert(state,map,2,{createEnemy,corpseIds:new Set([original.id]),undeadClass:'スケルトン',random:()=>0});
    const vampire=convert(state,map,2,{createEnemy,corpseIds:new Set([original.id]),undeadClass:'ヴァンパイア',random:()=>0});
    return {checks,natural,rejected:{spawned:rejected.spawned.length,corpse:rejected.enemies.some(u=>u.id===original.id)},
      skeleton:inherit(original,'スケルトン'),vampire:vampire.spawned[0]?.enemy,
      human:allowed({race:'ヒューマン'},'スケルトン'),
      mixed:animal({race:'ボア',className:'ゾンビ',strongAnimalClassName:'フレイムアニマル'}),
      zero:animal({race:'アリ',className:'アリ',prerequisiteClassLevels:{ゾンビ:0}}),
      original};
  });
  for(const row of report.checks){
    assert.equal(row.skeleton,false,row.race);assert.equal(row.skeletonArt,null,row.race);
    for(const v of row.variants)for(const key of ['animal','undead','art','inherited'])assert.deepEqual([v[key]?.fileName,v[key]?.slotNumber],v.expected,`${row.race}/${key}`);
  }
  assert.deepEqual(report.natural,[['ゾンビ'],['ゾンビ'],['ゾンビ']]);
  assert.deepEqual(report.rejected,{spawned:0,corpse:true});assert.equal(report.skeleton,null);
  assert.equal(report.vampire.race,'アリ');assert.equal(report.vampire.className,'ヴァンパイア');
  assert(report.human);assert.equal(report.mixed.slotNumber,12);assert.equal(report.zero.slotNumber,1);
  assert.equal(report.original.hp,0);
  await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();
    const f=window.getV39ActiveFactionState(),template=f.units[0],map=window.__v39FieldRuntime.mapData;
    for(let y=5;y<=10;y++)for(let x=5;x<=11;x++){
      map.grid[y][x]='平原';if(map.heightMap?.[y])map.heightMap[y][x]=0;
      if(map.specialMap?.[y])map.specialMap[y][x]=null;if(map.wallMap?.[y])map.wallMap[y][x]=null;
    }
    const units=['アリ','アリ','ビートル','ビートル'].map((race,i)=>window.applyV39DerivedCharacterData({
      ...template,id:`insect-undead-test-${i}`,name:`${race}・${i%2?'ゾンビ':'ヴァンパイア'}`,
      race,className:i%2?'ゾンビ':'ヴァンパイア',level:20,x:7+i,y:7,position:[7+i,7],
      equipment:[],prerequisiteClassLevels:{},strongAnimalClassName:'',fusionGrowth:null,
      imageFile:'アント・ビー_ユニット集.webp',imageIndex:1
    }));
    window.updateV39ActiveFactionState({units,squads:[{id:'insect-test',unitIds:units.map(u=>u.id)}],selectedUnitId:units[0].id});
    window.setV39GameState({enemies:[],enemySquads:[],neutralVillages:[]},{reason:'insect-undead-test'});
    window.activateV39FooterTab('squad');window.refreshV39SquadDerivedUI();
    window.focusV39FieldPosition?.(8,7);
    await window.waitForV39MapRenderSettled();
  });
  await page.waitForFunction(()=>[0,1,2,3].every(i=>window.getV39MapEntityMarker(`insect-undead-test-${i}`)?.list.some(c=>c.type==='Image'&&String(c.frame.name).endsWith(`-${i%2?6:5}`))));
  await page.screenshot({path:`${out}/field-1100.png`});
  const saved=await page.evaluate(async()=>{
    window.importV39SaveJson(window.exportV39SaveJson());
    const {resolveMonsterSheetArtwork:art}=await import('/src/lib/monster-sheet-artwork.js');
    return window.getV39ActiveFactionState().units.map(u=>art(u)?.sheetFrame.slotNumber);
  });
  assert.deepEqual(saved,[5,6,5,6]);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${out}/field-390.png`});
  assert.deepEqual(errors,[]);
  console.log('12 insect species vampire/zombie frames, undead priority, inherited classes, skeleton exclusion, natural/magic conversion, native markers and save passed');
}finally{await browser.close();}
