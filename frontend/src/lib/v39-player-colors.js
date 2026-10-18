import {FACTION_BORDER_COLOR_PALETTE} from './phaser-map-panel-config.js';

export function normalizeV39PlayerColors(value) {
  return Object.fromEntries(Object.entries(value&&typeof value==='object'&&!Array.isArray(value)?value:{})
    .filter(([,color])=>typeof color==='string'&&/^#[0-9a-f]{6}$/i.test(color))
    .map(([id,color])=>[id,color.toLowerCase()]));
}

export function resolveV39PlayerColor(state,playerId,overrides) {
  const index=Math.max(0,(state?.players||[]).findIndex(p=>p.id===playerId));
  const colors=overrides??(typeof window!=='undefined'?window.getV39DisplaySettings?.().playerColors:{});
  const custom=colors?.[playerId];
  if(typeof custom==='string'&&/^#[0-9a-f]{6}$/i.test(custom))return parseInt(custom.slice(1),16);
  if(index<FACTION_BORDER_COLOR_PALETTE.length)return FACTION_BORDER_COLOR_PALETTE[index];
  // Additional factions keep a deterministic color instead of repeating the palette.
  const h=(index*137.508)%360,c=.8,x=c*(1-Math.abs(h/60%2-1)),m=.15;
  const rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
  return rgb.reduce((n,v)=>(n<<8)|Math.round((v+m)*255),0);
}

export const v39PlayerColorHex=color=>`#${color.toString(16).padStart(6,'0')}`;
