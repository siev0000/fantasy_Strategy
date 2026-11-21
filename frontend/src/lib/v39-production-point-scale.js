export const V39_PRODUCTION_POINT_UNIT = 10;

export function normalizeV39ProductionPointUnits(village) {
  if (!village || village.productionPointUnit === V39_PRODUCTION_POINT_UNIT) return village;
  const factor = V39_PRODUCTION_POINT_UNIT / (Number(village.productionPointUnit) || 1);
  const scale = (row, keys) => ({
    ...row,
    ...Object.fromEntries(keys.filter(key => Object.hasOwn(row, key)).map(key => [key, Math.round((Number(row[key]) || 0) * factor)]))
  });
  return {
    ...village,
    productionPointUnit:V39_PRODUCTION_POINT_UNIT,
    ...(Array.isArray(village.constructionQueue) ? {
      constructionQueue:village.constructionQueue.map(row => row && scale(row, ["workProgress", "workRequired"]))
    } : {}),
    ...(Array.isArray(village.equipmentProductionQueue) ? {
      equipmentProductionQueue:village.equipmentProductionQueue.map(row => row && scale(row, [
        "workProgress", "workRequired", "pendingWork", "magicProgress", "magicRequired", "faithProgress", "faithRequired"
      ]))
    } : {}),
    ...(village.productionWorkUsage ? {productionWorkUsage:scale(village.productionWorkUsage, ["used"])} : {}),
    ...(village.equipmentActionUsage ? {
      equipmentActionUsage:scale(village.equipmentActionUsage, ["craftUsed", "enchantMagicUsed", "enchantFaithUsed"])
    } : {})
  };
}
