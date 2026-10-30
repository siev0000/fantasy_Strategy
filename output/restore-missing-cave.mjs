import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const current=JSON.parse(readFileSync('C:/Users/skkt3/Downloads/fantasy-strategy-2026-10-26T04-48-25.867Z.json','utf8'));
const backup=JSON.parse(readFileSync('C:/Users/skkt3/Downloads/fantasy-strategy-2026-10-26T01-07-33.880Z.json','utf8'));
assert.deepEqual(current.gameState.players.map(p=>p.id),backup.gameState.players.map(p=>p.id));assert.equal(current.field.mapData.seed,backup.field.mapData.seed);
const original=structuredClone(current),restored=[];
for(const p of current.gameState.players)for(const u of p.factionState.units){const id=u.worldId||'surface';if(id==='surface'||current.gameState.explorationWorlds[id]?.map)continue;assert(backup.gameState.explorationWorlds[id]?.map,`No backup for ${id}`);current.gameState.explorationWorlds[id]=structuredClone(backup.gameState.explorationWorlds[id]);restored.push(id);}
assert(restored.length);const expected=structuredClone(current);for(const id of restored)delete expected.gameState.explorationWorlds[id];assert.deepEqual(expected,original);
writeFileSync('output/fantasy-strategy-T24-cave-recovered.json',JSON.stringify(current));console.log({restored,turn:current.gameState.timeline.turnNumber,sourceTurn:backup.gameState.timeline.turnNumber});
