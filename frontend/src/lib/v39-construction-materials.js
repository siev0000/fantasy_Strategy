import { V39_CONSTRUCTION_MATERIAL_BALANCE } from "./v39-gameplay-balance.js";

const quantity = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

export function resolveV39ConstructionMaterials(baseCost, stock, rules = V39_CONSTRUCTION_MATERIAL_BALANCE.substitutes) {
  const cost = Object.fromEntries(Object.entries(baseCost || {}).map(([key, value]) => [key, quantity(value)]));
  const substitutions = [];
  for (const [source, rule] of Object.entries(rules || {})) {
    const missing = Math.max(0, quantity(baseCost?.[source]) - quantity(stock?.[source]));
    if (!missing || !rule.resource || quantity(rule.amount) <= 0) continue;
    const amount = Math.ceil(missing * quantity(rule.amount));
    cost[source] = Math.min(quantity(baseCost?.[source]), quantity(stock?.[source]));
    cost[rule.resource] = quantity(cost[rule.resource]) + amount;
    substitutions.push({ source, missing, resource:rule.resource, amount });
  }
  return { cost, substitutions };
}
