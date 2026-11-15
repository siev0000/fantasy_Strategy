import assert from 'node:assert/strict';
import {createServer} from 'vite';

const server=await createServer({configFile:false,root:'frontend',server:{middlewareMode:true},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
try{
  const {v39IgnitionChance,igniteV39FireTiles,igniteV39DisasterTiles}=await server.ssrLoadModule('/src/lib/v39-fire-ignition.js');
  assert.equal(v39IgnitionChance('森',50),0.1);
  assert.equal(v39IgnitionChance('平地',200),0.2);
  assert.equal(v39IgnitionChance('海',1000),0);
  assert.equal(v39IgnitionChance('森',1000),1);
  const map={w:3,h:2,grid:[['森','平地','海'],['森','平地','海']]};
  const fire=igniteV39FireTiles(map,[],['0,0','1,0','2,0'],100,2,'attack',()=>0);
  assert.deepEqual(fire.map(event=>event.anchorKey),['0,0','1,0']);
  assert.equal(igniteV39FireTiles(map,fire,['0,0'],100,2,'attack',()=>0).length,0);
  assert.equal(igniteV39FireTiles(map,[],['0,0'],100,2,'attack',()=>0.99).length,0);
  const lightning={id:'lightning',disasterId:'落雷嵐',damageElement:'雷',damagePower:100,
    ignitionPower:100,tileKeys:['0,0','1,0'],damageTileKeys:['0,0'],lastTickTurn:1};
  assert.deepEqual(igniteV39DisasterTiles(map,[lightning],2,()=>0).map(event=>event.anchorKey),['0,0']);
  assert.equal(igniteV39DisasterTiles(map,[{...lightning,lastTickTurn:2}],2).length,0);
  assert.equal(igniteV39DisasterTiles(map,[{...lightning,damageElement:'打撃'}],2).length,0);
  console.log('PASS: fire ignition power, terrain, duplicate, and disaster selection');
}finally{await server.close();}
