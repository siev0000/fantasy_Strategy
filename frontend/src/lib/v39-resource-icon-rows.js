import {V39_RESOURCE_ICON_DEFS} from "./resource-icon-glyphs.js";
import {getGameDataRows} from "./game-data-registry.js";

const resourceClasses = new Set(["食料","特殊資源","木材","石材","金属","貴金属","宝石"]);

export function getV39ResourceIconRows() {
  const rowsByName = new Map();
  for (const row of getGameDataRows("都市基本データ")) {
    const name = String(row.データ分類 ?? "").trim();
    if (name && resourceClasses.has(row.分類)) rowsByName.set(name, row);
  }
  for (const row of getGameDataRows("特産品")) {
    const name = String(row.名前 ?? "").trim();
    if (name && !rowsByName.has(name)) rowsByName.set(name, {...row, データ分類:name});
  }
  for(const name of Object.keys(V39_RESOURCE_ICON_DEFS)){
    if(!rowsByName.has(name))rowsByName.set(name,{データ分類:name});
  }
  return [...rowsByName.values()];
}
