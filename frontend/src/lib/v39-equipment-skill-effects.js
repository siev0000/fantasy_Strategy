export function parseV39EquipmentSkillNames(effect) {
  return String(effect ?? "").split(/[／/]/u).flatMap(token => {
    const match = token.trim().match(/^獲得スキル[:：]\s*(.+)$/u);
    return match ? [match[1].trim()] : [];
  });
}

export function getV39EquipmentSkillNames(item) {
  return [...new Set([
    ...parseV39EquipmentSkillNames(item?.効果 ?? item?.source?.効果),
    ...(item?.enchantSkillNames ?? [])
  ])];
}
