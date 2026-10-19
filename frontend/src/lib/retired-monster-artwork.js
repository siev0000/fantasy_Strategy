// Old saves may retain explicit slots from the retired mixed insect sheet.
const replacementSlots = Object.freeze({
  1:['アンケグ・スコーピオン_ユニット集.webp',1],
  2:['アンケグ・スコーピオン_ユニット集.webp',7],
  3:['スパイダー・センチピード_ユニット集.webp',1],
  4:['スパイダー・センチピード_ユニット集.webp',7],
  5:['カブトムシ・クワガタ_ユニット集.webp',1],
  6:['マンティス・グラスホッパー_ユニット集.webp',1],
  7:['アント・ビー_ユニット集.webp',1],
  8:['アント・ビー_ユニット集.webp',7],
  9:['ワーム_ユニット集.webp',2],
  10:['ワーム_ユニット集.webp',3]
});

export function migrateRetiredMonsterArtwork(reference) {
  if (!reference) return null;
  const file = String(reference.fileName || '').replace(/\\/g,'/').split('/').pop();
  if (!/^昆虫・甲殻・地中生物_ユニット一覧(?:\.[^.]+)?$/u.test(file)) return reference;
  const replacement = replacementSlots[Number(reference.slotNumber)];
  // Unassigned old slots must not fall back to the retired sheet.
  return replacement ? {...reference,fileName:replacement[0],slotNumber:replacement[1],sizeByLevel:false} : null;
}
