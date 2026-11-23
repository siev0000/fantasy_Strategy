import {getGameDataRows} from "./game-data-registry.js";

export const v39NamedUnitDefinitions = getGameDataRows("ネームドユニット");
const byName = new Map(v39NamedUnitDefinitions.map(row=>[row.name,row]));

export function getV39NamedUnitDefinition(name) {
  return byName.get(name);
}
