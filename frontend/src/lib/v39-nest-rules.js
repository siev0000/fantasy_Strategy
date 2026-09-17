export const V39_INITIAL_NEST_TERRITORY_RADIUS = 2;

const text = (value, fallback = "") => String(value ?? "").trim() || fallback;

export function formatV39NestName(race, sequence = 1) {
  return `${text(race, "モンスター")}の巣${Math.max(1, Math.floor(Number(sequence) || 1))}`;
}

export function nextV39NestSequence(nests = [], race = "") {
  const target = text(race, "モンスター");
  return nests.filter(nest => text(nest?.race, "モンスター") === target).length + 1;
}

export function resolveV39NestRadiusForScale(scaleLevel = 1) {
  return V39_INITIAL_NEST_TERRITORY_RADIUS + Math.max(0, Math.floor(Number(scaleLevel) || 1) - 1);
}
