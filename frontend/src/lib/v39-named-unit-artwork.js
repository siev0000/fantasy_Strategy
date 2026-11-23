import {getGameDataRows} from "./game-data-registry.js";
import {resolveNamedUnitSheetFrame,resolveNamedUnitSingleImage} from "./monster-sheet-artwork.js";
import {matchV39PassiveCondition} from "./v39-passive-rules.js";
import {getV39NamedUnitDefinition} from "./v39-named-unit-definitions.js";

export const V39_NAMED_UNIT_POSE = Object.freeze({
  normal:1, attack1:2, attack2:3, guard:4, magic:5, hit:6
});
const skills = new Map(getGameDataRows("スキル一覧").map(row => [row.名前, row]));
const poses = new Map();

export function resolveV39NamedUnitSpecialPose(name, {row, dodged = false} = {}) {
  const conditions = getV39NamedUnitDefinition(name)?.specialConditions ?? [];
  if (dodged) {
    const match = conditions.indexOf("回避");
    return match < 0 ? null : 7 + match;
  }
  if (!row) return null;
  const exact = conditions.findIndex(condition => condition && condition !== "回避" && condition === row.名前);
  if (exact >= 0) return 7 + exact;
  const general = conditions.findIndex(condition => {
    const [field, value] = String(condition ?? "").split(":");
    return !!value && (field === "条件系統" || field === "攻撃手段")
      && matchV39PassiveCondition({[field]:value.trim()}, {}, row).matches;
  });
  return general < 0 ? null : 7 + general;
}

function activeEffectPose(unit, state) {
  const player = state?.players?.find(player => player.factionState?.units?.some(row => row.id === unit.id));
  const effects = player?.factionState?.combatRuntime?.activeEffectsByUnitId?.[unit.id] ?? [];
  const turn = Number(state?.timeline?.turnNumber) || 0;
  for (let index = effects.length - 1; index >= 0; index--) {
    const effect = effects[index];
    if (!effect?.skillName || (effect.expiresAtTurn && Number(effect.expiresAtTurn) <= turn)) continue;
    const row = effect.skillRow ?? skills.get(effect.skillName) ?? {名前:effect.skillName};
    const slot = resolveV39NamedUnitSpecialPose(unit.namedUnit.name, {row});
    if (slot) return slot;
  }
  return null;
}

export function resolveV39NamedUnitArtwork(unit, {normal = false, transformationSkillName, state} = {}) {
  const name = unit?.namedUnit?.name;
  if (!name) return null;
  const definition = getV39NamedUnitDefinition(name);
  const imageFile = typeof definition?.imageFile === "string" ? definition.imageFile.trim() : "";
  const fileName = transformationSkillName
    ? definition?.transformationImages?.[transformationSkillName]
    : imageFile || `${name}.webp`;
  if (typeof fileName !== "string" || !fileName) return null;
  if (!transformationSkillName && definition?.imageFormat === "single") {
    return definition.imageNumber == null
      ? resolveNamedUnitSingleImage(fileName)
      : resolveNamedUnitSheetFrame(fileName,definition.imageNumber);
  }
  const pose = normal ? null : poses.get(unit.id)?.at(-1)?.slot;
  return resolveNamedUnitSheetFrame(fileName, pose ?? activeEffectPose(unit,state) ?? V39_NAMED_UNIT_POSE.normal);
}

export function beginV39NamedUnitPose(unitId, slot) {
  if (!unitId || !slot) return null;
  const entry = {slot};
  const active = poses.get(unitId) ?? [];
  const publish = () => window.dispatchEvent(new CustomEvent("v39:named-unit-pose", {detail:{unitId}}));
  active.push(entry);
  poses.set(unitId, active);
  publish();
  return {
    set(next) {
      if (entry.slot === next || poses.get(unitId) !== active || !active.includes(entry)) return;
      entry.slot = next;
      if (active.at(-1) === entry) publish();
    },
    finish() {
      const index = active.indexOf(entry);
      if (index < 0 || poses.get(unitId) !== active) return;
      const wasVisible = index === active.length - 1;
      active.splice(index, 1);
      if (!active.length) poses.delete(unitId);
      if (wasVisible) publish();
    }
  };
}

if (typeof window !== "undefined") {
  window.addEventListener("v39:field-generated", () => poses.clear());
}
