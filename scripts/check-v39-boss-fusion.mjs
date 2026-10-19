import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const code=readFileSync('frontend/src/lib/v39-boss-fusion-rules.js','utf8');
const {getV39BossFusionCandidates:choose}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const classes=new Set(['ホース','エンジェル','デヴィル']);
const rows=[{素材:'ホース_1,デヴィル_1',合成結果:'バイコーン',状態:'確定'},
  {素材:'エンジェル_1,ホース_1',合成結果:'ユニコーン',状態:'候補'}];
assert.equal(choose('ホース','ホース',rows,classes).length,2);
for(const invalid of [{...rows[0],状態:'未定'},{...rows[0],素材:'ホース_2,デヴィル_1'},
  {...rows[0],素材:'ホース_1,デヴィル_1,エンジェル_1'},{...rows[0],合成結果:''},
  {...rows[0],素材:'ホース_1,未知_1'}])assert.deepEqual(choose('ホース','ホース',[invalid],classes),[]);
assert.deepEqual(choose('ホース','エンジェル',rows,classes),[]);
assert.deepEqual(choose('ウルフ','ウルフ',rows,classes),[]);
mkdirSync('output/web-game/boss-fusion',{recursive:true});
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(process.env.V39_BASE_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>typeof window.spawnV39Enemies==='function');
  const report=await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();window.setV39TestMode(true);window.startV39ExpeditionTest();
    const {getGameDataRows,classData}=await import('/src/lib/game-data-registry.js');
    const {getV39BossFusionCandidates}=await import('/src/lib/v39-boss-fusion-rules.js');
    const {V39_FUSION_MATERIAL_GROUPS}=await import('/src/lib/v39-fusion-material-types.js');
    const recipes=getGameDataRows('モンスター合成'),names=new Set(classData.map(row=>row.名前));
    const data=window.__v39FieldRuntime.mapData;
    const results=[];
    for(const terrain of ['平地','森','洞窟']){
      data.riverData={riverSet:new Set()};data.strongMonsterMap=[];data.strongMonsterInfoMap=[];
      for(let y=0;y<data.h;y++){
        data.strongMonsterMap[y]=[];data.strongMonsterInfoMap[y]=[];
        for(let x=0;x<data.w;x++){
          data.grid[y][x]=terrain;data.heightLevelMap[y][x]=1;data.specialMap[y][x]='';
          if(data.reliefMap?.[y])data.reliefMap[y][x]='';
          data.lavaMap[y][x]=false;data.strongMonsterMap[y][x]=x%3===0&&y%3===0;
        }
      }
      window.setV39GameState({enemies:[],enemyNests:[],enemySquads:[],victoryLandmarksByTile:{}});
      const enemies=window.spawnV39Enemies(),bosses=enemies.filter(e=>e.strongEnemy);
      results.push({terrain,bosses:bosses.map(e=>({race:e.race,extra:e.strongAnimalClassName,name:e.name,
        matches:getV39BossFusionCandidates(e.race,e.className,recipes,names,V39_FUSION_MATERIAL_GROUPS).some(r=>r.className===e.strongAnimalClassName&&r.name===e.name),
        extraLv:e.strongAnimalClassLevel,level:e.level})),
        ordinary:enemies.filter(e=>!e.strongEnemy).length,ordinaryExtra:enemies.some(e=>!e.strongEnemy&&e.strongAnimalClassName)});
    }
    return results;
  });
  assert.ok(report.flatMap(r=>r.bosses).length>0);
  for(const row of report){
    assert.ok(row.ordinary>0);assert.equal(row.ordinaryExtra,false);
    assert.ok(row.bosses.every(b=>b.matches&&b.extraLv>0&&b.level>=20&&b.level<=25));
  }
  assert.ok(report.flatMap(r=>r.bosses).some(b=>b.race==='ホース'&&b.extra==='デヴィル'));
  assert.ok(report.flatMap(r=>r.bosses).some(b=>b.race==='ホース'&&b.extra==='エンジェル'));
  await page.waitForTimeout(300);
  await page.screenshot({path:'output/web-game/boss-fusion/field.png'});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify(report.map(r=>({...r,bosses:r.bosses.length,variants:[...new Set(r.bosses.map(b=>`${b.race}+${b.extra}→${b.name}`))]})),null,2));
}finally{await browser.close();}
