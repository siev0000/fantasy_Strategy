// Names are generated exclusively from the JSON exported from @game_data.
export const NAME_MAX_LENGTH = 20;

const asText = value => String(value ?? "").trim();
const genderMatches = (value, gender) => {
  const wordGender = asText(value) || "共通";
  return wordGender === "共通" || gender === "共通" || wordGender === gender;
};
const randomIndex = (size, random) => Math.max(0, Math.min(size - 1, Math.floor(random() * size)));

function chooseDistinct(candidates, count, random) {
  const items = [...candidates];
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1, random);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items.slice(0, count);
}

export function generateNameResults({
  race,
  gender = "共通",
  count = 1,
  mode = "words",
  lexicon = [],
  races = [],
  random = Math.random
} = {}) {
  const raceName = asText(race);
  const requested = Math.max(1, Math.min(10, Math.trunc(Number(count) || 1)));
  if (!raceName) return [];

  if (mode === "presets") {
    const raceRow = races.find(row => asText(row?.key) === raceName || asText(row?.name) === raceName);
    if (!raceRow) return [];
    const male = Array.isArray(raceRow["男性名候補"]) ? raceRow["男性名候補"] : [];
    const female = Array.isArray(raceRow["女性名候補"]) ? raceRow["女性名候補"] : [];
    const names = gender === "男性系" ? male : gender === "女性系" ? female : [...male, ...female];
    const unique = [...new Set(names.map(asText).filter(name => name && [...name].length <= NAME_MAX_LENGTH))];
    return chooseDistinct(unique.map(name => ({name, meaning: "登録済み候補（語源未設定）", parts: [], mode: "presets"})), requested, random);
  }

  const words = (Array.isArray(lexicon) ? lexicon : [])
    .filter(row => row && row["種族"] === raceName && row["使用可"] === true && genderMatches(row["性別傾向"], gender))
    .filter(row => ["接頭語", "接尾語", "両用"].includes(row["区分"]))
    .map(row => ({word: asText(row["語"]), meaning: asText(row["意味"]), kind: row["区分"], gender: asText(row["性別傾向"])}))
    .filter(row => row.word && row.meaning);
  const prefixes = words.filter(word => word.kind === "接頭語" || word.kind === "両用");
  const suffixes = words.filter(word => word.kind === "接尾語" || word.kind === "両用");
  const combinations = new Map();
  for (const first of prefixes) for (const second of suffixes) {
    if (first === second || first.word === second.word) continue;
    const name = first.word + second.word;
    if ([...name].length > NAME_MAX_LENGTH) continue;
    if (combinations.has(name)) continue;
    combinations.set(name, {
      name,
      meaning: first.meaning + " ＋ " + second.meaning,
      parts: [{word:first.word, meaning:first.meaning}, {word:second.word, meaning:second.meaning}],
      mode: "words"
    });
  }
  return chooseDistinct([...combinations.values()], requested, random);
}
