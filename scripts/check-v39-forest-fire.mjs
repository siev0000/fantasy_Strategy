import assert from 'node:assert/strict';
import {createServer} from 'vite';
const server=await createServer({configFile:false,root:'frontend',server:{middlewareMode:true},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
let damageV39ForestByFire,restoreV39WitheredForest,healV39Forest,spreadV39Wildfires,applyV39FacilityDisasterDamage;
try{
  ({damageV39ForestByFire,restoreV39WitheredForest,healV39Forest}=await server.ssrLoadModule('/src/lib/v39-forest-fire.js'));
  ({spreadV39Wildfires}=await server.ssrLoadModule('/src/lib/v39-wildfire-spread.js'));
  ({applyV39FacilityDisasterDamage}=await server.ssrLoadModule('/src/lib/v39-facility-disaster-damage.js'));
}finally{await server.close();}

const map={w:3,h:3,grid:[['平地','平地','平地'],['平地','森','平地'],['平地','平地','平地']]};
const fire={disasterId:'山火事',damagePower:60,damageTileKeys:['1,1']};
let reports=damageV39ForestByFire(map,[fire]);
assert.equal(reports[0].damage,60);
assert.equal(map.terrainDamage.fireForestByTile['1,1'].hp,40);
assert.equal(map.grid[1][1],'森');
reports=damageV39ForestByFire(map,[fire]);
assert.equal(reports[0].damage,40);
assert.equal(map.terrainDamage.fireForestByTile['1,1'].hp,0);
assert.equal(map.grid[1][1],'荒野');
assert.deepEqual(damageV39ForestByFire(map,[fire]),[]);
assert.equal(restoreV39WitheredForest(map,1,1),true);
assert.equal(map.grid[1][1],'森');
assert.equal(map.terrainDamage.fireForestByTile['1,1'],undefined);
damageV39ForestByFire(map,[fire]);damageV39ForestByFire(map,[fire]);
assert.equal(map.grid[1][1],'荒野');
assert.equal(healV39Forest(map,['1,1'],40)[0].hp,40);
assert.equal(map.grid[1][1],'荒野');
assert.equal(healV39Forest(map,['1,1'],40)[0].hp,80);
assert.equal(map.grid[1][1],'荒野');
assert.equal(healV39Forest(map,['1,1'],40)[0].hp,100);
assert.equal(map.grid[1][1],'森');
assert.equal(map.terrainDamage.fireForestByTile['1,1'],undefined);
const magic={...fire,damagePower:120};
damageV39ForestByFire(map,[magic]);
assert.equal(map.grid[1][1],'荒野');
const grove={w:5,h:5,grid:Array.from({length:5},()=>Array(5).fill('森'))};
const source={...fire,id:'fire:1',x:2,y:2,anchorKey:'2,2',tileKeys:['2,2'],startsAtTurn:1,expiresAtTurn:2,lastTickTurn:0};
assert.equal(spreadV39Wildfires(grove,[source],1,()=>0.2).length,0);
const spread=spreadV39Wildfires(grove,[source,source],1,()=>0);
assert.equal(spread.length,6);
assert.equal(new Set(spread.map(event=>event.anchorKey)).size,6);
assert.ok(spread.every(event=>event.tileKeys.length===1&&event.radius===0&&event.spreadFrom==='2,2'));
assert.equal(spreadV39Wildfires(grove,spread,1,()=>0).length,0);
assert.ok(spreadV39Wildfires(grove,spread,2,()=>0).length>0);
const sharedMap={w:3,h:3,grid:[['平地','平地','平地'],['平地','森','平地'],['平地','平地','平地']]};
const base={id:'base',settlementId:'base',placed:true,worldId:'surface',tileFacilityMap:{'1,1':['農場']},
  facilityStateByTile:{'1,1':{農場:{hp:100,maxHp:100}}}};
const sharedState={activeWorldId:'surface',players:[{id:'p1',factionState:{settlements:[base]}}],neutralVillages:[],
  territoryOwnerByTile:{'1,1':'p1'},territoryStateByTile:{'1,1':{settlementId:'base'}}};
const sharedFire={...fire,id:'forest-facility-fire',name:'山火事',tileKeys:['1,1'],details:{}};
const forestHit=damageV39ForestByFire(sharedMap,[sharedFire],100,sharedState);
const facilityHit=applyV39FacilityDisasterDamage(sharedState,[sharedFire],1);
assert.equal(forestHit[0].damage,60);
assert.equal(facilityHit.entries[0].damage,forestHit[0].damage);
assert.equal(facilityHit.players[0].factionState.settlements[0].facilityStateByTile['1,1'].農場.hp,40);
console.log('forest-fire: OK');
