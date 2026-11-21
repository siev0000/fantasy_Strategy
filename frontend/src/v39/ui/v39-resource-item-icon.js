import {resolveV39ResourceIconGlyph} from "../../lib/resource-icon-glyphs.js";
import {getGameDataRows} from "../../lib/game-data-registry.js";
import {getV39ResourceIconRows} from "../../lib/v39-resource-icon-rows.js";
import {renderV39IconAssignment, resolveV39IconAssignment} from "../../lib/v39-icon-assignment.js";
import {getV39SharedIconRow} from "../../lib/v39-shared-icon-settings.js";
import "./v39-resource-item-icon.css";

const resourceRows = new Map(getV39ResourceIconRows().map(row=>[row.データ分類,row]));
const toolRows = new Map(getGameDataRows("道具").map(row=>[row.名前,row]));

export function getV39ResourceAssignment(name,{tool=false}={}){
  const key=String(name??"").trim();
  const types=tool?["道具","資源・資材"]:["資源・資材","道具"];
  for(const type of types){
    const shared=getV39SharedIconRow(type,key);
    const row=shared??(type==="道具"?toolRows:resourceRows).get(key);
    const assignment=resolveV39IconAssignment(row);
    if(shared || assignment)return assignment;
  }
  return null;
}

export function renderV39ResourceItemSprite(name,options){
  return renderV39IconAssignment(getV39ResourceAssignment(name,options),"v39-resource-item-sprite");
}
export function renderV39ResourceIcon(name){
  return renderV39ResourceItemSprite(name)||renderV39IconAssignment({glyph:resolveV39ResourceIconGlyph(name)},"v39-resource-item-sprite");
}
