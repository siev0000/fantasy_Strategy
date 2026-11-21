export const V39_WEAPON_PHYSICAL_TYPES=Object.freeze(["物理","切断","貫通","打撃"]);
const number=value=>Number.isFinite(Number(value))?Number(value):0;

export function resolveV39WeaponPhysicalPower(item){
  const source=item?.source||{};
  const multiplier=item?.rarityMultiplier??1;
  const legacyPower=Math.round(number(source.威力)*multiplier);
  const typed=V39_WEAPON_PHYSICAL_TYPES.some(type=>source[type]!=null&&source[type]!=="");
  const bonusPower=item?.power==null?0:number(item.power)-legacyPower;
  const power=Object.fromEntries(V39_WEAPON_PHYSICAL_TYPES.map(type=>[
    type,Math.round(number(source[type])*multiplier)+number(item?.enchantAttackFields?.[type])
  ]));
  // 合計列を使う旧装備は物理に入れる。全威力の付与など、正規化済みの加算も物理へ残す。
  power.物理+=(typed?0:legacyPower)+bonusPower;
  return power;
}

export function sumV39WeaponPhysicalPower(item){
  return Object.values(resolveV39WeaponPhysicalPower(item)).reduce((sum,value)=>sum+value,0);
}
