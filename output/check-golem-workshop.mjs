import assert from 'node:assert/strict';
import {createServer} from 'vite';
globalThis.window={addEventListener(){}};
const vite=await createServer({configFile:false,root:'frontend',server:{middlewareMode:true},appType:'custom'});
try {
 const {orderV39Golem,advanceV39GolemOrders,matchesV39GolemTerrain}=await vite.ssrLoadModule('/src/lib/v39-golem-workshop.js');
 const workshop='ゴーレム工房（小）',tileKey='3,3';
 const base={id:'base',settlementId:'base',placed:true,x:3,y:3,materialStockByType:{石材:20,金:10,宝石:1},tileFacilityMap:{[tileKey]:[workshop]}};
 const creator={id:'u',x:3,y:3,hp:100,skillLevels:{制作:150}};
 const state={activePlayerId:'p',timeline:{phase:'player',turnNumber:1},territoryOwnerByTile:{[tileKey]:'p'},players:[{id:'p',factionState:{settlements:[base],units:[creator]}}]};
 const order=orderV39Golem(state,{settlementId:'base',tileKey,facilityName:workshop,size:0,creatorId:'u'});
 assert.equal(order.order?.remainingTurns,12,order.reason);
 assert.equal(order.state.players[0].factionState.settlements[0].materialStockByType.石材,0);
 const map={w:8,h:8,grid:Array.from({length:8},()=>Array(8).fill('平地')),heightLevelMap:[]};
 map.grid[3][4]='雪原';
 assert.equal(matchesV39GolemTerrain(map,tileKey,workshop,['雪原']),false);
 assert.equal(matchesV39GolemTerrain(map,tileKey,'ゴーレム工房（中）',['雪原']),true);
 map.grid[3][4]='平地';map.grid[3][5]='雪原';
 assert.equal(matchesV39GolemTerrain(map,tileKey,'ゴーレム工房（中）',['雪原']),false);
 assert.equal(matchesV39GolemTerrain(map,tileKey,'ゴーレム工房（大）',['雪原']),true);
 let current=order.state;
 for(let turn=2;turn<=13;turn++)current=advanceV39GolemOrders(current,map,turn);
 const unit=current.players[0].factionState.units.find(unit=>unit.id===order.order.id);
 assert.equal(unit?.level,15,JSON.stringify(current.players[0].factionState.golemOrders));
 assert.equal(unit.status.SIZ,200);
 console.log('PASS: workshop order, materials, production speed, deployment and fixed size');
}finally{await vite.close();}
