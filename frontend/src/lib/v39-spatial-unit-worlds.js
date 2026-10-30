// Spatial arrays belong to their containing map; player units are cross-world and must not be inferred here.
export function normalizeV39SpatialUnitWorlds(spatial={},worldId='surface'){
  const tag=unit=>unit?.worldId?unit:{...unit,worldId};
  const rows=value=>Array.isArray(value)?value.filter(Boolean):[];
  return {...spatial,enemies:rows(spatial.enemies).map(tag),
    neutralVillages:rows(spatial.neutralVillages).map(v=>({...v,defenseUnits:rows(v.defenseUnits).map(tag)}))};
}

export function normalizeV39SavedWorldUnitIds(worlds={}){
  return Object.fromEntries(Object.entries(worlds).map(([id,world])=>[id,
    world?.spatial?{...world,spatial:normalizeV39SpatialUnitWorlds(world.spatial,id)}:world]));
}
