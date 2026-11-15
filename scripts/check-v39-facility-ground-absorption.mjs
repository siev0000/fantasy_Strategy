import assert from 'node:assert/strict';
import {createServer} from 'vite';

const server=await createServer({configFile:false,root:'frontend',server:{middlewareMode:true},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
try{
  const {damageV39Ground,damageV39DisasterGround,V39_TERRAIN_DESTRUCTION_RULES:rules}=await server.ssrLoadModule('/src/lib/v39-terrain-destruction.js');
  const {createV39FacilityGroundAbsorber,applyV39PlannedFacilityDamage}=await server.ssrLoadModule('/src/lib/v39-facility-ground-absorption.js');
  const grid=Array.from({length:7},()=>Array(7).fill('平地'));grid[3][3]='丘陵';
  const map={w:7,h:7,grid,heightLevelMap:Array.from({length:7},()=>Array(7).fill(2))};
  const base={id:'base',settlementId:'base',placed:true,worldId:'surface',x:3,y:3,
    tileFacilityMap:{'3,3':['農場']},facilityStateByTile:{'3,3':{農場:{hp:100,maxHp:100}}}};
  const state={activeWorldId:'surface',players:[{id:'p1',factionState:{settlements:[base]}}],neutralVillages:[],
    territoryOwnerByTile:{'3,3':'p1'},territoryStateByTile:{'3,3':{settlementId:'base'}},facilitiesByTile:{'3,3':['農場']}};
  const absorber=createV39FacilityGroundAbsorber(state,1,'攻撃');
  const attack=damageV39Ground(map,new Map([['3,3',1]]),320,1,state,{...rules,absorbGroundDamage:absorber.absorb});
  assert.equal(absorber.plans[0].damage,100);
  assert.equal(attack.map.terrainDamage.cells['3,3'].hp,480);
  const damaged=applyV39PlannedFacilityDamage(state,absorber.plans);
  assert.equal(damaged.players[0].factionState.settlements[0].facilityStateByTile['3,3'].農場.hp,0);
  const disasterAbsorber=createV39FacilityGroundAbsorber(state,1,'流星落下');
  const meteor=damageV39DisasterGround(map,{disasterId:'流星落下',groundDamageEnabled:true,tileKeys:['3,3']},320,1,state,
    {...rules,absorbGroundDamage:disasterAbsorber.absorb});
  assert.equal(meteor.map.terrainDamage.cells['3,3'].hp,480);
  assert.equal(disasterAbsorber.plans[0].damage,100);
  const blocked=createV39FacilityGroundAbsorber(state,1,'攻撃');
  assert.equal(damageV39Ground(map,new Map([['3,3',1]]),250,1,state,{...rules,absorbGroundDamage:blocked.absorb}).map,map);
  assert.equal(blocked.plans[0].damage,50);
  const stacked={...base,tileFacilityMap:{'3,3':['農場','伐採場']},facilityStateByTile:{'3,3':{
    農場:{hp:70,maxHp:100},伐採場:{hp:70,maxHp:100}}}};
  const stackedState={...state,players:[{...state.players[0],factionState:{settlements:[stacked]}}]};
  const stackedAbsorber=createV39FacilityGroundAbsorber(stackedState,1,'攻撃');
  const stackedHit=damageV39Ground(map,new Map([['3,3',1]]),320,1,stackedState,
    {...rules,absorbGroundDamage:stackedAbsorber.absorb});
  assert.deepEqual(stackedAbsorber.plans.map(plan=>[plan.name,plan.damage]),[['農場',70],['伐採場',50]]);
  assert.equal(stackedHit.map,map);
  console.log('PASS: facility first, terrain receives overflow for attack and disaster');
}finally{await server.close();}
