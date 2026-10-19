import defaults from '../../../config/v39-fusion-defaults.json';

export const V39_FUSION_MATERIAL_GROUPS = defaults.materialGroups || {};
export function resolveV39FusionRequirementNames(name) {
  return V39_FUSION_MATERIAL_GROUPS[name] || [name];
}
