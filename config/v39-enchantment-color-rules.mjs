export const V39_ENCHANTMENT_COLOR_FIELDS = ["bodyColor", "outlineColor"];

export function normalizeV39EnchantmentColor(value) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toLowerCase() : "";
}

export function groupV39EnchantmentColors(rows) {
  const groups = new Map();
  const keysByAbility = new Map();
  for (const row of rows) {
    const name = String(row.付与能力 ?? "").trim();
    if (!name) continue;
    const key = String(row.付与系統 ?? "").trim() || name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({name, stage:Number(row.段階) || 1});
    keysByAbility.set(name, key);
  }
  for (const stages of groups.values()) stages.sort((left, right) => left.stage - right.stage);
  return {groups, keysByAbility};
}

export function readV39EnchantmentColors(stored, groups) {
  return new Map([...groups].map(([key, stages]) => {
    const entry = Object.hasOwn(stored, key) ? stored[key] : null;
    const oldColor = stages.map(({name}) => normalizeV39EnchantmentColor(stored[name]?.color)).find(Boolean);
    return [key, {
      bodyColor:normalizeV39EnchantmentColor(entry?.bodyColor) || oldColor || normalizeV39EnchantmentColor(entry?.color),
      outlineColor:normalizeV39EnchantmentColor(entry?.outlineColor)
    }];
  }));
}

export function pickV39EnchantmentColors(abilities, colors, keysByAbility) {
  const settings = abilities.map(name => colors.get(keysByAbility.get(name) ?? name));
  return Object.fromEntries(V39_ENCHANTMENT_COLOR_FIELDS.map(field =>
    [field, settings.find(setting => setting?.[field])?.[field] || ""]
  ));
}
