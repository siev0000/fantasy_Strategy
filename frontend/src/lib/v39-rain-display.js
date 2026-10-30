import config from '../../../config/v39-atmosphere-display.json';
import {V39_RAIN_STRENGTHS,v39RainStrengthForWeather,resolveV39RainConditions,getV39RainStrengthAt} from './v39-rain-rules.js';
export const V39_RAIN_DISPLAY=config.rain;
const styleFor=tile=>config.rain.types[tile.strength||v39RainStrengthForWeather(tile.type)];

export function collectV39RainTiles(data,state){
  if(!data?.grid||data.isUnderground||data.hegemonyInterior)return [];
  const weather=state?.worldEnvironment?.weather,profile=data.climateProfile;
  const validWeather=weather&&profile&&weather.profileId===profile.id;
  const conditions=resolveV39RainConditions(data,weather);
  const overrides=new Map();
  for(const area of validWeather?weather.disasterAreas||[]:[])for(const key of area.tileKeys||[])if(!overrides.has(key))overrides.set(key,area.weather);
  const result=[];
  for(let y=0;y<data.h;y++)for(let x=0;x<data.w;x++){
    const key=`${x},${y}`,regionId=`${Math.floor(x/(profile?.regionSize||1))},${Math.floor(y/(profile?.regionSize||1))}`;
    let type=overrides.get(key)||(validWeather?weather.regions?.[regionId]?.weather:null);
    if(data.snowfallMap?.[y]?.[x]===true&&!overrides.has(key)&&!config.rain.snowByWeather[type])type='雪';
    const strength=config.rain.snowByWeather[type]||getV39RainStrengthAt(data,conditions,x,y);
    if(config.rain.types[strength])result.push({key,x,y,type,strength});
  }
  return result;
}
export function isV39PointInsideRainHex(x,y,hex){
  if(x<0||x>hex.width||y<0||y>hex.height)return false;
  const corner=hex.height-hex.rowStep,edge=Math.min(y,hex.height-y);
  return edge>=corner||Math.abs(x-hex.width/2)<=hex.width/2*edge/corner;
}
export function buildV39RainStreaks(tiles,time,hex){
  const total=tiles.reduce((sum,tile)=>sum+(styleFor(tile)?.count||0),0);
  const stride=Math.max(1,Math.ceil(total/config.rain.maximumStreaks)),result=[];let index=0;
  for(const tile of tiles){
    const style=styleFor(tile);if(!style)continue;
    const angle=(style.angleDegrees??V39_RAIN_STRENGTHS[tile.strength||v39RainStrengthForWeather(tile.type)]?.angleDegrees??0)*Math.PI/180;
    const driftX=Math.sin(angle),driftY=Math.cos(angle);
    const seed=(tile.x*137+tile.y*359)>>>0;
    for(let i=0;i<style.count;i++,index++){
      if(index%stride)continue;
      if(style.kind==='snow'){
        const speed=style.speed;
        const x=((seed*13+i*23+time*speed*driftX+Math.sin(time/700+i+seed)*style.sway)%hex.width+hex.width)%hex.width;
        const y=((seed*7+i*31+time*speed*driftY)%hex.height+hex.height)%hex.height;
        const extent=style.radius+(style.outlineWidth||0)/2;
        if(!isV39PointInsideRainHex(x-extent,y-extent,hex)||!isV39PointInsideRainHex(x+extent,y+extent,hex))continue;
        const left=tile.x*hex.width+(tile.y%2?hex.oddRowOffsetX:0),top=tile.y*hex.rowStep;
        result.push({kind:'snow',x1:left+x,y1:top+y,radius:style.radius,color:style.color,opacity:style.opacity,
          outlineColor:style.outlineColor,outlineWidth:style.outlineWidth,outlineOpacity:style.outlineOpacity,key:tile.key});
        continue;
      }
      const x=((seed*13+i*23-time*config.rain.speed*driftX)%hex.width+hex.width)%hex.width;
      const y=((seed*7+i*31+time*config.rain.speed*driftY)%hex.height+hex.height)%hex.height;
      const endX=x-style.length*driftX,endY=y+style.length*driftY;
      if(!isV39PointInsideRainHex(x,y,hex)||!isV39PointInsideRainHex(endX,endY,hex))continue;
      const left=tile.x*hex.width+(tile.y%2?hex.oddRowOffsetX:0),top=tile.y*hex.rowStep;
      result.push({x1:left+x,y1:top+y,x2:left+endX,y2:top+endY,key:tile.key});
    }
  }
  return result;
}
