import {readFileSync} from 'node:fs';
const read=path=>readFileSync(path,'utf8');
const url=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
export const balance=url(read('frontend/src/lib/v39-gameplay-balance.js'));
export const hex=url(read('frontend/src/lib/hex-grid.js'));
export const location=url(read('frontend/src/lib/v39-terrain-location.js'));
const timing=url(read('frontend/src/lib/v39-turn-timing.js'));
const ray=url(read('frontend/src/lib/v39-combat-ray.js').replace('"./hex-grid.js"',JSON.stringify(hex)));
const layout=url(read('frontend/src/lib/v39-cave-layout.js').replace('"./v39-gameplay-balance.js"',JSON.stringify(balance)));
const areas=url(read('frontend/src/lib/v39-cave-areas.js').replace('"./hex-grid.js"',JSON.stringify(hex)).replace('"./v39-cave-layout.js"',JSON.stringify(layout)));
const registry=url('export const getGameDataRows=()=>[];');
const purification=url(read('frontend/src/lib/v39-purification-rules.js').replace('"./v39-gameplay-balance.js"',JSON.stringify(balance)).replace('"./v39-terrain-location.js"',JSON.stringify(location)).replace('"./game-data-registry.js"',JSON.stringify(registry)));
export const fogUrl=url(read('frontend/src/lib/v39-fog-rules.js').replace('"./v39-gameplay-balance.js"',JSON.stringify(balance))
  .replaceAll('"./v39-combat-ray.js"',JSON.stringify(ray)).replace('"./v39-terrain-location.js"',JSON.stringify(location))
  .replace('"./v39-turn-timing.js"',JSON.stringify(timing)).replace('"./hex-grid.js"',JSON.stringify(hex))
  .replace('"./v39-cave-areas.js"',JSON.stringify(areas)).replace('"./v39-purification-rules.js"',JSON.stringify(purification)));
export const corpseUrl=url(read('frontend/src/lib/v39-corpse-undead-rules.js').replace('"./v39-gameplay-balance.js"',JSON.stringify(balance))
  .replace('"./v39-fog-rules.js"',JSON.stringify(fogUrl)).replace('"./v39-terrain-location.js"',JSON.stringify(location)).replace('"./hex-grid.js"',JSON.stringify(hex)));
