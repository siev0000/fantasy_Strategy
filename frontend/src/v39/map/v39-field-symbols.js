// Field-only pictograms. Names and explanations belong in selection/detail UI.
import {getV39CastSymbolShape} from '../../lib/v39-cast-symbol.js';
export function addV39FieldSymbol(scene,parent,kind,x,y,size,{color=0xffe4a0,name='v39-field-symbol',label=''}={}){
  const g=scene.add.graphics().setPosition(x,y).setScale(size/24).setName(name);
  g.setData('fieldSymbol',kind).setData('description',label);
  g.lineStyle(2.5,color,1).fillStyle(color,1);
  const castShape=getV39CastSymbolShape(kind);
  if(castShape){
    if(castShape.background)g.fillStyle(parseInt(castShape.background.slice(1),16),.95).fillPoints(castShape.lines[0].map(([x,y])=>({x,y})),true).fillStyle(color,1);
    g.lineStyle(kind==='ready'?1:2,color,1);
    for(const path of castShape.lines)g.strokePoints(path.map(([x,y])=>({x,y})),false);
    for(const path of castShape.fills)g.fillPoints(path.map(([x,y])=>({x,y})),true);
    for(const circle of castShape.circles||[]){
      if(circle.fill)g.fillCircle(circle.x,circle.y,circle.radius);
      else g.strokeCircle(circle.x,circle.y,circle.radius);
    }
  }else if(kind==='miss')g.strokeCircle(0,0,8).lineBetween(-11,10,11,-10);
  else if(kind==='blocked')g.strokeRect(-7,-10,14,20).lineBetween(-11,10,11,-10);
  else if(kind==='rubble')g.fillTriangle(-11,8,-4,-6,3,8).fillTriangle(-1,8,6,-9,12,8);
  else if(kind==='warning')g.strokePoints([{x:0,y:-11},{x:11,y:9},{x:-11,y:9}],true).lineBetween(0,-4,0,2).fillCircle(0,6,1.5);
  else if(kind==='pause')g.fillRect(-7,-9,5,18).fillRect(2,-9,5,18);
  else if(kind==='construction'){
    g.lineStyle(5,color,1).lineBetween(-6,10,5,-6);g.fillPoints([{x:-3,y:-9},{x:1,y:-13},{x:12,y:-5},{x:8,y:0}],true);
  }else if(kind==='expansion'){
    g.strokeRect(-4,-4,8,8).fillTriangle(0,-12,-4,-7,4,-7).fillTriangle(0,12,-4,7,4,7).fillTriangle(-12,0,-7,-4,-7,4).fillTriangle(12,0,7,-4,7,4);
  }else if(kind==='housing'||kind==='facility'){
    g.fillTriangle(0,-11,-11,-1,11,-1).strokeRect(-7,0,14,10).lineBetween(0,4,0,10);
  }else if(kind==='nest'){
    g.strokeEllipse(0,4,21,11).fillCircle(-5,0,3).fillCircle(2,-2,3).fillCircle(7,2,3);
  }else if(kind==='guard')g.strokePoints([{x:-9,y:-9},{x:9,y:-9},{x:8,y:3},{x:0,y:11},{x:-8,y:3}],true).lineBetween(0,-6,0,5);
  else if(kind==='wanderer')g.fillEllipse(-5,-3,6,11).fillEllipse(5,4,6,11).fillCircle(-5,-10,2).fillCircle(5,-3,2);
  else if(kind==='swamp'){
    g.strokeEllipse(0,7,22,6).lineBetween(-5,5,-5,-7).lineBetween(5,5,5,-4).lineBetween(-5,-2,-10,-6).lineBetween(5,0,10,-5);
  }else if(kind==='herb')g.fillEllipse(-5,-3,8,13).fillEllipse(5,1,8,13).lineBetween(0,-6,0,11);
  else if(kind==='canyon')g.strokePoints([{x:-8,y:-10},{x:-3,y:-4},{x:-6,y:2},{x:-1,y:10}],false).strokePoints([{x:2,y:-10},{x:7,y:-4},{x:4,y:2},{x:9,y:10}],false);
  else g.strokePoints([{x:0,y:-10},{x:9,y:0},{x:0,y:10},{x:-9,y:0}],true).fillCircle(0,0,2);
  parent?.add(g);return g;
}
