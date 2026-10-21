import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const browser=await chromium.launch();
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:3024',{waitUntil:'networkidle'});
 const report=await page.evaluate(async()=>{
  const {generateV39Specialties:generate,v39SpecialtyDefinitions}=await import('/src/lib/v39-specialty-rules.js');
  const {ensureV39ClimateProfile,v39ClimateLatitudeAt:latitude}=await import('/src/lib/v39-weather.js');
  const {matchesV39ClimateConditions:match,createV39ClimateLookup}=await import('/src/lib/v39-climate-conditions.js');
  const {applyV39ClimateBiomes}=await import('/src/lib/v39-map-scope.js');
  const map={w:48,h:12,mapScope:'region',grid:Array.from({length:12},()=>Array(48).fill('森')),
   heightLevelMap:Array.from({length:12},()=>Array(48).fill(0))};
  const profile=ensureV39ClimateProfile(map),conditions=[[-10,70],[10,50],[25,70],[35,20]];
  for(const region of Object.values(profile.regions)){const [temperature,humidity]=conditions[Math.floor(region.x/12)];Object.assign(region,{temperature,humidity});}
  const definitions=v39SpecialtyDefinitions().filter(row=>['食料','薬草'].includes(row.分類)||row.名前==='黒木');
  const climateAt=createV39ClimateLookup(map),samples=[],counts={};
  for(let seed=0;seed<20;seed++){
   const options={seed:`climate-${seed}`,definitions,minimumResourceSites:4,playerCount:3,minimumResourceRegionTiles:20};
   const result=generate(map,options);
   if(JSON.stringify(result)!==JSON.stringify(generate(map,options)))throw new Error('unstable placement');
   for(const item of Object.values(result)){
    const def=definitions.find(row=>row.名前===item.name);
    if(!match(def,climateAt(item.x,item.y)))throw new Error(`unsuitable ${item.name} at ${item.x}`);
    counts[item.name]=(counts[item.name]||0)+1;
    if(item.name==='バナナ')samples.push(item.x);
   }
   if(Object.values(result).filter(item=>item.name==='黒木').length<4)throw new Error('material guarantee regressed');
  }
  const sparse={...map,w:12,grid:Array.from({length:12},()=>Array(12).fill('森')),heightLevelMap:Array.from({length:12},()=>Array(12).fill(0)),climateProfile:null};
  for(const region of Object.values(ensureV39ClimateProfile(sparse).regions))Object.assign(region,{temperature:-10,humidity:70});
  const restricted={名前:'試験素材',出現地形:'森',分類:'特殊資源',出現重み:1,最低気温:18};
  const coldRestricted=generate(sparse,{definitions:[restricted],minimumResourceSites:3});
  const banana=definitions.find(row=>row.名前==='バナナ');
  const cave=generate({...sparse,isUnderground:true},{definitions:[{...banana,出現地形:'森'}],minimumResourceSites:0});
  const snow={w:8,h:1,grid:[Array(8).fill('平地')]},temperatures=[4,1,0,-1,-2,-3,-5,-10];
  const snowProfile={regionSize:1,regions:Object.fromEntries(temperatures.map((temperature,x)=>[`${x},0`,{temperature,humidity:50}]))};
  const after=applyV39ClimateBiomes(snow,snowProfile);
  return {counts,samples,coldRestricted:Object.keys(coldRestricted).length,cave:Object.keys(cave).length,
   snow:after.snowCoverMap[0],latitude:[latitude(10,100,'world'),latitude(90,100,'world'),latitude(50,100,'world'),latitude(10,100,'region')],
   zero:match({最低気温:0,最高湿潤度:0},{climateTemperature:0,climateHumidity:0})};
 });
 assert(report.samples.length>0);assert(report.samples.every(x=>x>=24&&x<36));
 for(const name of ['バナナ','リンゴ','オレンジ','キノコ','蜂蜜','薬草'])assert(report.counts[name]>0,name);
 assert.equal(report.coldRestricted,0);assert(report.cave>0);assert(report.zero);
 assert.deepEqual(report.snow,[false,false,true,true,true,true,true,true]);
 assert(Math.abs(report.latitude[0]-.76)<1e-9);assert.equal(report.latitude[0],report.latitude[1]);assert.equal(report.latitude[2],0);assert.equal(report.latitude[3],.8);
 assert.deepEqual(errors,[]);console.log('20 seeds: specialty temperature/humidity, tropical placement, material guarantees, unsuitable supplement exclusion, cave compatibility and snow threshold passed');
}finally{await browser.close();}
