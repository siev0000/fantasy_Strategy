export const isV39FieldCorpse=unit=>unit?.state==='死亡'||Number(unit?.hp??unit?.currentHp)<=0;
export const v39FieldUnitDepth=unit=>isV39FieldCorpse(unit)?0:1;
export const v39FieldUnitAngle=unit=>isV39FieldCorpse(unit)?90:0;
export const v39FieldUnitGroupKey=unit=>`${unit.x},${unit.y}:${isV39FieldCorpse(unit)?'corpse':'living'}`;
