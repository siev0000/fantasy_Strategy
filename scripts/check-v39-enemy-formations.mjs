import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/enemy-formations',{recursive:true});
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];
  page.on('pageerror',e=>errors.push(e.stack));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.startV39ExpeditionTest);
  const report=await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();
    const data=window.__v39FieldRuntime.mapData;
    const scenario=(height,strong=false)=>{
      data.riverData={riverSet:new Set()};data.strongMonsterMap=[];data.strongMonsterInfoMap=[];
      for(let y=0;y<data.h;y++){
        data.strongMonsterMap[y]=[];data.strongMonsterInfoMap[y]=[];
        for(let x=0;x<data.w;x++){
          data.grid[y][x]='平地';data.heightLevelMap[y][x]=height;data.specialMap[y][x]='';
          if(data.reliefMap?.[y])data.reliefMap[y][x]='';
          data.lavaMap[y][x]=false;data.strongMonsterMap[y][x]=strong;data.strongMonsterInfoMap[y][x]=null;
        }
      }
      window.setV39GameState({enemies:[],enemyNests:[],enemySquads:[],victoryLandmarksByTile:{}});
      return window.spawnV39Enemies();
    };
    const spawned=scenario(1),armies=spawned.filter(u=>u.combatProfile?.memberCount===3),singles=spawned.filter(u=>!u.combatProfile);
    const {applyV39DerivedCharacterData}=await import('/src/v39/unit/v39-character-derived-rules.js');
    const {computeAttackDamage}=await import('/src/lib/v39-combat-engine.js');
    const army=armies[0],single=applyV39DerivedCharacterData({...army,combatProfile:null});
    const skill={名前:'編成検証',行動:'A',攻撃手段:'牙',物理:100,判定:'攻撃',攻撃回数:1},target={level:1,status:{HP:10000,防御:0,精神:0,回避:0},resistances:{}};
    const hit=u=>computeAttackDamage({attacker:{...u,techniques:[]},target,skillRow:skill,random:()=>0});
    const a=hit(army),s=hit(single);
    const boss=scenario(2,true).filter(u=>u.strongEnemy),extreme=scenario(7).filter(u=>u.spawnLevelBand==='extreme');
    const {getV39EnemySpawnDefinitions,createV39EventEnemy}=await import('/src/v39/ai/v39-enemy-spawn.js');
    const {generateV39CaveMap,populateV39CaveMonsters}=await import('/src/lib/v39-cave-generator.js');
    const cave=generateV39CaveMap({seed:'formation-check',entranceCount:2});
    const caveDefinitions=getV39EnemySpawnDefinitions('洞窟').filter(d=>d.memberCount===3);
    const caveEnemies=populateV39CaveMonsters(cave,caveDefinitions,createV39EventEnemy);
    window.setV39GameState({enemies:spawned,enemyNests:[],enemySquads:[]});
    const before=JSON.stringify(spawned.map(u=>({id:u.id,level:u.level,hp:u.hp,combatProfile:u.combatProfile})));
    window.importV39SaveJson(window.exportV39SaveJson());
    const after=window.getV39GameState().enemies;
    return {armies:armies.map(u=>({id:u.id,level:u.level,members:u.combatProfile.memberCount})),singles:singles.map(u=>u.level),
      doubledHp:army.maxHp===single.maxHp*2,attackCount:a.detail.attackCount,singleAttackCount:s.detail.attackCount,damageTriple:a.total===s.total*3,
      bosses:boss.map(u=>({level:u.level,profile:u.combatProfile})),extreme:extreme.map(u=>({level:u.level,profile:u.combatProfile})),
      cave:caveEnemies.map(u=>({members:u.combatProfile?.memberCount,level:u.level})),
      saved:before===JSON.stringify(after.map(u=>({id:u.id,level:u.level,hp:u.hp,combatProfile:u.combatProfile})))};
  });
  assert(report.armies.length>0&&report.singles.length>0);
  assert(report.armies.every(u=>u.level>=1&&u.level<=10));assert(report.singles.every(lv=>lv>=5&&lv<=15));
  assert(report.doubledHp&&report.damageTriple);assert.equal(report.attackCount,3);assert.equal(report.singleAttackCount,1);
  assert(report.bosses.length&&report.bosses.every(u=>!u.profile&&u.level>=20&&u.level<=25));
  assert(report.extreme.length&&report.extreme.every(u=>!u.profile&&u.level===30));
  assert(report.cave.length&&report.cave.every(u=>u.members===3&&u.level<=10));assert(report.saved);
  await page.evaluate(()=>window.waitForV39MapRenderSettled?.());
  await page.waitForFunction(id=>window.getV39MapEntityMarker(id)?.list.some(child=>child.type==='Text'&&child.text==='3'),report.armies[0].id);
  await page.evaluate(()=>window.activateV39FooterTab('squad'));
  for(let i=0;i<3;i++)await page.locator('[data-map-zoom="in"]').click();
  await page.screenshot({path:'output/web-game/enemy-formations/field-1100.png'});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'output/web-game/enemy-formations/field-390.png'});
  assert.deepEqual(errors,[]);console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
