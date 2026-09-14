export function createSeededRandom(seedValue = "v39-test-seed") {
  const source = String(seedValue);
  let state = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    state ^= source.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  state >>>= 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function runWithSeededRandom(seedValue, callback) {
  const originalRandom = Math.random;
  Math.random = createSeededRandom(seedValue);
  try {
    return callback();
  } finally {
    Math.random = originalRandom;
  }
}
