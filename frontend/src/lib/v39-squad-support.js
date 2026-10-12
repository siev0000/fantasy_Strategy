import defaults from "../../../config/v39-expedition-defaults.json";

const living = unit => Number(unit?.hp ?? unit?.currentHp) > 0 && unit?.state !== "死亡";
const hasClass = (unit,name) => unit?.className === name || Number(unit?.classLevels?.[name]) > 0
  || unit?.derivedCharacter?.secondClassName===name || Number(unit?.prerequisiteClassLevels?.[name])>0
  || unit?.classGrowth?.some?.(row => (row.className || row.name) === name);

export function hasV39SquadSupportSources(state) {
  return [...(state.enemies||[]),...(state.players||[]).flatMap(player=>player.factionState?.units||[])]
    .some(unit=>defaults.support.some(rule=>hasClass(unit,rule.クラス)));
}
const sourceCache=new WeakMap();

export function applyV39SquadSupport(unit, state) {
  if (!unit) return unit;
  // デフォルト引数内の optional call は配布ビルドで参照切れになるため、本体で取得する。
  state = state ?? globalThis.window?.getV39EnemyTurnState?.() ?? {};
  const cached=sourceCache.get(state);
  let sources=cached && cached.players===state.players && cached.enemies===state.enemies ? cached.sources : undefined;
  if(sources===undefined){sources=hasV39SquadSupportSources(Array.isArray(state)?{players:state}:state);sourceCache.set(state,{players:state.players,enemies:state.enemies,sources});}
  if(!sources&&!Object.values(unit.squadSupportModifiers || {}).some(value=>value))return unit;
  const status = {...unit.status};
  for (const [key,value] of Object.entries(unit.squadSupportModifiers || {})) status[key]=(Number(status[key])||0)-value;
  const players=Array.isArray(state)?state:state.players || [];
  const owners=[...players,{factionState:{units:state.enemies||[],squads:state.enemySquads||[]}}];
  const owner = owners.find(player => player.factionState?.units?.some(member => member.id === unit.id));
  const squad = owner?.factionState.squads?.find(row => row.unitIds?.includes(unit.id));
  const members = squad ? owner.factionState.units.filter(member => squad.unitIds.includes(member.id) && living(member)
    && (member.worldId || 'surface') === (unit.worldId || 'surface')) : [];
  const modifiers = {};
  if (living(unit)) for (const rule of defaults.support) {
    const eligible = rule.対象 === "自身" ? hasClass(unit,rule.クラス) && members.some(member => member.isSovereign === true)
      : members.some(member => member.id !== unit.id && hasClass(member,rule.クラス));
    if (eligible) for (const [key,value] of Object.entries(rule.補正)) modifiers[key]=(modifiers[key]||0)+value;
  }
  for (const [key,value] of Object.entries(modifiers)) status[key]=(Number(status[key])||0)+value;
  return {...unit,status,squadSupportModifiers:modifiers};
}
