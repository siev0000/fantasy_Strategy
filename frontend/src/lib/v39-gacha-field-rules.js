export const V39_GACHA_FIELD_TILES=12;

export function gachaFootprint(siz) {
  if(siz>=1050)return 4;
  if(siz>=700)return 3;
  return siz>=300?2:1;
}

export function fitGachaFighters(fighters,width,height) {
  const left=Math.min(...fighters.map(fighter=>fighter.tile));
  const right=Math.max(...fighters.map(fighter=>fighter.tile+fighter.width));
  const visible=Math.min(V39_GACHA_FIELD_TILES,Math.max(5,right-left+2));
  const tallest=Math.max(...fighters.map(fighter=>fighter.imageSize));
  const tileSize=Math.min(width/visible,height/(tallest+1));
  const worldWidth=tileSize*V39_GACHA_FIELD_TILES;
  const center=width/2-(left+right)*tileSize/2;
  const offset=worldWidth<=width?(width-worldWidth)/2:Math.min(0,Math.max(width-worldWidth,center));
  return {tileSize,offset};
}
